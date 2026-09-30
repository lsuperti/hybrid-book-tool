import {
  Component,
  input,
  model,
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
import { MediaFiles, type MediaFileId } from '../../../services/media-files/media-files';
import { Input, BlobSource, ALL_FORMATS, VideoSampleSink, VideoSample, EncodedPacketSink } from 'mediabunny';

@Component({
  selector: 'app-video-player',
  templateUrl: './video-player.html',
  styleUrl: './video-player.scss',
  imports: [NgTemplateOutlet]
})
export class VideoPlayer implements OnDestroy {
  private static readonly DEFAULT_FPS = 30;
  private static readonly DEFAULT_FRAME_DURATION = 1 / 30;
  private static readonly DEFAULT_EDGE_THRESHOLD = 0.5;
  private static readonly PLAYBACK_SEEK_THRESHOLD_SECONDS = 0.2;
  private static readonly RENDER_TIMESTAMP_EPSILON = 1e-4;
  private static readonly MILLISECONDS_PER_SECOND = 1000;
  private static readonly DEFAULT_SEEK_STEP_SECONDS = 1;

  private readonly mediaFilesService = inject(MediaFiles);

  /**
   * Operating mode for the video player:
   * - `'segment'`: Plays the provided `segment`, bounded by the segment's start and end timestamps.
   * - `'file'`: Plays the media file directly (from `mediaFileId`), allowing unrestricted playback across the full
   *   file duration.
   */
  public readonly mode = input<'segment' | 'file'>('segment');

  /**
   * Active video segment to display and play, or null if no segment is loaded.
   */
  public readonly segment = input<VideoSegment | null>(null);

  /**
   * Media file ID to play directly when not playing a specific segment.
   */
  public readonly mediaFileId = input<MediaFileId | null>(null);

  /**
   * Whether playback should automatically resume when switching between overlapping segments from the same video file.
   */
  public readonly keepPlaying = input<boolean>(true);

  /**
   * Time threshold in seconds from segment boundaries. If playback was near the segment edges, changing segments
   * will start from the beginning of the new segment instead of resuming.
   */
  public readonly edgeThreshold = input<number>(VideoPlayer.DEFAULT_EDGE_THRESHOLD);

  /**
   * Reference to the HTML canvas element used to render decoded video frames.
   */
  protected readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  /**
   * Signal indicating whether video playback is currently active.
   */
  public readonly isPlaying = model<boolean>(false);

  /**
   * Signal indicating whether video scrubbing is actively in progress.
   */
  public readonly isScrubbing = model<boolean>(false);

  /**
   * Signal containing the current playback timestamp in seconds.
   */
  public readonly currentTime = model<number>(0);

  /**
   * Signal containing the start timestamp in seconds for the active segment/file.
   */
  public readonly playableStartTime = model<number>(0);

  /**
   * Signal containing the end timestamp in seconds for the active segment/file.
   */
  public readonly playableEndTime = model<number>(0);

  /**
   * Signal indicating whether a video segment is successfully loaded and ready for playback.
   */
  public readonly isLoaded = model<boolean>(false);

  /**
   * Computed duration in seconds of the active segment.
   */
  public readonly duration = computed(() => this.playableEndTime() - this.playableStartTime());

  private mediabunnyInput: Input | null = null;
  private videoSink: VideoSampleSink | null = null;
  private packetSink: EncodedPacketSink | null = null;
  private nominalFrameDuration = VideoPlayer.DEFAULT_FRAME_DURATION;
  private currentSamplesIterator: AsyncIterator<VideoSample> | null = null;
  private currentSegment: VideoSegment | null = null;
  private currentLoadedFileId: MediaFileId | null = null;

  private playbackId = 0;
  private loadSegmentId = 0;
  private lastRenderedTime: number | null = null;
  private activePlaybackLoopId: number | null = null;
  private scrubWasPlaying = false;
  private pendingRenderTime: number | null = null;
  private isRenderingFrame = false;
  private renderRafId: number | null = null;

  private playbackStartTime = 0;
  private playbackStartCurrentTime = 0;

  /**
   * Creates an instance of VideoPlayer and registers reactive effects for loading media and reacting to state changes.
   */
  constructor() {
    effect(() => {
      const mode = this.mode();
      if (mode === 'segment') {
        const seg = this.segment();
        untracked(() => {
          if (seg) {
            void this.loadSegment(seg);
          } else {
            this.currentSegment = null;
            this.currentLoadedFileId = null;
            this.cleanup();
          }
        });
      } else {
        const directFileId = this.mediaFileId();
        untracked(() => {
          if (directFileId) {
            void this.loadFile(directFileId);
          } else {
            this.currentSegment = null;
            this.currentLoadedFileId = null;
            this.cleanup();
          }
        });
      }
    });

    effect(() => {
      const playing = this.isPlaying();
      untracked(() => {
        if (playing) {
          if (!this.isLoaded()) {
            this.isPlaying.set(false);
            return;
          }
          if (this.currentTime() >= this.playableEndTime()) {
            this.currentTime.set(this.playableStartTime());
          }
          if (this.activePlaybackLoopId === null) {
            const id = ++this.playbackId;
            this.activePlaybackLoopId = id;
            void this.playLoop(id);
          }
        } else {
          this.playbackId++;
          this.activePlaybackLoopId = null;
        }
      });
    });

    effect(() => {
      const scrubbing = this.isScrubbing();
      untracked(() => {
        if (scrubbing) {
          if (!this.isLoaded()) {
            return;
          }
          this.scrubWasPlaying = this.isPlaying();
          if (this.isPlaying()) {
            this.isPlaying.set(false);
          }
        } else {
          if (this.scrubWasPlaying) {
            this.scrubWasPlaying = false;
            if (this.currentTime() >= this.playableEndTime()) {
              this.currentTime.set(this.playableStartTime());
            }
            this.isPlaying.set(true);
          }
        }
      });
    });

    effect(() => {
      const time = this.currentTime();
      untracked(() => {
        if (this.isLoaded()) {
          if (this.isPlaying()) {
            if (
              this.lastRenderedTime === null ||
              Math.abs(time - this.lastRenderedTime) > VideoPlayer.PLAYBACK_SEEK_THRESHOLD_SECONDS
            ) {
              this.playbackId++;
              const id = this.playbackId;
              this.activePlaybackLoopId = id;
              void this.playLoop(id);
            }
          } else {
            if (
              this.lastRenderedTime === null ||
              Math.abs(time - this.lastRenderedTime) > VideoPlayer.RENDER_TIMESTAMP_EPSILON
            ) {
              this.pendingRenderTime = time;
              this.schedulePendingRender();
            }
          }
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
    this.activePlaybackLoopId = null;
    this.pendingRenderTime = null;
    if (this.renderRafId !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.renderRafId);
      }
      this.renderRafId = null;
    }
    this.lastRenderedTime = null;
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
    this.nominalFrameDuration = VideoPlayer.DEFAULT_FRAME_DURATION;

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
   * Loads a media file directly, initializing decoding and bounds across the entire video.
   *
   * @param fileId The ID of the media file to load.
   */
  private async loadFile(fileId: MediaFileId): Promise<void> {
    const prevFileId = this.currentLoadedFileId;
    if (prevFileId === fileId && this.mediabunnyInput && this.isLoaded()) {
      return;
    }
    const wasPlaying = this.isPlaying();
    const prevTime = this.currentTime();
    this.currentSegment = null;
    this.currentLoadedFileId = fileId;

    if (prevFileId !== fileId) {
      this.cleanup();
    }

    const id = ++this.loadSegmentId;
    const mediaFiles = this.mediaFilesService.mediaFiles();
    const fileRecord = mediaFiles.find((f) => f.id === fileId);

    if (!fileRecord) {
      return;
    }

    if (prevFileId !== fileId || !this.mediabunnyInput) {
      const inputObj = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(fileRecord.file)
      });

      try {
        const videoTrack = await inputObj.getPrimaryVideoTrack();
        if (!videoTrack || this.loadSegmentId !== id) {
          inputObj.dispose();
          return;
        }

        this.mediabunnyInput = inputObj;
        const firstTs = (await videoTrack.getFirstTimestamp()) ?? 0;
        const duration = (await videoTrack.computeDuration()) ?? 0;

        if (this.loadSegmentId !== id) {
          this.mediabunnyInput.dispose();
          this.mediabunnyInput = null;
          return;
        }

        this.playableStartTime.set(firstTs);
        this.playableEndTime.set(duration);
        this.videoSink = new VideoSampleSink(videoTrack);
        this.packetSink = new EncodedPacketSink(videoTrack);

        try {
          const metrics = await videoTrack.computeFrameRateMetrics();
          const fps = metrics.bestGuessFrameRate || metrics.averageFrameRate;
          if (fps && fps > 0) {
            this.nominalFrameDuration = 1 / fps;
          }
        } catch (_e) {
          this.nominalFrameDuration = VideoPlayer.DEFAULT_FRAME_DURATION;
        }

        this.isLoaded.set(true);

        const currentPos = this.currentTime();
        const hasValidPos = currentPos >= firstTs && currentPos <= duration;
        const targetTime = hasValidPos
          ? currentPos
          : (prevTime >= firstTs && prevTime <= duration ? prevTime : firstTs);
        this.currentTime.set(targetTime);

        if (wasPlaying) {
          this.isPlaying.set(true);
        } else {
          await this.renderFrameAtTime(targetTime);
        }
      } catch (_e) {
        inputObj.dispose();
        if (this.mediabunnyInput === inputObj) {
          this.mediabunnyInput = null;
        }
      }
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
        this.nominalFrameDuration = VideoPlayer.DEFAULT_FRAME_DURATION;
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

    this.isRenderingFrame = true;
    try {
      const sample = await this.videoSink.getSample(time);
      if (sample) {
        try {
          if (canvasEl.width !== sample.squarePixelWidth || canvasEl.height !== sample.squarePixelHeight) {
            canvasEl.width = sample.squarePixelWidth;
            canvasEl.height = sample.squarePixelHeight;
          }
          sample.draw(ctx, 0, 0);
          this.lastRenderedTime = sample.timestamp;
        } finally {
          sample.close();
        }
      }
    } catch (_e) {
      // Ignore errors from disposal or seeking out of bounds
    } finally {
      this.isRenderingFrame = false;
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

    if (!this.isPlaying() && this.currentTime() >= this.playableEndTime()) {
      this.currentTime.set(this.playableStartTime());
    }

    this.isPlaying.update((p) => !p);
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
        this.activePlaybackLoopId = null;
      }

      return;
    }

    const canvasEl = this.canvas().nativeElement;
    const ctx = canvasEl.getContext('2d');

    if (!ctx) {
      if (this.playbackId === id) {
        this.isPlaying.set(false);
        this.activePlaybackLoopId = null;
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
          this.lastRenderedTime = sample.timestamp;
          this.currentTime.set(sample.timestamp);
        } finally {
          sample.close();
        }

        const targetTime = this.playbackStartTime +
          ((sample.timestamp - this.playbackStartCurrentTime) * VideoPlayer.MILLISECONDS_PER_SECOND);
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
        this.activePlaybackLoopId = null;
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
    if (wasPlaying) {
      this.isPlaying.set(false);
    }

    this.currentTime.set(
      Math.max(
        this.playableStartTime(),
        Math.min(this.playableEndTime(), this.currentTime() + delta)
      )
    );

    if (wasPlaying) {
      this.isPlaying.set(true);
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
    const fallbackDelta = this.nominalFrameDuration || VideoPlayer.DEFAULT_FRAME_DURATION;

    if (this.packetSink) {
      try {
        const currentPacket = await this.packetSink.getPacket(curr, { metadataOnly: true });
        if (currentPacket) {
          if (dir === 1) {
            const frameDuration = currentPacket.duration > 0 ? currentPacket.duration : fallbackDelta;
            const nextTimestampHint = currentPacket.timestamp + frameDuration;
            const nextPacket = await this.packetSink.getPacket(
              nextTimestampHint + VideoPlayer.RENDER_TIMESTAMP_EPSILON,
              { metadataOnly: true }
            );
            if (nextPacket && nextPacket.timestamp > currentPacket.timestamp) {
              targetTime = nextPacket.timestamp;
            } else {
              targetTime = currentPacket.timestamp + frameDuration;
            }
          } else {
            const prevPacket = await this.packetSink.getPacket(
              currentPacket.timestamp - VideoPlayer.RENDER_TIMESTAMP_EPSILON,
              { metadataOnly: true }
            );
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
  }

  /**
   * Handles the start of a scrubbing action (slider drag or keyboard interaction) by setting isScrubbing.
   */
  protected onScrubStart(): void {
    if (!this.isLoaded() || this.isScrubbing()) {
      return;
    }
    this.isScrubbing.set(true);
  }

  /**
   * Handles the end of a scrubbing action by resetting isScrubbing.
   */
  protected onScrubEnd(): void {
    if (!this.isScrubbing()) {
      return;
    }
    this.isScrubbing.set(false);
  }

  /**
   * Handles progress slider input events by updating the current playback time.
   *
   * @param event The DOM input event triggered by changing the progress range slider.
   */
  protected onProgressChange(event: Event): void {
    if (!this.isLoaded()) {
      return;
    }

    if (!this.isScrubbing()) {
      this.onScrubStart();
    }

    const inputElement = event.target as HTMLInputElement;
    const value = Number(inputElement.value);

    this.currentTime.set(value);
  }

  /**
   * Schedules a throttled frame render request synchronized with the next animation frame.
   */
  private schedulePendingRender(): void {
    if (this.renderRafId !== null || this.isRenderingFrame) {
      return;
    }

    if (typeof requestAnimationFrame === 'function') {
      this.renderRafId = requestAnimationFrame(() => {
        this.renderRafId = null;
        void this.processPendingRenders();
      });
    } else {
      void this.processPendingRenders();
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

    try {
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
                this.lastRenderedTime = sample.timestamp;
              } finally {
                sample.close();
              }
            }
          } catch (_e) {
            // Ignore errors from disposal or seeking out of bounds
          }
        }

        if (this.pendingRenderTime !== null && typeof requestAnimationFrame === 'function') {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
          });
        }
      }
    } finally {
      this.isRenderingFrame = false;
      if (this.pendingRenderTime !== null) {
        this.schedulePendingRender();
      }
    }
  }

  /**
   * Formats a timestamp in seconds to MM:SS format for accessibility displays.
   *
   * @param seconds The timestamp in seconds.
   * @returns Formatted MM:SS time string.
   */
  public formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return '00:00';
    }
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
