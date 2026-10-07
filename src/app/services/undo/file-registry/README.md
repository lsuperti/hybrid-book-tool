# File Registry Service

The `FileRegistry` service manages in-memory references to large binary `File` objects (videos, audio, PDFs).
It solves the critical problem of memory retention in single-page browser applications: how to support full Undo/Redo
and future file persistence without cloning gigabytes of media data or losing file handles when files are deleted.

---

## 1. Problem & Architecture

### The Large File Challenge
- Video files can be several hundred megabytes to gigabytes in size.
- If an undo command stores a copy of the binary `File` or duplicates `ArrayBuffer` data, memory usage grows
  linearly with each undo step, causing browser crashes (OOM).
- Conversely, if a user removes a media file and the application drops the `File` handle, browser garbage collection
  discards the underlying OS file pointer. Undoing the file removal would then be impossible without asking the user
  to select the file from disk again.

### Reference-Counted Handle Pooling
`FileRegistry` acts as a centralized handle pool:
1. **Deduplication**: Multiple references to the same `File` (or matching metadata name/size/lastModified) share a
   single registered entry and reference ID (`fileRefId`).
2. **Reference Counting**:
   - When a media file is active in `MediaFiles`, its `fileRefId` has a ref count $\ge 1$.
   - When an `AddMediaFilesCommand` or `RemoveMediaFileCommand` references the file, the command retains the `fileRefId`.
   - When a file is removed from `MediaFiles`, its ref count decrements. But as long as an undo command in the history
     references it, ref count remains $> 0$, keeping the `File` instance reachable.
   - When the undo command is eventually evicted from history or history is cleared, `release()` decrements ref count
     to $0$, releasing the `File` handle for browser garbage collection.

---

## 2. Object URLs & Ephemeral Data Lifecycle

- **Binary vs. Ephemeral Separation**:
  - `FileRegistry` stores *only* the `File` object itself.
  - Object URLs (`blob:http://...`) and Canvas thumbnails are ephemeral. They are **never** stored in the registry
    or in undo commands.
- **Re-creation on Demand**:
  - When an undo action restores a media file, `URL.createObjectURL(file)` generates a fresh ephemeral URL.
  - The `Thumbnail` service asynchronously re-generates or retrieves cached thumbnails on demand.
  - This guarantees that deleted files do not leak DOM/GPU texture memory while waiting in the undo stack.

---

## 3. Synergy with Future Save/Load System

The `fileRefId` format used by `FileRegistry` directly corresponds to the serialized `MediaFileState.fileRefId` in the
canonical `ProjectState` schema:
- When exporting a project bundle (e.g. ZIP or directory), `FileRegistry.getFile(fileRefId)` retrieves the raw bytes to
  package into the archive.
- When loading a saved project bundle, the importer registers unpacked files into `FileRegistry` with their saved IDs,
  seamlessly reconstructing the live project without modifying domain services.
