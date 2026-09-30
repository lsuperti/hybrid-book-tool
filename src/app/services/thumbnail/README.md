# Thumbnail Service

The `Thumbnail` service is an Angular service responsible for generating visual preview thumbnails from video files
using the Mediabunny media toolkit. It supports three primary modes of operation:
1. **File Thumbnail Generation**: Generates a single representative thumbnail image for an entire video file
   (e.g., for file lists, cards, and upload previews).
2. **Filmstrip Thumbnail Generation**: Asynchronously generates and streams a series of thumbnails across specified
   time ranges for one or more video files (e.g., for timeline rulers, zoomable filmstrips, and video segmentation).
3. **Segment Thumbnail Generation**: Generates still preview thumbnails for video segments captured at their
   pristine first frame (e.g., for segment lists and correlation views).

---

## 1. File Thumbnail Generation

### Overview
File thumbnail generation provides a quick, representative still image for a video file at a designated timestamp (defaulting to 5 seconds into the video, clamped to valid video duration).

### Architecture & Pipeline
1. **Request Batching**:
   - The service accepts an array of `FileThumbnailGenerationRequest` objects (each containing a `mediaFileId`, `file: File`, optional `targetTimestamp`, and optional `thumbnailSize`).
   - Requests are processed concurrently with configurable concurrency (defaulting to 3).
2. **Input Initialization**:
   - Mediabunny `Input` is initialized using a `BlobSource` wrapping the input `File` and configured with `ALL_FORMATS`.
3. **Validation & Capabilities**:
   - Retrieves the primary video track (`input.getPrimaryVideoTrack()`).
   - Validates that a video track exists, has a valid codec, and can be decoded (`videoTrack.canDecode()`).
4. **Dimensions & Scaling**:
   - Queries `displayWidth` and `displayHeight`.
   - The smaller dimension is scaled to `thumbnailSize` (adjusted for `window.devicePixelRatio` when in the browser), while the larger dimension scales proportionally to preserve the original aspect ratio.
5. **Frame Extraction**:
   - A Mediabunny `CanvasSink` is created with calculated width and height and `fit: 'fill'`.
   - The frame is extracted at `targetTimestamp` (clamped between `firstTimestamp` and duration) via `sink.getCanvas(...)`.
6. **Blob & URL Creation**:
   - The extracted canvas is converted to a PNG `Blob` via `convertToBlob` or `toBlob`.
   - An object URL (`blob:http://...`) is created via `URL.createObjectURL(blob)`.
   - Finally, `input.dispose()` is executed in a `finally` block to release underlying decoders and streams.
7. **Streaming Results**:
   - Results are emitted via an `Observable<FileThumbnailGenerationResult>`, reporting either success with the generated URL or failure with a normalized error.

---

## 2. Filmstrip Thumbnail Generation

### Overview
Filmstrip thumbnails represent a sequence of frames along a timeline. In a zoomable and scrollable filmstrip editor (such as video segmentation):
- Users can zoom in or out, altering the time interval between consecutive thumbnails (`timeBetweenThumbnails`).
- Users can scroll horizontally along the filmstrip, requesting frames further along the timeline at the current zoom level.
- A single request can encompass multiple video files, each with specific `startTime` and `endTime` boundaries, while sharing a common interval.

### Asynchronous Streaming
Because generating multiple thumbnails can be computationally intensive, the service does not wait for an entire batch to complete before returning. Instead, `generateFilmstripThumbnails` returns an `Observable<FilmstripThumbnailResult>` that emits each individual thumbnail as soon as it is available:
- **Cached / Salvaged Thumbnails**: Emitted immediately.
- **Newly Decoded Thumbnails**: Emitted sequentially as each frame is extracted and converted into an object URL.

### Zoom Levels & The Caching / Salvaging Strategy
Browser memory must be managed strictly because object URLs and canvas framebuffers retain memory until explicitly released. The caching logic balances performance (avoiding re-decoding frames during scrolling) with memory discipline:

1. **Same Zoom Level (Scrolling & Navigation)**:
   - When a new request arrives where `timeBetweenThumbnails` matches the previous request within `INTERVAL_TOLERANCE`
     (0.001s), the filmstrip is at the same zoom level.
   - **All existing stored thumbnails across all files are preserved** in memory. Navigating across the timeline,
     scrolling horizontally, or requesting subsets of files/ranges will **never** discard thumbnails for other files
     or other time ranges on that same zoom level.
   - For every requested timestamp, if a cached thumbnail exists within `TIMESTAMP_TOLERANCE` (0.05s), it is
     **reused** and emitted immediately.
   - Any requested timestamps not already in the cache are decoded, saved into the cache, and emitted.

2. **Different Zoom Level (Zooming In / Out)**:
   - When `timeBetweenThumbnails` changes noticeably, the user has zoomed in or out.
   - The service inspects the newly requested timestamps against all previously cached thumbnails:
     - Any old thumbnail matching a newly requested timestamp within `TIMESTAMP_TOLERANCE` is **salvaged** and retained in the new cache.
     - **All remaining old thumbnails that cannot be salvaged are immediately freed** via `URL.revokeObjectURL(...)` and removed from memory.
   - Uncached timestamps are decoded from the video tracks, stored in the cache, and emitted.

3. **Unclear Cases**:
   - If `timeBetweenThumbnails` is invalid (`<= 0` or `NaN`), or after an explicit reset, the cache is completely purged (`URL.revokeObjectURL`) and generated from scratch.

### Efficient Mediabunny Sequential Decoding & Hardware Decoder Protection
For missing timestamps, the service leverages Mediabunny's `CanvasSink.canvasesAtTimestamps(timestamps)` generator.
This avoids seeking back and forth or re-initializing the decoder for each timestamp; instead, Mediabunny decodes
forwards across the timestamp list in presentation order, minimizing overhead.

### Cancellation & Pipeline Serialization
Video decoding utilizes system hardware decoders via WebCodecs. When a user zooms rapidly or scrubs along the timeline,
spawning multiple concurrent generation requests risks exhausting hardware decoder sessions and causing browser lag:
- **Immediate Input Disposal**: When an active `generateFilmstripThumbnails` subscription is unsubscribed or
  superseded, the service immediately calls `dispose()` on the active Mediabunny `Input`. This cancels active demuxers
  and hardware video decoders instantly without waiting for remaining frames to process.
- **Single-Pipeline Task Serialization**: At most one filmstrip generation pipeline executes at any time. When a new
  request arrives, any prior generation task is signalled to cancel, its active `Input` is disposed, and the service
  awaits the prior task's resolution before beginning the new generation.
- **Eager Cancellation Checks**: Cancellation flags are evaluated before and after all asynchronous operations
  (track retrieval, codec validation, duration computation, and `CanvasSink` creation), as well as between frames
  inside the decoding generator and after blob creation.

---

## 3. Segment Thumbnail Generation

### Overview
Segment thumbnail generation captures a still preview image representing a cut video segment. Segments are
displayed in the segments list (e.g., in the Video Segmentation component) and in the Correlation table.

### Pristine First Frame Extraction
Unlike file thumbnails—which intentionally default to 5 seconds into the video to skip black frames, fade-ins,
or container warmup artifacts—segment thumbnails must always be generated from the pristine first frame of the segment:
- The target timestamp is strictly calculated as `firstTimestamp + Math.max(0, startTime)`, clamped to valid track
  bounds.
- If a segment starts at $t = 0\text{s}$, the thumbnail is extracted from the very first frame (`firstTimestamp`),
  with no arbitrary offset.
- If a segment starts at $t = 15.4\text{s}$, the thumbnail is extracted exactly at `firstTimestamp + 15.4s`.

### Architecture & Pipeline
1. **Request Batching & Concurrency**:
   - `generateSegmentThumbnailUrls` accepts an array of `SegmentThumbnailGenerationRequest` objects (each specifying
     `segmentId`, `mediaFileId`, `file`, `startTime`, and optional `thumbnailSize`).
   - Requests are processed concurrently via RxJS `mergeMap` (defaulting to concurrency of 3).
2. **Mediabunny Frame Extraction**:
   - A Mediabunny `Input` is initialized with `BlobSource(file)` and `ALL_FORMATS`.
   - The primary video track is retrieved, validated (`canDecode()`), and its dimensions measured.
   - A Mediabunny `CanvasSink` is instantiated with the target dimensions, preserving original aspect ratio.
   - `sink.getCanvas(targetTimestamp)` decodes and extracts the canvas at the exact start timestamp.
3. **Blob & Object URL Creation**:
   - The canvas is converted to a PNG `Blob` and wrapped in an object URL (`blob:http://...`).
   - The service records the generated URL in `storedSegmentThumbnails` for centralized lifecycle tracking.
4. **Lifecycle & Cleanup**:
   - `freeSegmentThumbnail(segmentId)`: Revokes the object URL for a deleted or modified segment.
   - `freeSegmentThumbnailsForFile(mediaFileId)`: Revokes all segment thumbnails associated with a removed media file.
   - `freeAllSegmentThumbnails()`: Revokes all stored segment thumbnails.
   - `freeAllThumbnails()`: Cleans up file, filmstrip, and segment thumbnails concurrently on service destruction.

---

## 4. Resource Management & Lifecycle Cleanup

Canvas allocations and Object URLs can leak memory if not revoked. The `Thumbnail` service provides comprehensive cleanup mechanisms:

- `freeAllFilmstripThumbnails()`: Immediately cancels any ongoing filmstrip decoding task, revokes all stored
  filmstrip thumbnail URLs, clears the cache data structure, and resets zoom level tracking.
- `freeFilmstripThumbnailsForFile(mediaFileId: string)`: Revokes and removes only the thumbnails belonging to a specific video file.
- `freeSegmentThumbnail(segmentId: string)`: Revokes the thumbnail URL for an individual segment.
- `freeSegmentThumbnailsForFile(mediaFileId: string)`: Revokes all segment thumbnails belonging to a specific media file.
- `freeAllSegmentThumbnails()`: Revokes all stored segment thumbnail URLs.
- `freeAllThumbnails()`: Frees all filmstrip, segment, and file thumbnail resources.
- `DestroyRef`: The service automatically registers a destroy hook (`destroyRef.onDestroy`) to call `freeAllThumbnails()` when the service or its injection scope is destroyed.

### Integration with `MediaFiles` Service
When a media file is removed via `MediaFiles.removeMediaFile(mediaFileId)`, `MediaFiles` notifies the `Thumbnail` service by calling `thumbnailService.freeFilmstripThumbnailsForFile(mediaFileId)`. This guarantees that deleted files do not leave orphan filmstrip thumbnails in memory.

---

## 5. Timeline & Filmstrip Integration Best Practices

When building zoomable and resizable filmstrip timelines (such as in video segmentation):

1. **Aspect Ratio Preservation & Zero Gaps**:
   - Each thumbnail must preserve the video track's display aspect ratio ($AR = \text{width} / \text{height}$).
   - For a given filmstrip body height $H$, the thumbnail width is $W = H \times AR$.
   - To tile the filmstrip continuously with zero gaps between adjacent thumbnails, calculate the time interval
     between consecutive thumbnails as $\Delta t = W / \text{pixelsPerSecond}$.
   - Request thumbnails at timestamps $0, \Delta t, 2\Delta t, \dots$ up to the duration of each video file.

2. **Zoom Debouncing**:
   - Rapid zoom interactions (such as mouse wheel spinning or holding zoom shortcut keys) can fire tens of events
     per second. Debounce zoom and split-pane resize thumbnail generation requests (e.g., 150ms) to allow instantaneous
     DOM/CSS layout scaling at 60fps while preventing hardware decoder thrashing.

3. **Two-Stage Prioritized Generation**:
   - To provide immediate visual responsiveness, request filmstrip thumbnails in two distinct stages:
     - **Stage 1 (Visible Viewport)**: Request only the sections currently visible on screen ($[X, X + W]$). Because
       this only requires ~5–15 frames, Mediabunny decodes them in ~50–100ms, rendering the user's screen almost
       instantaneously.
     - **Stage 2 (Background Buffer)**: In Stage 1's `complete` handler, request the wider buffered range (e.g.,
       $10\times$ viewport width). Because the zoom interval matches, the service reuses all Stage 1 thumbnails
       directly from memory and populates off-screen buffer thumbnails in the background.

4. **Handling Dynamic Resizing**:
   - If the user resizes the timeline vertically, the filmstrip height $H$ changes, which alters the desired thumbnail
     dimensions. Request fresh filmstrip thumbnails with `thumbnailSize: H`.
   - The service will automatically salvage matching cached frames and decode any newly required resolutions.

5. **Multi-File Timelines**:
   - For timelines with multiple video files arranged consecutively, pass all file sections within a single
     `FilmstripThumbnailsRequest`. This ensures coherent zoom tracking and optimal batch decoding across files.
