import { type MediaFileId } from '../media-files/media-files';
import { type BookImprintMetadata } from '../../components/UI/export/export';

/**
 * Domain category for undo/redo commands.
 */
export type UndoCommandCategory =
  | 'media' |
  'text-segmentation' |
  'video-segmentation' |
  'correlation' |
  'export';

/**
 * Interface representing an executable, undoable, and redoable command.
 */
export interface UndoCommand {

  /** Human-readable description of the user action (e.g. 'Dividir segmento'). */
  readonly description: string,

  /** Domain category for filtering or diagnostics. */
  readonly category: UndoCommandCategory,

  /** Reverts the action executed by this command. */
  undo(): void | Promise<void>,

  /** Re-applies the action reverted by this command. */
  redo(): void | Promise<void>,

  /**
   * Optional hook to coalesce rapid consecutive micro-actions (e.g. continuous typing or scrubbing).
   * Returns true if nextCommand was merged into this command, preventing a new stack entry.
   */
  mergeWith?(nextCommand: UndoCommand): boolean,

  /**
   * Optional lifecycle hook invoked when the command is permanently evicted from history or discarded.
   * Enables releasing retained resources such as FileRegistry handles or temporary subscriptions.
   */
  destroy?(): void,
}

/**
 * Configuration options for the undo/redo service history.
 */
export interface UndoHistoryOptions {

  /** Maximum number of commands preserved in the undo stack. Defaults to 50. */
  maxHistoryLength?: number,
}

/**
 * Canonical serializable state of an ingested media file reference.
 */
export interface MediaFileState {
  id: MediaFileId,
  name: string,
  fileRefId: string,
}

/**
 * Canonical serializable state of the ingested text record (PDF document).
 */
export interface TextRecordState {
  fileRefId: string | null,
  name: string | null,
  type: 'application/pdf' | 'invalid' | null,
}

/**
 * Canonical serializable state of a text segment in the hierarchy.
 */
export interface TextSegmentState {
  sequentialId: number,
  pdfJsId: string,
  page: number,
  text: string,
  excluded: boolean,
  linkedChildren: TextSegmentState[],
}

/**
 * Canonical serializable state of a video cut segment without ephemeral thumbnail data.
 */
export interface VideoSegmentState {
  id: string,
  fileId: MediaFileId,
  name: string,
  startTime: number,
  endTime: number,
}

/**
 * Unified project memento schema shared between undo/redo state restoration
 * and future disk project persistence (save/load).
 */
export interface ProjectState {
  version: string,
  mediaFiles: MediaFileState[],
  textRecord: TextRecordState,
  textSegments: TextSegmentState[],
  videoSegments: VideoSegmentState[],
  correlationOrder: string[],
  exportMetadata: BookImprintMetadata,
}
