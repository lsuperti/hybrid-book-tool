import { MediaFormatExporter } from './media-exporter.interface';
import { VideoMediaExporter } from './video-media-exporter';

/**
 * Registry holding all available media format exporters for Hybrid Book packaging.
 */
export class MediaExporterRegistry {
  private readonly exporters = new Map<string, MediaFormatExporter<unknown>>();

  constructor() {
    this.register(new VideoMediaExporter() as unknown as MediaFormatExporter<unknown>);
  }

  /**
   * Registers a media format exporter.
   *
   * @param exporter The media exporter instance.
   */
  public register(exporter: MediaFormatExporter<unknown>): void {
    this.exporters.set(exporter.mediaType, exporter);
  }

  /**
   * Unregisters a media format exporter by its media type.
   *
   * @param mediaType The media type identifier.
   */
  public unregister(mediaType: string): void {
    this.exporters.delete(mediaType);
  }

  /**
   * Retrieves a media format exporter by its media type.
   *
   * @param mediaType The media type identifier.
   * @returns The registered exporter, or undefined if not found.
   */
  public get(mediaType: string): MediaFormatExporter<unknown> | undefined {
    return this.exporters.get(mediaType);
  }

  /**
   * Returns all currently registered media format exporters.
   *
   * @returns Array of registered exporters.
   */
  public getAll(): MediaFormatExporter<unknown>[] {
    return Array.from(this.exporters.values());
  }
}
