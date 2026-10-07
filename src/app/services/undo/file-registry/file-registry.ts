import { Service, inject, DestroyRef } from '@angular/core';

interface FileRegistryEntry {
  file: File,
  refCount: number,
}

/**
 * Service managing in-memory references to large binary `File` objects.
 * Prevents browser garbage collection while files are referenced by active project state or reachable undo/redo
 * commands, while deduplicating file instances to avoid memory bloat.
 */
@Service()
export class FileRegistry {
  private readonly destroyRef = inject(DestroyRef, { optional: true });
  private readonly entries = new Map<string, FileRegistryEntry>();
  private readonly fileToIdMap = new WeakMap<File, string>();

  constructor() {
    this.destroyRef?.onDestroy(() => {
      this.clear();
    });
  }

  /**
   * Registers a file with the registry or increments its reference count if already present.
   *
   * @param file The browser `File` object to register.
   * @param preferredId Optional preferred identifier to assign if the file is new.
   * @returns The unique string ID associated with this file.
   */
  public register(file: File, preferredId?: string): string {
    const existingId = this.fileToIdMap.get(file);
    if (existingId && this.entries.has(existingId)) {
      const entry = this.entries.get(existingId)!;
      entry.refCount++;
      return existingId;
    }

    // Check if an identical file already exists by metadata match
    for (const [id, entry] of this.entries.entries()) {
      if (
        entry.file === file ||
        (entry.file.name === file.name &&
          entry.file.size === file.size &&
          entry.file.lastModified === file.lastModified &&
          entry.file.type === file.type)
      ) {
        entry.refCount++;
        this.fileToIdMap.set(file, id);
        return id;
      }
    }

    const id = preferredId && !this.entries.has(preferredId) ? preferredId : this.createFileRefId();
    this.entries.set(id, { file, refCount: 1 });
    this.fileToIdMap.set(file, id);
    return id;
  }

  /**
   * Retrieves the registered file ID for a given File object, if registered.
   *
   * @param file The file object to look up.
   * @returns The registered string ID or undefined.
   */
  public getIdForFile(file: File): string | undefined {
    return this.fileToIdMap.get(file);
  }

  /**
   * Increments the reference count for an existing file ID or File object.
   *
   * @param target The registered file identifier or File object.
   */
  public retain(target: string | File): void {
    const id = typeof target === 'string' ? target : this.fileToIdMap.get(target);
    if (!id) {
      return;
    }
    const entry = this.entries.get(id);
    if (entry) {
      entry.refCount++;
    }
  }

  /**
   * Decrements the reference count for an existing file ID or File object, purging the entry if ref count hits 0.
   *
   * @param target The registered file identifier or File object.
   */
  public release(target: string | File): void {
    const id = typeof target === 'string' ? target : this.fileToIdMap.get(target);
    if (!id) {
      return;
    }
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }

    entry.refCount--;
    if (entry.refCount <= 0) {
      this.entries.delete(id);
    }
  }

  /**
   * Retrieves a registered file by its ID.
   *
   * @param id The registered file identifier.
   * @returns The corresponding `File` object, or undefined if not registered.
   */
  public getFile(id: string): File | undefined {
    return this.entries.get(id)?.file;
  }

  /**
   * Checks whether a file ID is currently registered.
   *
   * @param id The registered file identifier.
   * @returns True if registered, false otherwise.
   */
  public has(id: string): boolean {
    return this.entries.has(id);
  }

  /**
   * Retrieves the current reference count of a registered file.
   *
   * @param id The registered file identifier.
   * @returns The reference count, or 0 if not found.
   */
  public getRefCount(id: string): number {
    return this.entries.get(id)?.refCount ?? 0;
  }

  /**
   * Returns the count of distinct registered files in memory.
   *
   * @returns Total number of distinct files.
   */
  public getFileCount(): number {
    return this.entries.size;
  }

  /**
   * Returns all active file IDs in the registry.
   *
   * @returns Array of registered file IDs.
   */
  public getAllFileIds(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Purges all registered files from memory.
   */
  public clear(): void {
    this.entries.clear();
  }

  /**
   * Generates a unique identifier for a registered file.
   *
   * @returns A unique string ID.
   */
  private createFileRefId(): string {
    return `fileref-${Date.now()}-${Math.random().toString(36)
      .slice(2, 8)}`;
  }
}
