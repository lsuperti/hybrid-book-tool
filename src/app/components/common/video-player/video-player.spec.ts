import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VideoPlayer } from './video-player';
import { MediaFiles, MediaFile } from '../../../services/media-files/media-files';
import * as mediabunny from 'mediabunny';
import { signal, ComponentRef, WritableSignal } from '@angular/core';

interface TestVideoPlayer {
  isPlaying: WritableSignal<boolean>;
  currentTime: WritableSignal<number>;
  playableStartTime: WritableSignal<number>;
  playableEndTime: WritableSignal<number>;
  isLoaded: WritableSignal<boolean>;
  mediabunnyInput: unknown;
  videoSink: unknown;
  togglePlay: () => void;
  seek: (delta: number) => Promise<void>;
  stepFrame: (direction: 'forward' | 'backward') => Promise<void>;
}

describe('VideoPlayer', () => {
  let component: VideoPlayer;
  let testComponent: TestVideoPlayer;
  let fixture: ComponentFixture<VideoPlayer>;
  let componentRef: ComponentRef<VideoPlayer>;
  
  let mediaFilesMock: { mediaFiles: ReturnType<typeof signal<MediaFile[]>> };
  let mockSample: mediabunny.VideoSample;
  let mockTrack: mediabunny.InputVideoTrack;

  beforeEach(async () => {
    mediaFilesMock = {
      mediaFiles: signal<MediaFile[]>([])
    };

    mockTrack = Object.assign(Object.create(mediabunny.InputVideoTrack.prototype), {
      getFirstTimestamp: vi.fn().mockResolvedValue(0),
      computeDuration: vi.fn().mockResolvedValue(10),
      canDecode: vi.fn().mockResolvedValue(true),
      computeFrameRateMetrics: vi.fn().mockResolvedValue({
        bestGuessFrameRate: 30,
        averageFrameRate: 30
      })
    });

    vi.spyOn(mediabunny.Input.prototype, 'getPrimaryVideoTrack').mockResolvedValue(mockTrack as unknown as mediabunny.InputVideoTrack);
    vi.spyOn(mediabunny.Input.prototype, 'dispose').mockImplementation(() => undefined);

    mockSample = {
      squarePixelWidth: 100,
      squarePixelHeight: 100,
      draw: vi.fn(),
      close: vi.fn(),
      timestamp: 0,
      duration: 1/30,
      visibleRect: { width: 100, height: 100 }
    } as unknown as mediabunny.VideoSample;

    vi.spyOn(mediabunny.VideoSampleSink.prototype, 'getSample').mockImplementation(async (ts = 0) => {
      return { ...mockSample, timestamp: ts } as unknown as mediabunny.VideoSample;
    });
    vi.spyOn(mediabunny.EncodedPacketSink.prototype, 'getPacket').mockImplementation(async (ts: number) => {
      const frameDuration = 1 / 30;
      const frameIndex = Math.max(0, Math.floor(ts / frameDuration));
      const timestamp = frameIndex * frameDuration;
      return {
        timestamp,
        duration: frameDuration,
        type: 'key',
        sequenceNumber: frameIndex,
        data: new Uint8Array(),
        byteLength: 0,
        sideData: {},
        isMetadataOnly: true,
        microsecondTimestamp: timestamp * 1e6,
        durationInMicroseconds: frameDuration * 1e6
      } as unknown as mediabunny.EncodedPacket;
    });
    vi.spyOn(mediabunny.VideoSampleSink.prototype, 'samples').mockImplementation(async function* (startTimestamp = 0) {
      yield { ...mockSample, timestamp: startTimestamp } as unknown as mediabunny.VideoSample;
      await new Promise<void>((resolve) => {
        void resolve;
      });
    });

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as unknown as RenderingContext);

    await TestBed.configureTestingModule({
      imports: [VideoPlayer],
      providers: [
        { provide: MediaFiles, useValue: mediaFilesMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(VideoPlayer);
    component = fixture.componentInstance;
    testComponent = component as unknown as TestVideoPlayer;
    testComponent.videoSink = new mediabunny.VideoSampleSink(mockTrack as unknown as mediabunny.InputVideoTrack);
    componentRef = fixture.componentRef;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should play and pause', () => {
    fixture.detectChanges();
    testComponent.videoSink = new mediabunny.VideoSampleSink(mockTrack);
    testComponent.isLoaded.set(true);
    testComponent.playableEndTime.set(10);
    
    component.togglePlay();
    expect(testComponent.isPlaying()).toBe(true);
    
    component.togglePlay();
    expect(testComponent.isPlaying()).toBe(false);
  });
  
  it('should load segment and setup decoding', async () => {
    const file = new File([''], 'test.mp4', { type: 'video/mp4' });
    mediaFilesMock.mediaFiles.set([{
      id: 'media-123' as unknown as string,
      file: file,
      name: 'test.mp4',
      url: null,
      thumbnail: null
    } as unknown as MediaFile]);
    
    componentRef.setInput('segment', {
      fileId: 'media-123',
      name: 'Segment',
      startTime: -Infinity,
      endTime: Infinity,
      thumbnail: null
    });
    
    fixture.detectChanges();
    await fixture.whenStable();
    // Yield to macrotask queue for async promises to resolve
    await new Promise(r => setTimeout(r, 10));
    
    expect(mediabunny.Input.prototype.getPrimaryVideoTrack).toHaveBeenCalled();
    expect(testComponent.playableStartTime()).toBe(0);
    expect(testComponent.playableEndTime()).toBe(10);
    expect(component.duration()).toBe(10);
    expect(testComponent.isLoaded()).toBe(true);
  });

  it('should cleanup resources on destroy', async () => {
    const file = new File([''], 'test.mp4', { type: 'video/mp4' });
    mediaFilesMock.mediaFiles.set([{
      id: 'media-123' as unknown as string,
      file: file,
      name: 'test.mp4',
      url: null,
      thumbnail: null
    } as unknown as MediaFile]);
    
    componentRef.setInput('segment', {
      fileId: 'media-123',
      name: 'Segment',
      startTime: 0,
      endTime: 5,
      thumbnail: null
    });
    
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(r => setTimeout(r, 10));
    
    expect(testComponent.mediabunnyInput).toBeTruthy();
    
    fixture.destroy();
    
    expect(mediabunny.Input.prototype.dispose).toHaveBeenCalled();
    expect(testComponent.isLoaded()).toBe(false);
  });

  it('should cleanup resources when segment is cleared', async () => {
    const file = new File([''], 'test.mp4', { type: 'video/mp4' });
    mediaFilesMock.mediaFiles.set([{
      id: 'media-123' as unknown as string,
      file: file,
      name: 'test.mp4',
      url: null,
      thumbnail: null
    } as unknown as MediaFile]);
    
    componentRef.setInput('segment', {
      fileId: 'media-123',
      name: 'Segment',
      startTime: 0,
      endTime: 5,
      thumbnail: null
    });
    
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(r => setTimeout(r, 10));
    
    expect(testComponent.isLoaded()).toBe(true);
    
    componentRef.setInput('segment', null);
    fixture.detectChanges();
    await fixture.whenStable();
    
    expect(testComponent.isLoaded()).toBe(false);
    expect(testComponent.playableStartTime()).toBe(0);
    expect(testComponent.playableEndTime()).toBe(0);
    expect(testComponent.currentTime()).toBe(0);
    expect(mediabunny.Input.prototype.dispose).toHaveBeenCalled();
  });
  
  it('should seek and step frames', async () => {
    fixture.detectChanges();
    testComponent.isLoaded.set(true);
    testComponent.playableStartTime.set(0);
    testComponent.playableEndTime.set(10);
    testComponent.currentTime.set(5);
    
    await component.seek(1);
    expect(testComponent.currentTime()).toBe(6);
    
    await component.stepFrame(1);
    expect(testComponent.currentTime()).toBeCloseTo(6 + 1/30, 4);
    
    await component.stepFrame(-1);
    expect(testComponent.currentTime()).toBeCloseTo(6, 4);

    await component.seek(-2);
    expect(testComponent.currentTime()).toBeCloseTo(4, 4);
  });

  it('should restart from beginning when togglePlay is called at the end of video', async () => {
    fixture.detectChanges();
    testComponent.videoSink = new mediabunny.VideoSampleSink(mockTrack);
    testComponent.isLoaded.set(true);
    testComponent.playableStartTime.set(2);
    testComponent.playableEndTime.set(10);
    testComponent.currentTime.set(10);

    component.togglePlay();
    expect(testComponent.currentTime()).toBe(2);
    expect(testComponent.isPlaying()).toBe(true);
  });

  it('should set isPlaying to false when playback reaches the end of the samples', async () => {
    vi.spyOn(mediabunny.VideoSampleSink.prototype, 'samples').mockImplementation(async function* () {
      yield mockSample;
    });

    const file = new File([''], 'test.mp4', { type: 'video/mp4' });
    mediaFilesMock.mediaFiles.set([{
      id: 'media-123' as unknown as string,
      file: file,
      name: 'test.mp4',
      url: null,
      thumbnail: null
    } as unknown as MediaFile]);
    
    componentRef.setInput('segment', {
      fileId: 'media-123',
      name: 'Segment',
      startTime: 0,
      endTime: 10,
      thumbnail: null
    });

    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(r => setTimeout(r, 10));

    expect(testComponent.isLoaded()).toBe(true);

    component.togglePlay();

    // Yield to let sample generator finish
    await new Promise(r => setTimeout(r, 20));

    expect(testComponent.isPlaying()).toBe(false);
    expect(testComponent.currentTime()).toBe(10);
  });

  it('should continue playing from current time if within bounds and keepPlaying is true', async () => {
    const file = new File([''], 'test.mp4', { type: 'video/mp4' });
    mediaFilesMock.mediaFiles.set([{
      id: 'media-123' as unknown as string,
      file: file,
      name: 'test.mp4',
      url: null,
      thumbnail: null
    } as unknown as MediaFile]);

    componentRef.setInput('segment', {
      fileId: 'media-123',
      name: 'Segment 1',
      startTime: 0,
      endTime: 20,
      thumbnail: null
    });

    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(r => setTimeout(r, 10));

    testComponent.currentTime.set(8);
    component.togglePlay();
    expect(testComponent.isPlaying()).toBe(true);

    // Switch to another segment with same file containing time 8 (bounds 5 to 15, edge 0.5 -> valid 5.5 to 14.5)
    componentRef.setInput('segment', {
      fileId: 'media-123',
      name: 'Segment 2',
      startTime: 5,
      endTime: 15,
      thumbnail: null
    });

    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(r => setTimeout(r, 10));

    expect(testComponent.isPlaying()).toBe(true);
    expect(testComponent.isLoaded()).toBe(true);
    expect(testComponent.currentTime()).toBe(8);
    expect(testComponent.playableStartTime()).toBe(5);
    expect(testComponent.playableEndTime()).toBe(15);
  });

  it('should play from start of new segment if close to edge and keepPlaying is true', async () => {
    const file = new File([''], 'test.mp4', { type: 'video/mp4' });
    mediaFilesMock.mediaFiles.set([{
      id: 'media-123' as unknown as string,
      file: file,
      name: 'test.mp4',
      url: null,
      thumbnail: null
    } as unknown as MediaFile]);

    componentRef.setInput('segment', {
      fileId: 'media-123',
      name: 'Segment 1',
      startTime: 0,
      endTime: 20,
      thumbnail: null
    });

    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(r => setTimeout(r, 10));

    testComponent.currentTime.set(5.2); // Close to start (5.0 + 0.5 = 5.5)
    component.togglePlay();
    expect(testComponent.isPlaying()).toBe(true);

    // Switch to Segment 2
    componentRef.setInput('segment', {
      fileId: 'media-123',
      name: 'Segment 2',
      startTime: 5,
      endTime: 15,
      thumbnail: null
    });

    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(r => setTimeout(r, 10));

    expect(testComponent.isPlaying()).toBe(true);
    expect(testComponent.currentTime()).toBe(5);
  });

  it('should pause and reset to start if keepPlaying is false', async () => {
    const file = new File([''], 'test.mp4', { type: 'video/mp4' });
    mediaFilesMock.mediaFiles.set([{
      id: 'media-123' as unknown as string,
      file: file,
      name: 'test.mp4',
      url: null,
      thumbnail: null
    } as unknown as MediaFile]);

    componentRef.setInput('keepPlaying', false);
    componentRef.setInput('segment', {
      fileId: 'media-123',
      name: 'Segment 1',
      startTime: 0,
      endTime: 20,
      thumbnail: null
    });

    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(r => setTimeout(r, 10));

    testComponent.currentTime.set(8);
    component.togglePlay();
    expect(testComponent.isPlaying()).toBe(true);

    // Switch to Segment 2
    componentRef.setInput('segment', {
      fileId: 'media-123',
      name: 'Segment 2',
      startTime: 5,
      endTime: 15,
      thumbnail: null
    });

    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(r => setTimeout(r, 10));

    expect(testComponent.isPlaying()).toBe(false);
    expect(testComponent.currentTime()).toBe(5);
  });

  it('should stay paused when segment changes if player was paused', async () => {
    const file = new File([''], 'test.mp4', { type: 'video/mp4' });
    mediaFilesMock.mediaFiles.set([{
      id: 'media-123' as unknown as string,
      file: file,
      name: 'test.mp4',
      url: null,
      thumbnail: null
    } as unknown as MediaFile]);

    componentRef.setInput('segment', {
      fileId: 'media-123',
      name: 'Segment 1',
      startTime: 0,
      endTime: 20,
      thumbnail: null
    });

    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(r => setTimeout(r, 10));

    expect(testComponent.isPlaying()).toBe(false);

    // Switch to Segment 2
    componentRef.setInput('segment', {
      fileId: 'media-123',
      name: 'Segment 2',
      startTime: 5,
      endTime: 15,
      thumbnail: null
    });

    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(r => setTimeout(r, 10));

    expect(testComponent.isPlaying()).toBe(false);
    expect(testComponent.currentTime()).toBe(5);
  });
});

