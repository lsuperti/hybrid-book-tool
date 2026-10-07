import { TestBed } from '@angular/core/testing';
import { FileRegistry } from './file-registry';

describe('FileRegistry', () => {
  let registry: FileRegistry;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    registry = TestBed.inject(FileRegistry);
  });

  it('should initialize with empty registry', () => {
    expect(registry.getFileCount()).toBe(0);
    expect(registry.getAllFileIds()).toEqual([]);
  });

  it('should register a file and return an ID with refCount 1', () => {
    const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
    const id = registry.register(file);

    expect(id).toMatch(/^fileref-\d+-[a-z0-9]+$/);
    expect(registry.has(id)).toBe(true);
    expect(registry.getFile(id)).toBe(file);
    expect(registry.getRefCount(id)).toBe(1);
    expect(registry.getFileCount()).toBe(1);
  });

  it('should deduplicate same file instance and increment refCount', () => {
    const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
    const id1 = registry.register(file);
    const id2 = registry.register(file);

    expect(id1).toBe(id2);
    expect(registry.getRefCount(id1)).toBe(2);
    expect(registry.getFileCount()).toBe(1);
  });

  it('should retain and release reference counts and purge on zero', () => {
    const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
    const id = registry.register(file);

    registry.retain(id);
    expect(registry.getRefCount(id)).toBe(2);

    registry.release(id);
    expect(registry.getRefCount(id)).toBe(1);
    expect(registry.has(id)).toBe(true);

    registry.release(id);
    expect(registry.getRefCount(id)).toBe(0);
    expect(registry.has(id)).toBe(false);
    expect(registry.getFile(id)).toBeUndefined();
    expect(registry.getFileCount()).toBe(0);
  });

  it('should clear all entries on clear()', () => {
    const f1 = new File(['1'], '1.mp4', { type: 'video/mp4' });
    const f2 = new File(['2'], '2.mp4', { type: 'video/mp4' });

    registry.register(f1);
    registry.register(f2);
    expect(registry.getFileCount()).toBe(2);

    registry.clear();
    expect(registry.getFileCount()).toBe(0);
  });

  it('should support retain, release, and getIdForFile directly with File instance', () => {
    const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
    const id = registry.register(file);

    expect(registry.getIdForFile(file)).toBe(id);

    registry.retain(file);
    expect(registry.getRefCount(id)).toBe(2);

    registry.release(file);
    expect(registry.getRefCount(id)).toBe(1);

    registry.release(file);
    expect(registry.getRefCount(id)).toBe(0);
    expect(registry.has(id)).toBe(false);
  });
});
