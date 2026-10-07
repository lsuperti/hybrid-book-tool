# Text Segmentation Service

The `TextSegmentationService` is responsible for parsing marked text content extracted from PDF documents,
structuring it into a hierarchical segment tree, and managing user-driven segmentation mutations (linking,
exclusion/inclusion, and reordering) with full undo/redo state restoration.

---

## 1. Architectural Overview & PDF Extraction Pipeline

1. **Extraction from PDF.js**:
   - Ingest triggers page-by-page extraction through `ngx-extended-pdf-viewer`.
   - Each page yields `TextContent` containing `TextItem` and `TextMarkedContent` entries.
2. **Sequential IDs vs. PDF.js IDs**:
   - `pdfJsId`: Internal library identifier corresponding to DOM elements in the PDF viewer.
   - `sequentialId`: Stable integer counter generated sequentially according to document appearance order.
     Guarantees canonical indexing across external readers and formats.
3. **Space Exclusion Rules**:
   - `SPACE_EXCLUDED_CHARACTERS` strips spurious trailing spaces before specific punctuation marks (e.g. `.,:;?!`).

---

## 2. Segment Tree Structure & Addressability

Each `TextSegment` contains:
```typescript
export interface TextSegment {
  sequentialId: number;
  pdfJsId: string;
  page: number;
  text: string;
  excluded: boolean;
  linkedChildren: TextSegment[];
}
```

- **Parent Segments**: Top-level segments in the `segments` signal array.
- **Linked Children**: Segments conceptually joined to their parent phrase or heading.
- **Addressability**: `addressableSegments` set maps all active PDF.js IDs for instant $O(1)$ lookup and
  viewer-to-list navigation.

---

## 3. Hierarchy Mutation & Linking Mechanics

The service enforces strict topological rules when segments are linked, excluded, or reordered:

### 3.1 Toggle Segment Linking (`toggleSegmentLinking`)
- **Parent to Child**: If the segment is a top-level parent (and not the very first segment), it is appended to the
  `linkedChildren` of the previous parent segment, and any existing children follow it.
- **Child to Parent**: If the segment is currently a linked child, it is promoted to a parent immediately after its
  former parent, taking all succeeding sibling segments as its new `linkedChildren`.

### 3.2 Exclusion Side-Effects (`excludeSegment` / `includeSegment`)
- Excluded segments remain in the tree with `excluded: true` (rendered with strikethrough styling in the UI).
- **Parent Exclusion**: If an excluded parent has linked children, its first child is automatically promoted to a parent
  segment at the next position, and remaining children are re-linked to that promoted child.
- **Child Exclusion**: An excluded child is promoted to an independent parent segment so its exclusion does not break
  the logical flow of its sibling segments.

### 3.3 Reordering (`moveSegmentUp` / `moveSegmentDown`)
- Parent segments swap positions with adjacent parents.
- Child segments swap with adjacent siblings, or if moved past the boundary, promote to parent rank.

---

## 4. Undo/Redo & State Restoration Mechanics

Because text segmentation mutations involve complex tree rebalancing, individual micro-actions cannot always be reversed
by naive inverse method calls. Instead, the service implements snapshot-based memento restoration:

1. **Deep Cloning (`cloneSegments`)**:
   - Creates a detached deep clone of the entire `TextSegment[]` tree.
2. **Atomic Restoration (`restoreSegments`)**:
   - Replaces `segments` signal atomically.
   - Fully rebuilds `addressableSegments` to guarantee complete DOM synchronization.
3. **Command Encapsulation (`TextSegmentationCommand`)**:
   - Captures `beforeSegments` and `afterSegments` immutable arrays.
   - Reverting calls `restoreSegments(beforeSegments)`, re-applying calls `restoreSegments(afterSegments)`.
