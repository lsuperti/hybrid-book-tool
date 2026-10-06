import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ExportService, sanitizeFileName } from './export';
import { MediaFiles } from '../media-files/media-files';
import { TextSegmentationService } from '../text-segmentation/text-segmentation';
import { VideoSegmentationService } from '../video-segmentation/video-segmentation';
import { BookImprintMetadata } from '../../components/UI/export/export';
import { ZipPackager } from './zip/zip-packager';
import { XmlElement } from './xml/xml-builder';

describe('ExportService', () => {
  let service: ExportService;
  let mediaFilesService: MediaFiles;
  let textSegmentationService: TextSegmentationService;
  let videoSegmentationService: VideoSegmentationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ExportService, MediaFiles, TextSegmentationService, VideoSegmentationService],
    });

    service = TestBed.inject(ExportService);
    mediaFilesService = TestBed.inject(MediaFiles);
    textSegmentationService = TestBed.inject(TextSegmentationService);
    videoSegmentationService = TestBed.inject(VideoSegmentationService);
  });

  describe('sanitizeFileName', () => {
    it('should strip accents and special characters and normalize whitespace', () => {
      expect(sanitizeFileName('História do Brasil: Volume 1!')).toBe('Historia_do_Brasil_Volume_1');
      expect(sanitizeFileName('  Livro  Híbrido  ')).toBe('Livro_Hibrido');
    });

    it('should fallback to livro_hibrido if empty', () => {
      expect(sanitizeFileName('')).toBe('livro_hibrido');
      expect(sanitizeFileName('???')).toBe('livro_hibrido');
    });
  });

  describe('generateBookXml', () => {
    it('should generate book.xml conforming to specification with editorial_revision and sound_editing', () => {
      const metadata: BookImprintMetadata = {
        title: 'Livro Teste',
        author: 'Autor Teste',
        illustrations: 'Ilustrador Teste',
        rendering: 'Tradutor Teste',
        editorialRevisions: 'Revisor Teste',
        performers: 'Interprete Teste',
        videoEngineer: 'Diretor Video',
        videoEditing: 'Editor Video',
        soundEngineer: 'Diretor Som',
        soundEditor: 'Editor Som',
        version: '1.0',
        published: 'Sao Paulo',
        publisher: 'Editora Teste',
        year: '2026',
        production: 'Equipe Teste',
        originalBook: {
          author: 'Autor Original',
          title: 'Titulo Original',
          publicationNo: '1',
          published: 'Rio de Janeiro',
          publisher: 'Editora Original',
          year: '2010',
          isbn: '978-000',
          copyright: '2010 Autor Original',
        },
      };

      const xml = service.generateBookXml(metadata, 'video.xml', [
        { title: 'video', mediaGroup: 'video_group' },
      ]);

      expect(xml).toContain('<!DOCTYPE book SYSTEM "book_3.0.05-schema.dtd">');
      expect(xml).toContain('<version>3.0.5</version>');
      expect(xml).toContain('<title>Livro Teste</title>');
      expect(xml).toContain('<editorial_revision>Revisor Teste</editorial_revision>');
      expect(xml).toContain('<sound_editing>Editor Som</sound_editing>');
      expect(xml).toContain('<original_book>');
      expect(xml).toContain('<ISBN>978-000</ISBN>');
      expect(xml).toContain('<sync file="video.xml" />');
      expect(xml).toContain('<set title="video" media_group="video_group" />');
    });

    it('should omit empty imprint and original_book elements', () => {
      const metadata: BookImprintMetadata = {
        title: 'Titulo Minimo',
        author: '',
        illustrations: '',
        rendering: '',
        editorialRevisions: '',
        performers: '',
        videoEngineer: '',
        videoEditing: '',
        soundEngineer: '',
        soundEditor: '',
        version: '',
        published: '',
        publisher: '',
        year: '',
        production: '',
        originalBook: {
          author: '',
          title: '',
          publicationNo: '',
          published: '',
          publisher: '',
          year: '',
          isbn: '',
          copyright: '',
        },
      };

      const xml = service.generateBookXml(metadata, 'video.xml', []);
      expect(xml).toContain('<title>Titulo Minimo</title>');
      expect(xml).not.toContain('<editorial_revision>');
      expect(xml).not.toContain('<original_book>');
    });
  });

  describe('generateSyncXml', () => {
    it('should generate sync XML structure', () => {
      const textElem = new XmlElement('media', { type: 'text' });
      const videoElem = new XmlElement('media', { type: 'video' });

      const xml = service.generateSyncXml('video.xml', 'Sync Title', 'video_group', textElem, videoElem);
      expect(xml).toContain('<!DOCTYPE book SYSTEM "sync_3.0.12-schema.dtd">');
      expect(xml).toContain('<sync file="video.xml" title="Sync Title" media_group="video_group">');
      expect(xml).toContain('<version>3.0.12</version>');
    });
  });

  describe('generateOutlineXml', () => {
    it('should generate outline.xml with CDATA title', () => {
      const xml = service.generateOutlineXml('Dicionário Visual');
      expect(xml).toContain('<!DOCTYPE book SYSTEM "sync_3.0.02-schema.dtd">');
      expect(xml).toContain('<text><![CDATA[Dicionário Visual]]></text>');
      expect(xml).toContain('<level>1</level>');
    });
  });

  describe('exportBook validation & export pipeline', () => {
    const emptyMetadata: BookImprintMetadata = {
      title: 'Minha Obra',
      author: 'Autor',
      illustrations: '',
      rendering: '',
      editorialRevisions: '',
      performers: '',
      videoEngineer: '',
      videoEditing: '',
      soundEngineer: '',
      soundEditor: '',
      version: '',
      published: '',
      publisher: '',
      year: '',
      production: '',
      originalBook: {
        author: '',
        title: '',
        publicationNo: '',
        published: '',
        publisher: '',
        year: '',
        isbn: '',
        copyright: '',
      },
    };

    it('should throw an error when text record is missing or not a PDF', async () => {
      mediaFilesService.textRecord.set({ file: null, type: null, url: null });
      await expect(service.exportBook(emptyMetadata)).rejects.toThrow(
        'Nenhum arquivo de texto PDF válido foi carregado para exportação.'
      );
    });

    it('should throw an error when active text segments are empty', async () => {
      const dummyPdf = new File(['%PDF'], 'book.pdf', { type: 'application/pdf' });
      mediaFilesService.setTextRecord(dummyPdf);
      textSegmentationService.segments.set([]);

      await expect(service.exportBook(emptyMetadata)).rejects.toThrow(
        'Não há segmentos de texto para exportar.'
      );
    });

    it('should throw an error when correlated video segments are empty', async () => {
      const dummyPdf = new File(['%PDF'], 'book.pdf', { type: 'application/pdf' });
      mediaFilesService.setTextRecord(dummyPdf);
      textSegmentationService.segments.set([
        {
          sequentialId: 0,
          pdfJsId: 'p0',
          page: 1,
          text: 'Texto',
          excluded: false,
          linkedChildren: [],
        },
      ]);
      videoSegmentationService.segments.set([]);

      await expect(service.exportBook(emptyMetadata)).rejects.toThrow(
        'Não há segmentos de vídeo correlacionados para exportar.'
      );
    });

    it('should assemble package and trigger download on valid export', async () => {
      const dummyPdf = new File(['%PDF-1.4 dummy'], 'sample.pdf', { type: 'application/pdf' });
      const dummyVideo = new File(['dummy-video'], 'clip.mp4', { type: 'video/mp4' });

      mediaFilesService.setTextRecord(dummyPdf);
      mediaFilesService.addMediaFiles([dummyVideo]);
      const addedMediaFile = mediaFilesService.mediaFiles()[0];

      textSegmentationService.segments.set([
        {
          sequentialId: 0,
          pdfJsId: 'p0',
          page: 1,
          text: 'Primeiro parágrafo',
          excluded: false,
          linkedChildren: [],
        },
      ]);

      videoSegmentationService.segments.set([
        {
          id: 'seg-1',
          fileId: addedMediaFile.id,
          name: 'Segmento 1',
          startTime: 0,
          endTime: 5,
          thumbnail: null,
        },
      ]);
      videoSegmentationService.correlationOrder.set(['seg-1']);

      const mockPackager = {
        packageAndSave: vi.fn().mockResolvedValue(new Blob(['dummy-zip'], { type: 'application/zip' })),
      } as unknown as ZipPackager;
      service.setZipPackager(mockPackager);

      const blob = await service.exportBook(emptyMetadata);

      expect(blob).toBeTruthy();
      expect(mockPackager.packageAndSave).toHaveBeenCalledWith(
        expect.any(Array),
        'Minha_Obra.zip',
        undefined
      );
    });

    it('should forward onProgress callback to zipPackager.packageAndSave', async () => {
      const dummyPdf = new File(['%PDF-1.4 dummy'], 'sample.pdf', { type: 'application/pdf' });
      const dummyVideo = new File(['dummy-video'], 'clip.mp4', { type: 'video/mp4' });

      mediaFilesService.setTextRecord(dummyPdf);
      mediaFilesService.addMediaFiles([dummyVideo]);
      const addedMediaFile = mediaFilesService.mediaFiles()[0];

      textSegmentationService.segments.set([
        {
          sequentialId: 0,
          pdfJsId: 'p0',
          page: 1,
          text: 'Primeiro parágrafo',
          excluded: false,
          linkedChildren: [],
        },
      ]);

      videoSegmentationService.segments.set([
        {
          id: 'seg-1',
          fileId: addedMediaFile.id,
          name: 'Segmento 1',
          startTime: 0,
          endTime: 5,
          thumbnail: null,
        },
      ]);
      videoSegmentationService.correlationOrder.set(['seg-1']);

      const mockPackager = {
        packageAndSave: vi.fn().mockResolvedValue(new Blob(['dummy-zip'], { type: 'application/zip' })),
      } as unknown as ZipPackager;
      service.setZipPackager(mockPackager);

      const progressCb = vi.fn();
      await service.exportBook(emptyMetadata, progressCb);

      expect(mockPackager.packageAndSave).toHaveBeenCalledWith(
        expect.any(Array),
        'Minha_Obra.zip',
        progressCb
      );
    });
  });
});
