# State Persistence & Shared Memento Architecture

This document defines the **Unified Project State (`ProjectState`)** contract and the architectural synergy between
the **Undo/Redo command system** and future **project disk persistence (Save / Load)**.

---

## 1. The Unified State Memento Concept

In complex authoring tools, implementing Undo/Redo and Project Save/Load as two separate, disconnected systems leads
to code duplication, divergent bugs, and migration headaches.

In this architecture, both systems share the exact same canonical state representation:

```
┌────────────────────────────────────────────────────────┐
│                   Live Reactive Signals                │
│ (mediaFiles, textRecord, segments, correlation, forms) │
└──────────────┬──────────────────────────▲──────────────┘
               │                          │
        Captures Memento           Restores Memento
               │                          │
               ▼                          │
┌─────────────────────────────────────────┴──────────────┐
│            Canonical ProjectState Memento              │
│    (JSON-serializable descriptor + FileRegistry)       │
└─────────────┬──────────────────────────▲───────────────┘
              │                          │
      ┌───────┴──────┐           ┌───────┴──────┐
      ▼              ▼           ▲              ▲
 ┌─────────┐     ┌────────┐ ┌─────────┐     ┌────────┐
 │  Undo   │     │ Disk   │ │  Redo   │     │ Disk   │
 │ Command │     │ Save   │ │ Command │     │ Load   │
 └─────────┘     └────────┘ └─────────┘     └────────┘
```

1. **Discrete State Deltas**: Undo commands store small, targeted subsets of the canonical schema (e.g., an array of
   `TextSegmentState` or `VideoSegmentState`).
2. **Unified Snapshot**: Saving a project to disk simply packages the full `ProjectState` JSON manifest together with
   the binary media files held in `FileRegistry`.
3. **DRY State Restoration**: Loading a project from disk and undoing/redoing use identical domain service restoration
   methods (`restoreSegments`, `restoreSegmentationState`, `restoreMediaFiles`).

---

## 2. Canonical Schema Definition

The interface defined in `src/app/services/undo/undo-state.interface.ts` serves as the authoritative specification:

```typescript
export interface ProjectState {
  version: string;
  mediaFiles: MediaFileState[];
  textRecord: TextRecordState;
  textSegments: TextSegmentState[];
  videoSegments: VideoSegmentState[];
  correlationOrder: string[];
  exportMetadata: BookImprintMetadata;
}
```

### 2.1 Domain Sub-States
- **`MediaFileState`**:
  `{ id: MediaFileId, name: string, fileRefId: string }`
  Links live media file IDs to persistent registry handles.
- **`TextRecordState`**:
  `{ fileRefId: string | null, name: string | null, type: 'application/pdf' | 'invalid' | null }`
  Tracks the base document and its registry handle.
- **`TextSegmentState`**:
  Hierarchical JSON tree of segments (`sequentialId`, `pdfJsId`, `page`, `text`, `excluded`, `linkedChildren`).
- **`VideoSegmentState`**:
  Array of cut boundaries (`id`, `fileId`, `name`, `startTime`, `endTime`).
- **`correlationOrder`**:
  Array of segment IDs establishing correlation alignment between text phrases and video phrases.
- **`exportMetadata`**:
  Standardized imprint and original book publication metadata.

---

## 3. Ephemeral Exclusion Guarantee

To protect browser memory and keep project manifest files tiny:
- **No Object URLs (`blob:http...`)**: Never written to mementos or manifests.
- **No Canvas Framebuffers or Thumbnails**: Never serialized. Reconstructed on demand by the `Thumbnail` service.
- **No Binary Blobs in JSON**: Binary bytes reside strictly in `FileRegistry` or OPFS, referenced only by `fileRefId`.

---

## 4. Disk Bundle Packaging (Future Importer / Exporter)

When saving a complete project archive:
1. `ProjectState` is serialized to a `project.json` manifest.
2. For each `fileRefId` in `mediaFiles` and `textRecord`, the binary `File` is fetched from `FileRegistry` and written
   to a `media/` folder inside the archive.
3. On load, the importer reads `project.json`, populates `FileRegistry` with extracted files, and restores all domain
   services in a single atomic transaction.
