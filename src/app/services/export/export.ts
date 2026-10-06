import { Service, inject } from '@angular/core';
import { MediaFiles } from '../media-files/media-files';
import { TextSegmentationService, TextSegment } from '../text-segmentation/text-segmentation';
import { VideoSegmentationService, VideoSegment } from '../video-segmentation/video-segmentation';
import { XmlElement, XmlDocument } from './xml/xml-builder';
import { ExportFileEntry, TextRecordExporter } from './text-exporter/text-exporter.interface';
import { PdfTextRecordExporter } from './text-exporter/pdf-text-exporter';
import { MediaExporterRegistry } from './media-exporter/media-exporter-registry';
import { CorrelatedMediaPhrase, HybridBookSetDefinition } from './media-exporter/media-exporter.interface';
import { ZipPackager } from './zip/zip-packager';
import { BookImprintMetadata } from '../../components/UI/export/export';

/**
 * Sanitizes a string to be safely used as an archive filename.
 *
 * @param name The original publication title or name.
 * @returns A safe filename string.
 */
export function sanitizeFileName(name: string): string {
  const sanitized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .trim();

  return sanitized.length > 0 ? sanitized : 'livro_hibrido';
}

/**
 * Orchestrator service responsible for assembling and exporting a Hybrid Book 3.0 package.
 */
@Service()
export class ExportService {
  private readonly mediaFilesService = inject(MediaFiles);
  private readonly textSegmentationService = inject(TextSegmentationService);
  private readonly videoSegmentationService = inject(VideoSegmentationService);

  private textRecordExporter: TextRecordExporter = new PdfTextRecordExporter();
  private mediaExporterRegistry = new MediaExporterRegistry();
  private zipPackager = new ZipPackager();

  /**
   * Overrides the text record exporter instance (useful for tests or custom formats).
   *
   * @param exporter The text record exporter.
   */
  public setTextRecordExporter(exporter: TextRecordExporter): void {
    this.textRecordExporter = exporter;
  }

  /**
   * Overrides the media exporter registry instance (useful for tests or custom format support).
   *
   * @param registry The media exporter registry.
   */
  public setMediaExporterRegistry(registry: MediaExporterRegistry): void {
    this.mediaExporterRegistry = registry;
  }

  /**
   * Overrides the zip packager utility (useful for tests).
   *
   * @param packager The zip packager.
   */
  public setZipPackager(packager: ZipPackager): void {
    this.zipPackager = packager;
  }

  /**
   * Validates state, generates all Hybrid Book XML descriptors and file structure, and triggers download.
   *
   * @param metadata Publication metadata entered by the user.
   * @param onProgress Optional callback receiving the export progress ratio from 0.0 to 1.0.
   * @returns A promise resolving to the exported ZIP Blob or void.
   * @throws If prerequisites (PDF or correlated media) are missing.
   */
  public async exportBook(
    metadata: BookImprintMetadata,
    onProgress?: (progressRatio: number) => void
  ): Promise<Blob | void> {
    const textRecord = this.mediaFilesService.textRecord();
    if (!textRecord.file || textRecord.type !== 'application/pdf') {
      throw new Error('Nenhum arquivo de texto PDF válido foi carregado para exportação.');
    }

    const activeTextSegments = this.textSegmentationService.segments().filter((s) => !s.excluded);
    if (activeTextSegments.length === 0) {
      throw new Error('Não há segmentos de texto para exportar.');
    }

    const correlatedVideoSegments = this.videoSegmentationService.correlatedSegments();
    if (correlatedVideoSegments.length === 0) {
      throw new Error('Não há segmentos de vídeo correlacionados para exportar.');
    }

    const phraseCount = Math.min(activeTextSegments.length, correlatedVideoSegments.length);
    if (phraseCount === 0) {
      throw new Error('Não há frases correlacionadas suficientes para exportação.');
    }

    const exportTextSegments: TextSegment[] = activeTextSegments.slice(0, phraseCount);
    const exportVideoPhrases: CorrelatedMediaPhrase<VideoSegment>[] = correlatedVideoSegments
      .slice(0, phraseCount)
      .map((seg, i) => ({
        phraseId: i + 1,
        segment: seg,
      }));

    const textResult = await this.textRecordExporter.exportText({
      file: textRecord.file,
      fallbackUrl: textRecord.url,
      segments: exportTextSegments,
      groupName: 'video_group',
    });

    const videoExporter = this.mediaExporterRegistry.get('video');
    if (!videoExporter) {
      throw new Error('Exportador de formato de vídeo não encontrado no registro.');
    }

    const videoResult = await videoExporter.exportMedia({
      phrases: exportVideoPhrases,
      mediaFiles: this.mediaFilesService.mediaFiles(),
      groupName: 'video_group',
    });

    const setDefinitions: HybridBookSetDefinition[] = [videoResult.setDefinition];

    const syncFileName = 'video.xml';
    const bookXml = this.generateBookXml(metadata, syncFileName, setDefinitions);
    const syncXml = this.generateSyncXml(
      syncFileName,
      metadata.title || 'Video Sync',
      'video_group',
      textResult.mediaElement,
      videoResult.mediaElement
    );
    const outlineXml = this.generateOutlineXml(metadata.title || textRecord.file.name);

    const allEntries: ExportFileEntry[] = [
      { path: 'book.xml', content: bookXml },
      { path: syncFileName, content: syncXml },
      { path: 'outline.xml', content: outlineXml },
      ...textResult.files,
      ...videoResult.files,
    ];

    const downloadName = `${sanitizeFileName(metadata.title || 'livro_hibrido')}.zip`;
    return await this.zipPackager.packageAndSave(allEntries, downloadName, onProgress);
  }

  /**
   * Generates the publication metadata XML (book.xml).
   *
   * @param metadata Publication metadata.
   * @param syncFileName Name of the synchronisation XML file.
   * @param sets Active presentation set definitions.
   * @returns Serialized XML string.
   */
  public generateBookXml(
    metadata: BookImprintMetadata,
    syncFileName: string,
    sets: readonly HybridBookSetDefinition[]
  ): string {
    const bookElement = new XmlElement('book');
    bookElement.addChild(new XmlElement('version', {}, ['3.0.5']));

    const imprintElement = new XmlElement('imprint');

    const addIfNotEmpty = (tag: string, value: string | undefined): void => {
      if (value && value.trim().length > 0) {
        imprintElement.addChild(new XmlElement(tag, {}, [value.trim()]));
      }
    };

    addIfNotEmpty('title', metadata.title);
    addIfNotEmpty('author', metadata.author);
    addIfNotEmpty('illustrations', metadata.illustrations);
    addIfNotEmpty('rendering', metadata.rendering);
    addIfNotEmpty('editorial_revision', metadata.editorialRevisions);
    addIfNotEmpty('performers', metadata.performers);
    addIfNotEmpty('video_engineer', metadata.videoEngineer);
    addIfNotEmpty('video_editing', metadata.videoEditing);
    addIfNotEmpty('sound_engineer', metadata.soundEngineer);
    addIfNotEmpty('sound_editing', metadata.soundEditor);
    addIfNotEmpty('version', metadata.version);
    addIfNotEmpty('published', metadata.published);
    addIfNotEmpty('publisher', metadata.publisher);
    addIfNotEmpty('year', metadata.year);
    addIfNotEmpty('production', metadata.production);

    const orig = metadata.originalBook;
    if (orig) {
      const origElement = new XmlElement('original_book');
      let hasOrigContent = false;

      const addOrigIfNotEmpty = (tag: string, val: string | undefined): void => {
        if (val && val.trim().length > 0) {
          origElement.addChild(new XmlElement(tag, {}, [val.trim()]));
          hasOrigContent = true;
        }
      };

      addOrigIfNotEmpty('author', orig.author);
      addOrigIfNotEmpty('title', orig.title);
      addOrigIfNotEmpty('publication_no', orig.publicationNo);
      addOrigIfNotEmpty('published', orig.published);
      addOrigIfNotEmpty('publisher', orig.publisher);
      addOrigIfNotEmpty('year', orig.year);
      addOrigIfNotEmpty('ISBN', orig.isbn);
      addOrigIfNotEmpty('copyright', orig.copyright);

      if (hasOrigContent) {
        imprintElement.addChild(origElement);
      }
    }

    bookElement.addChild(imprintElement);
    bookElement.addChild(new XmlElement('sync', { file: syncFileName }));

    const setsElement = new XmlElement('sets');
    for (const setDef of sets) {
      setsElement.addChild(new XmlElement('set', {
        title: setDef.title,
        media_group: setDef.mediaGroup,
      }));
    }
    bookElement.addChild(setsElement);

    const doc = new XmlDocument(bookElement, {
      doctype: '<!DOCTYPE book SYSTEM "book_3.0.05-schema.dtd">',
    });

    return doc.toString();
  }

  /**
   * Generates the synchronization data XML (e.g. video.xml).
   *
   * @param fileName Synchronization file name.
   * @param title Synchronization title.
   * @param mediaGroup Main media group identifier.
   * @param textMediaElement Text record media XML element.
   * @param videoMediaElement Video record media XML element.
   * @returns Serialized XML string.
   */
  public generateSyncXml(
    fileName: string,
    title: string,
    mediaGroup: string,
    textMediaElement: XmlElement,
    videoMediaElement: XmlElement
  ): string {
    const syncElement = new XmlElement('sync', {
      file: fileName,
      title: title,
      media_group: mediaGroup,
    });

    syncElement.addChild(new XmlElement('version', {}, ['3.0.12']));
    syncElement.addChild(textMediaElement);
    syncElement.addChild(videoMediaElement);

    const doc = new XmlDocument(syncElement, {
      doctype: '<!DOCTYPE book SYSTEM "sync_3.0.12-schema.dtd">',
    });

    return doc.toString();
  }

  /**
   * Generates navigation outline XML (outline.xml).
   *
   * @param title Book or document title.
   * @returns Serialized XML string.
   */
  public generateOutlineXml(title: string): string {
    const outlineElement = new XmlElement('outline');
    const itemElement = new XmlElement('item');

    itemElement.addChild(new XmlElement('id', {}, ['1']));
    itemElement.addChild(new XmlElement('text', {}, [title], true));
    itemElement.addChild(new XmlElement('level', {}, ['1']));

    outlineElement.addChild(itemElement);

    const doc = new XmlDocument(outlineElement, {
      doctype: '<!DOCTYPE book SYSTEM "sync_3.0.02-schema.dtd">',
    });

    return doc.toString();
  }
}
