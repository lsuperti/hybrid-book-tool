# Video Player Component

The `VideoPlayer` component is an Angular common component responsible for high-performance, frame-accurate video
playback, precision scrubbing, and visual previewing using the WebCodecs API via Mediabunny. It renders decoded video
frames directly to an HTML5 `<canvas>` element without relying on native browser `<video>` elements, giving full control
over presentation timestamps, seeking latency, memory footprint, and exact playback bounds.

---

## 1. Core Architecture & Rendering Pipeline

### WebCodecs & Mediabunny Decoding
Traditional HTML5 `<video>` elements introduce asynchronous seeking latencies, uncontrolled buffering heuristics, and
inconsistent frame stepping behavior across different browsers and operating systems. The `VideoPlayer` component
bypasses these limitations:
1. **Source Demuxing**: Video containers (`.mp4`, `.webm`, etc.) are wrapped in a Mediabunny `BlobSource` and parsed
   using `ALL_FORMATS`.
2. **Primary Video Track Inspection**: The component queries `input.getPrimaryVideoTrack()`, extracts intrinsic square
   pixel dimensions (`squarePixelWidth`, `squarePixelHeight`), Presentation Timestamps (`getFirstTimestamp()`), total
   duration (`computeDuration()`), and frame rate metrics (`computeFrameRateMetrics()`).
3. **Hardware-Accelerated Frame Decoding**:
   - `VideoSampleSink`: Yields high-performance decoded `VideoSample` instances directly from WebCodecs hardware
     decoder sessions.
   - `EncodedPacketSink`: Retrieves raw encoded bitstream packets with zero decoding overhead for frame boundary
     calculations and exact packet presentation timestamps.
4. **Direct Canvas Rendering**:
   - Extracted `VideoSample` instances are drawn onto the target `<canvas>` using `sample.draw(ctx, 0, 0)`.
   - The canvas width and height dynamically conform to `sample.squarePixelWidth` and `sample.squarePixelHeight`,
     preserving true pixel aspect ratios without anamorphic distortion.
   - Decoded samples are explicitly released via `sample.close()` in `finally` blocks, immediately reclaiming
     GPU and system memory.

---

## 2. Operating Modes: Segment Mode vs File Mode

The component supports two distinct operating modes configured via the `mode` input:

### Segment Mode (`mode="segment"`, Default)
- **Use Case**: Segment inspection, trimming verification, and correlation previews (e.g., in the Correlation UI).
- **Boundaries**: Playback, seeking, and the progress bar slider are strictly bounded between `segment.startTime` and
  `segment.endTime`.
- **Progress Range**: Min is `segment.startTime`, max is `segment.endTime`.
- **Edge Clamping**: Time is clamped within `[segment.startTime, segment.endTime]`. When playback reaches the end of
  the segment, playback pauses and rewinds to `segment.startTime` upon the next play request.
- **Segment Resumption**: When switching between overlapping segments from the same video file, the `keepPlaying` and
  `edgeThreshold` inputs allow seamless continuation without restarting from zero.

### File Mode (`mode="file"`)
- **Use Case**: Video segmentation and timeline cutting (e.g., in the Video Segmentation UI).
- **Boundaries**: Playback, seeking, and progress bar controls cover the whole video file from $t = 0\text{s}$
  (or `firstTimestamp`) to `duration`.
- **Unrestricted Playback**: Users can play and scrub freely through any section of the video file, including
  unsegmented intervals between cuts.
- **Playhead Decoupling & Immunity to Segment Edits**: The player binds directly to `mediaFileId`. Segment modifications
  (e.g., dragging segment start/end tabs on the timeline, adding new cuts, or deleting segments) do not alter the
  loaded file or trigger reloads in the video player. The playhead remains completely stable.

---

## 3. Real-Time Playback Synchronization & Play Loop Architecture

Playback is driven by a drift-compensated asynchronous generator loop (`playLoop`):
1. **Clock Synchronization**:
   - At the start of playback, the player snapshots high-precision system time (`performance.now()`) and the starting
     video timestamp (`currentTime()`).
   - For each sequential decoded frame, the target presentation wall-clock time is computed:
     $$
     \text{targetTime} = \text{playbackStartTime} +
       ((\text{sample.timestamp} - \text{playbackStartCurrentTime}) \times 1000)
     $$
   - If the next frame arrives ahead of wall-clock time, `playLoop` yields execution via `setTimeout` for the remaining
     interval (`targetTime - performance.now()`), perfectly locking rendering to real-world playback speed.
2. **Session Identification & Concurrency Guard (`playbackId`)**:
   - Each playback session is tagged with a monotonic incrementing integer `playbackId`.
   - Any pause, stop, file reload, segment change, or seek increments `playbackId`.
   - If an asynchronous decode finishes after a state transition has occurred, `playbackId !== id` immediately triggers
     early exit and sample disposal, preventing stale loops from competing for the canvas.
3. **Reactive Playback Controller**:
   - `isPlaying` is an Angular two-way `model<boolean>(false)`.
   - A reactive Angular `effect()` watches `isPlaying()`:
     - When flipped to `true` (from the player's internal button, an external timeline button, or the Space shortcut),
       the effect validates `isLoaded()`, rewinds if at the end, and launches `playLoop`.
     - When flipped to `false`, the effect increments `playbackId` and terminates active playback loops.

---

## 4. Scrubbing Pipeline & Frame Coalescing

### The Coalesced Sequential Queue
Scrubbing a video (via timeline playhead dragging or range slider interaction) can fire tens of mousemove events per
second. If every event immediately triggers an independent WebCodecs decoding operation, multiple concurrent decodes
fight for GPU hardware decoding sessions, creating intense UI stutter, high seeking latency, and frame dropping:
- **`pendingRenderTime`**: When `currentTime` updates while paused, the timestamp is stored in `pendingRenderTime`.
- **Sequential Single-Flight Worker (`processPendingRenders`)**:
  1. If a frame render is already executing (`isRenderingFrame = true`), any new scrubbing positions simply overwrite
     `pendingRenderTime`.
  2. When the active frame decode finishes, `processPendingRenders()` checks `pendingRenderTime`.
  3. Intermediate requests are discarded, and only the newest requested timestamp is decoded.
  4. The canvas displays the latest position with minimal latency while guaranteeing that at most one decode runs at
     any instant.

### Presentation Timestamp Decoupling
To eliminate playhead snapping and cursor jitter:
- During continuous playback, `currentTime` is updated to match each frame's `sample.timestamp`.
- During scrubbing or paused manual seeking, `processPendingRenders()` does **not** overwrite `currentTime` with
  the nearest keyframe or presentation timestamp. The user's cursor position remains exact, and only `lastRenderedTime`
  is updated.

### Two-Way `isScrubbing` Coordination
The component exposes a two-way signal `isScrubbing = model<boolean>(false)`:
- When scrubbing starts (via `<input type="range">` or the timeline playhead):
  - Active playback pauses immediately.
  - Previous playback state is recorded (`scrubWasPlaying`).
- When scrubbing ends:
  - If playback was active prior to scrubbing, playback resumes automatically.

---

## 5. Precision Frame Stepping & Seeking

### Packet-Accurate Stepping via `EncodedPacketSink`
Standard time-based delta seeking ($\Delta t = 1 / 30\text{s}$) fails with Variable Frame Rate (VFR) media,
telecined content, or drop-frame timecodes:
1. `stepFrame('forward' | 'backward')` inspects the underlying video track using
   `EncodedPacketSink.getPacket(curr, { metadataOnly: true })`.
2. For forward steps, it retrieves the current packet's exact duration and queries the next packet timestamp.
3. For backward steps, it retrieves the preceding packet timestamp.
4. If bitstream packet metadata is unavailable, it falls back to nominal frame duration derived from
   `videoTrack.computeFrameRateMetrics()`.

---

## 6. Public API & Signal Models

### Inputs
| Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `mode` | `'segment' \| 'file'` | `'segment'` | Playback mode bounding behavior. |
| `segment` | `VideoSegment \| null` | `null` | Active video segment to play in `'segment'` mode. |
| `mediaFileId` | `MediaFileId \| null` | `null` | Target video file to play in `'file'` mode. |
| `keepPlaying` | `boolean` | `true` | Resume playback across overlapping segments from the same file. |
| `edgeThreshold` | `number` | `0.5` | Threshold in seconds from segment edges before rewinding. |

### Two-Way Model Signals
| Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `isPlaying` | `boolean` | `false` | Indicates whether video playback is actively running. |
| `isScrubbing` | `boolean` | `false` | Indicates whether playhead or slider scrubbing is active. |
| `currentTime` | `number` | `0` | Current playback timestamp in seconds. |
| `playableStartTime` | `number` | `0` | Start timestamp in seconds of the playable region. |
| `playableEndTime` | `number` | `0` | End timestamp in seconds of the playable region. |
| `isLoaded` | `boolean` | `false` | Indicates whether video track metadata is loaded and ready. |

### Computed Signals
| Name | Type | Description |
| :--- | :--- | :--- |
| `duration` | `number` | Total duration in seconds of the active region (`playableEndTime - playableStartTime`). |

### Methods
- `togglePlay(): void`: Toggles playback on and off; rewinds to start if at or past the end.
- `seek(delta: number): Promise<void>`: Shifts the playhead by `delta` seconds clamped within bounds.
- `stepFrame(direction: 'forward' | 'backward' | 1 | -1): Promise<void>`: Frame-accurate single step navigation.

---

## 7. Multi-Component Integration Patterns

### Video Segmentation & Timeline Integration
In the Video Segmentation editor:
```html
<app-video-player
  [mode]="'file'"
  [(currentTime)]="currentTime"
  [(isPlaying)]="isPlaying"
  [(isScrubbing)]="isScrubbing"
  [mediaFileId]="activeMediaFile()?.id ?? null"
></app-video-player>

<app-timeline
  [(currentTime)]="currentTime"
  [(isPlaying)]="isPlaying"
  [(isScrubbing)]="isScrubbing"
  [(activeMediaFileId)]="activeMediaFileId"
  [(selectedSegmentId)]="selectedSegmentId"
></app-timeline>
```
- **Unified Play/Pause**: Toggling playback in `Timeline` (via button or Space) updates `isPlaying`, which `VideoPlayer`
  reactively consumes to run `playLoop`.
- **Coalesced Timeline Scrubbing**: Clicking and dragging anywhere on the timeline (ruler, filmstrips, or segments)
  sets `isScrubbing = true` and updates `currentTime`. The player pauses, coalesces frame decodes via
  `processPendingRenders()`, and resumes smoothly on release. The playhead serves as a non-interactive visual indicator.
- **Segment Cut Independence**: Resizing segment tabs updates `videoSegmentationService`, but does not emit new
  `mediaFileId` values, keeping the video player stable and motionless.

### Correlation UI Integration
In the Correlation view:
```html
<app-video-player
  [mode]="'segment'"
  [segment]="selectedVideoSegment()"
></app-video-player>
```
- Operates in default `'segment'` mode, constraining playback and scrubbing to the boundaries of the correlated segment.

---

## 8. Resource Management & Lifecycle Cleanup

Canvas allocations and WebCodecs decoder sessions retain significant GPU and memory resources. The component implements
strict lifecycle cleanup:

- **Input Disposal**: When destroying the component (`ngOnDestroy`) or when switching files/segments, `cleanup()`
  calls `mediabunnyInput.dispose()`. This releases underlying demuxers and closes hardware decoder instances.
- **Async Iterator Termination**: If continuous playback or seeking is active, `cleanup()` invokes
  `currentSamplesIterator.return?.()` to cleanly close the generator pipeline.
- **Canvas Clearing**: On cleanup, the canvas 2D context is cleared (`ctx.clearRect(0, 0, width, height)`), ensuring
  no stale frames linger on screen.
- **Monotonic `playbackId` Invalidation**: Any state reset increments `playbackId`, instantly invalidating any
  in-flight microtasks or frame drawing operations from superseded sessions.
