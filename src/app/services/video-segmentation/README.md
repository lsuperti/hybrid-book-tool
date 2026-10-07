# Video Segmentation Service

The `VideoSegmentationService` manages the temporal segmentation of video files, time boundaries, split/join mechanics,
and correlation ordering for the Hybrid Book Tool.

---

## 1. Architectural Overview & Dual Ordering System

The service maintains two distinct ordering paradigms simultaneously:

1. **Temporal Order (`segments`)**:
   - Segments are strictly ordered chronologically by video file and start timestamp (`startTime`).
   - Represents the chronological cuts of the physical video media.
2. **Correlation Order (`correlationOrder` & `correlatedSegments`)**:
   - An array of segment IDs (`string[]`) determining the sequence in which video phrases correlate with text phrases.
   - Preserves custom reordering configured in the Correlation component.
   - When new segments are created, their IDs are appended to `correlationOrder`; when deleted, their IDs are removed.

---

## 2. Segment Boundaries & Constraint Enforcement

```typescript
export interface VideoSegment {
  id?: string;
  fileId: MediaFileId;
  name: string;
  startTime: number;
  endTime: number;
  thumbnail: string | null;
}
```

### Boundary Clamping Rules
- **Non-Overlapping**: A segment's `startTime` cannot be moved before the previous segment's `endTime`, and its
  `endTime` cannot exceed the next segment's `startTime`.
- **Minimum Duration**: Enforces `MIN_SEGMENT_DURATION_OFFSET` (0.033s / ~1 frame) so segments cannot collapse to zero length.
- **File Duration Bounds**: Clamped between $0$ and the video's total duration measured via Mediabunny.

---

## 3. Core Segmentation Operations

### 3.1 Splitting Segments (`splitSegment`)
- **Inside Existing Segment**: If the playhead timestamp falls strictly within a segment $[t_{\text{start}}, t_{\text{end}}]$,
  it divides into two contiguous segments: $[t_{\text{start}}, t_{\text{split}}]$ and $[t_{\text{split}}, t_{\text{end}}]$.
  The original segment ID is preserved on the left half, and a new segment ID is generated for the right half.
- **In Unsegmented Gap**: If the playhead is in an unsegmented gap, creates a new 1-second segment (or clamped to the next
  boundary).

### 3.2 Joining Segments (`joinSegments`)
- Evaluates whether two adjacent segments have a common boundary or unsegmented gap $\le \text{JOIN\_NEAR\_THRESHOLD}$ (1s).
- Merges the two segments into one spanning $[t_{\text{left.start}}, t_{\text{right.end}}]$.
- Frees thumbnail resources of the discarded right segment and preserves the left segment ID.

### 3.3 Boundary Scrubbing & Tab Dragging
- `updateSegmentStart` and `updateSegmentEnd` dynamically re-calculate segment names and enforce non-overlapping constraints.
- Thumbnail generation requests are debounced by 250ms during continuous scrubbing to prevent hardware decoder thrashing.

---

## 4. Undo/Redo & State Restoration Mechanics

To support instantaneous undo/redo without binary duplication:

1. **`restoreSegmentationState(segments, correlationOrder)`**:
   - Cancels pending thumbnail debounce timers for any segments removed by the restoration.
   - Restores segments array in strict temporal order.
   - Restores the correlation order array.
   - Re-requests thumbnails for restored segments on demand via `Thumbnail` service.
2. **`restoreCorrelationOrder(correlationOrder)`**:
   - Re-applies correlation array mutations in $O(1)$.
3. **Continuous Coalescing**:
   - Dragging tabs or scrubbing arrow keys dispatches `UpdateSegmentBoundaryCommand`, which coalesces updates
     within 800ms to preserve a clean single undo step per adjustment.
