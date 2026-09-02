import {
  Component,
  input,
  signal,
  computed,
  effect,
  untracked,
  inject,
  ElementRef,
  viewChild,
  OnDestroy
} from '@angular/core';

import { NgTemplateOutlet } from '@angular/common';
import { VideoSegment } from '../../../services/video-segmentation/video-segmentation';
import { MediaFiles } from '../../../services/media-files/media-files';
import { Input, BlobSource, ALL_FORMATS, VideoSampleSink, VideoSample, EncodedPacketSink } from 'mediabunny';

@Component({
  selector: 'app-video-player',
  templateUrl: './video-player.html',
  styleUrl: './video-player.scss',
  imports: [NgTemplateOutlet]
})
export class VideoPlayer implements OnDestroy {
  private readonly mediaFilesService = inject(MediaFiles);

  /**
   * Active video segment to display and play, or null if no segment is loaded.
   */
  public readonly segment = input<VideoSegment | null>(null);

  /**
   * Whether playback should automatically resume when switching between overlapping segments from the same video file.
   */
  public readonly keepPlaying = input<boolean>(true);

  /**
   * Time threshold in seconds from segment boundaries. If playback was near the segment edges, changing segments
   * will start from the beginning of the new segment instead of resuming.
   */
  public readonly edgeThreshold = input<number>(0.5);

  /**
   * Reference to the HTML canvas element used to render decoded video frames.
   */
  protected readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  /**
   * Signal indicating whether video playback is currently active.
   */
  protected readonly isPlaying = signal<boolean>(false);

  /**
   * Signal containing the current playback timestamp in seconds.
   */
  protected readonly currentTime = signal<number>(0);

  /**
   * Signal containing the start timestamp in seconds for the active segment.
   */
  protected readonly playableStartTime = signal<number>(0);

  /**
   * Signal containing the end timestamp in seconds for the active segment.
   */
  protected readonly playableEndTime = signal<number>(0);

  /**
   * Signal indicating whether a video segment is successfully loaded and ready for playback.
   */
  protected readonly isLoaded = signal<boolean>(false);

  /**
   * Computed duration in seconds of the active segment.
   */
  public readonly duration = computed(() => this.playableEndTime() - this.playableStartTime());

  private mediabunnyInput: Input | null = null;
  private videoSink: VideoSampleSink | null = null;
  private packetSink: EncodedPacketSink | null = null;
  private nominalFrameDuration = 1 / 30;
  private currentSamplesIterator: AsyncIterator<VideoSample> | null = null;
  private currentSegment: VideoSegment | null = null;

  private playbackId = 0;
  private loadSegmentId = 0;

  private playbackStartTime = 0;
  private playbackStartCurrentTime = 0;

  /**
   * Creates an instance of VideoPlayer and registers a reactive effect to load or unload segments.
   */
  constructor() {
    effect(() => {
      const seg = this.segment();
      untracked(() => {
        if (seg) {
          this.loadSegment(seg);
        } else {
          this.currentSegment = null;
          this.cleanup();
        }
      });
    });
  }

  /**
   * Angular lifecycle hook that runs when the component is destroyed.
   * Performs cleanup of playback and decoding resources.
   */
  public ngOnDestroy(): void {
    this.cleanup();
  }

  /**
   * Cleans up decoding resources, releases active iterators and input instances,
   * cancels pending frame renders, clears canvas, and resets playback state.
   */
  private cleanup(): void {
    this.isPlaying.set(false);
    this.isLoaded.set(false);
    this.playbackId++;
    this.pendingRenderTime = null;
    this.playableStartTime.set(0);
    this.playableEndTime.set(0);
    this.currentTime.set(0);

    if (this.currentSamplesIterator) {
      const it = this.currentSamplesIterator;
      this.currentSamplesIterator = null;
      try {
        void it.return?.();
      } catch (_e) {
        // Ignore
      }
    }

    if (this.mediabunnyInput) {
      this.mediabunnyInput.dispose();
      this.mediabunnyInput = null;
    }
    this.videoSink = null;
    this.packetSink = null;
    this.nominalFrameDuration = 1 / 30;

    try {
      const canvasEl = this.canvas()?.nativeElement;
      if (canvasEl) {
        const ctx = canvasEl.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        }
      }
    } catch (_e) {
      // Ignore
    }
  }

  /**
   * Loads a new video segment, creates an input decoding source, retrieves video track metadata, configures segment
   * boundaries, and initializes or resumes playback based on configuration.
   *
   * @param segment The video segment to load.
   */
  private async loadSegment(segment: VideoSegment): Promise<void> {
    const prevSegment = this.currentSegment;
    const wasPlaying = this.isPlaying();
    const prevTime = this.currentTime();
    this.currentSegment = segment;

    this.cleanup();
    const id = ++this.loadSegmentId;

    const mediaFiles = this.mediaFilesService.mediaFiles();
    const fileRecord = mediaFiles.find((f) => f.id === segment.fileId);

    if (!fileRecord) {
      return;
    }

    const inputObj = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(fileRecord.file)
    });

    try {
      const videoTrack = await inputObj.getPrimaryVideoTrack();
      if (!videoTrack) {
        inputObj.dispose();
        return;
      }

      if (this.loadSegmentId !== id) {
        inputObj.dispose();
        return;
      }

      this.mediabunnyInput = inputObj;

      const firstTs = await videoTrack.getFirstTimestamp();
      const duration = await videoTrack.computeDuration();

      if (this.loadSegmentId !== id) {
        this.mediabunnyInput.dispose();
        this.mediabunnyInput = null;
        return;
      }

      const newStartTime = segment.startTime === -Infinity ? (firstTs ?? 0) : segment.startTime;
      const newEndTime = segment.endTime === Infinity ? (duration ?? 0) : segment.endTime;

      this.playableStartTime.set(newStartTime);
      this.playableEndTime.set(newEndTime);
      this.videoSink = new VideoSampleSink(videoTrack);
      this.packetSink = new EncodedPacketSink(videoTrack);

      try {
        const metrics = await videoTrack.computeFrameRateMetrics();
        const fps = metrics.bestGuessFrameRate || metrics.averageFrameRate;
        if (fps && fps > 0) {
          this.nominalFrameDuration = 1 / fps;
        }
      } catch (_e) {
        this.nominalFrameDuration = 1 / 30;
      }

      this.isLoaded.set(true);

      const shouldKeepPlaying = this.keepPlaying() && wasPlaying;
      const threshold = this.edgeThreshold();
      const sameFile = prevSegment !== null && prevSegment.fileId === segment.fileId;
      const withinBounds = prevTime >= (newStartTime + threshold) && prevTime <= (newEndTime - threshold);
      const canResumeAtPrevTime = shouldKeepPlaying && sameFile && withinBounds;

      if (canResumeAtPrevTime) {
        this.currentTime.set(prevTime);
      } else {
        this.currentTime.set(newStartTime);
      }

      if (shouldKeepPlaying) {
        this.isPlaying.set(true);
        this.playbackId++;
        this.playLoop(this.playbackId);
      } else {
        await this.renderFrameAtTime(this.currentTime());
      }
    } catch (_e) {
      inputObj.dispose();
      if (this.mediabunnyInput === inputObj) {
        this.mediabunnyInput = null;
      }
    }
  }

  /**
   * Fetches and draws a single decoded video frame at the specified timestamp onto the canvas.
   *
   * @param time The timestamp in seconds of the frame to render.
   */
  private async renderFrameAtTime(time: number): Promise<void> {
    if (!this.videoSink || !this.canvas()) {
      return;
    }
    const canvasEl = this.canvas().nativeElement;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) {
      return;
    }

    try {
      const sample = await this.videoSink.getSample(time);
      if (sample) {
        try {
          if (canvasEl.width !== sample.squarePixelWidth || canvasEl.height !== sample.squarePixelHeight) {
            canvasEl.width = sample.squarePixelWidth;
            canvasEl.height = sample.squarePixelHeight;
          }
          sample.draw(ctx, 0, 0);
          this.currentTime.set(Math.max(this.playableStartTime(), Math.min(this.playableEndTime(), sample.timestamp)));
        } finally {
          sample.close();
        }
      }
    } catch (_e) {
      // Ignore errors from disposal or seeking out of bounds
    }
  }

  /**
   * Toggles playback between playing and paused states.
   * Rewinds to the beginning of the playable segment if toggled while at or past the end.
   */
  public togglePlay(): void {
    if (!this.isLoaded()) {
      return;
    }

    if (this.isPlaying()) {
      this.isPlaying.set(false);
      this.playbackId++;
    } else {
      if (this.currentTime() >= this.playableEndTime()) {
        this.currentTime.set(this.playableStartTime());
      }
      
      this.isPlaying.set(true);
      this.playbackId++;
      this.playLoop(this.playbackId);
    }
  }

  /**
   * Runs the continuous decoding and rendering playback loop synchronized with real time for a given playback session
   * ID.
   *
   * @param id The unique ID of the playback session to prevent stale loops from running concurrently.
   */
  private async playLoop(id: number): Promise<void> {
    if (!this.videoSink || !this.canvas()) {
      if (this.playbackId === id) {
        this.isPlaying.set(false);
      }
      
      return;
    }
    
    const canvasEl = this.canvas().nativeElement;
    const ctx = canvasEl.getContext('2d');
    
    if (!ctx) {
      if (this.playbackId === id) {
        this.isPlaying.set(false);
      }
      
      return;
    }

    this.playbackStartTime = performance.now();
    this.playbackStartCurrentTime = this.currentTime();

    const iterator = this.videoSink.samples(this.currentTime(), this.playableEndTime())[Symbol.asyncIterator]();
    this.currentSamplesIterator = iterator;

    try {
      while (this.isPlaying() && this.playbackId === id) {
        const nextResult = await iterator.next();
        if (nextResult.done || !nextResult.value) {
          break;
        }

        const sample = nextResult.value;
        if (!this.isPlaying() || this.playbackId !== id) {
          sample.close();
          break;
        }

        try {
          if (canvasEl.width !== sample.squarePixelWidth || canvasEl.height !== sample.squarePixelHeight) {
            canvasEl.width = sample.squarePixelWidth;
            canvasEl.height = sample.squarePixelHeight;
          }
          
          sample.draw(ctx, 0, 0);
          this.currentTime.set(sample.timestamp);
        } finally {
          sample.close();
        }

        const targetTime = this.playbackStartTime + ((sample.timestamp - this.playbackStartCurrentTime) * 1000);
        const waitTime = targetTime - performance.now();

        if (waitTime > 0) {
          await new Promise((r) => setTimeout(r, waitTime));
        }

        if (this.currentTime() >= this.playableEndTime()) {
          break;
        }
      }
    } catch (_e) {
      // Ignore errors from disposal or seeking out of bounds
    } finally {
      if (this.currentSamplesIterator === iterator) {
        this.currentSamplesIterator = null;
      }
      
      if (this.playbackId === id) {
        this.isPlaying.set(false);
        this.currentTime.set(this.playableEndTime());
      }
      
      try {
        await iterator.return?.();
      } catch (_e) {
        // Ignore
      }
    }
  }

  /**
   * Seeks forward or backward by the specified time delta (clamped to the playable segment boundaries) and renders the
   * frame at the new position.
   *
   * @param delta The time offset in seconds to adjust the current position by (positive for forward, negative for
   * backward).
   */
  public async seek(delta: number): Promise<void> {
    if (!this.isLoaded()) {
      return;
    }

    const wasPlaying = this.isPlaying();
    this.isPlaying.set(false);
    this.playbackId++;

    this.currentTime.set(
      Math.max(
        this.playableStartTime(),
        Math.min(this.playableEndTime(), this.currentTime() + delta)
      )
    );
    await this.renderFrameAtTime(this.currentTime());

    if (wasPlaying) {
      this.isPlaying.set(true);
      this.playLoop(this.playbackId);
    }
  }

  /**
   * Steps forward or backward by a single frame using exact packet presentation timestamps
   * from the video track, falling back to estimated frame rate metrics if packet lookup is unavailable.
   *
   * @param direction `'forward'` / `1` to step forward one frame, or `'backward'` / `-1` to step backward one frame.
   */
  public async stepFrame(direction: 'forward' | 'backward' | 1 | -1): Promise<void> {
    if (!this.isLoaded()) {
      return;
    }

    const dir = direction === 'forward' || direction === 1 ? 1 : -1;

    this.isPlaying.set(false);
    this.playbackId++;

    let targetTime: number | null = null;
    const curr = this.currentTime();
    const fallbackDelta = this.nominalFrameDuration || (1 / 30);

    if (this.packetSink) {
      try {
        const currentPacket = await this.packetSink.getPacket(curr, { metadataOnly: true });
        if (currentPacket) {
          if (dir === 1) {
            const frameDuration = currentPacket.duration > 0 ? currentPacket.duration : fallbackDelta;
            const nextTimestampHint = currentPacket.timestamp + frameDuration;
            const nextPacket = await this.packetSink.getPacket(nextTimestampHint + 1e-4, { metadataOnly: true });
            if (nextPacket && nextPacket.timestamp > currentPacket.timestamp) {
              targetTime = nextPacket.timestamp;
            } else {
              targetTime = currentPacket.timestamp + frameDuration;
            }
          } else {
            const prevPacket = await this.packetSink.getPacket(currentPacket.timestamp - 1e-4, { metadataOnly: true });
            if (prevPacket && prevPacket.timestamp < currentPacket.timestamp) {
              targetTime = prevPacket.timestamp;
            } else {
              targetTime = currentPacket.timestamp - fallbackDelta;
            }
          }
        }
      } catch (_e) {
        // Ignore errors and fallback
      }
    }

    if (targetTime === null) {
      targetTime = curr + dir * fallbackDelta;
    }

    const clampedTime = Math.max(this.playableStartTime(), Math.min(this.playableEndTime(), targetTime));
    this.currentTime.set(clampedTime);
    await this.renderFrameAtTime(this.currentTime());
  }

  private scrubWasPlaying = false;
  private isScrubbing = false;
  private pendingRenderTime: number | null = null;
  private isRenderingFrame = false;

  /**
   * Handles the start of a scrubbing action (slider drag or keyboard interaction) by recording the previous playback
   * state and pausing playback.
   */
  protected onScrubStart(): void {
    if (!this.isLoaded() || this.isScrubbing) {
      return;
    }
    this.isScrubbing = true;
    this.scrubWasPlaying = this.isPlaying();
    this.isPlaying.set(false);
    this.playbackId++;
  }

  /**
   * Handles the end of a scrubbing action, resuming playback if the video was actively playing prior to scrubbing.
   */
  protected onScrubEnd(): void {
    if (!this.isScrubbing) {
      return;
    }
    this.isScrubbing = false;
    if (this.scrubWasPlaying) {
      if (this.currentTime() >= this.playableEndTime()) {
        this.currentTime.set(this.playableStartTime());
      }
      this.isPlaying.set(true);
      this.playLoop(this.playbackId);
    }
  }

  /**
   * Handles progress slider input events by updating the current playback time and queuing a throttled frame render.
   *
   * @param event The DOM input event triggered by changing the progress range slider.
   */
  protected onProgressChange(event: Event): void {
    if (!this.isLoaded()) {
      return;
    }

    if (!this.isScrubbing) {
      this.onScrubStart();
    }

    const inputElement = event.target as HTMLInputElement;
    const value = Number(inputElement.value);

    this.currentTime.set(value);
    this.pendingRenderTime = value;

    if (!this.isRenderingFrame) {
      this.processPendingRenders();
    }
  }

  /**
   * Processes and drains queued frame rendering requests sequentially, discarding intermediate frames when rapid
   * scrubbing requests occur.
   */
  private async processPendingRenders(): Promise<void> {
    if (!this.videoSink || !this.canvas()) {
      return;
    }
    this.isRenderingFrame = true;

    while (this.pendingRenderTime !== null) {
      const timeToRender = this.pendingRenderTime;
      this.pendingRenderTime = null;

      const canvasEl = this.canvas().nativeElement;
      const ctx = canvasEl.getContext('2d');
      if (ctx && this.videoSink) {
        try {
          const sample = await this.videoSink.getSample(timeToRender);
          if (sample) {
            try {
              if (canvasEl.width !== sample.squarePixelWidth || canvasEl.height !== sample.squarePixelHeight) {
                canvasEl.width = sample.squarePixelWidth;
                canvasEl.height = sample.squarePixelHeight;
              }
              sample.draw(ctx, 0, 0);
            } finally {
              sample.close();
            }
          }
        } catch (_e) {
          // Ignore errors from disposal or seeking out of bounds
        }
      }
    }

    this.isRenderingFrame = false;
  }
}
