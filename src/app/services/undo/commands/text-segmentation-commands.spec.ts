import { vi } from 'vitest';
import { TextSegmentationCommand } from './text-segmentation-commands';
import { type TextSegmentationService, type TextSegment } from '../../text-segmentation/text-segmentation';

describe('TextSegmentationCommand', () => {
  it('should restore beforeSegments on undo and afterSegments on redo', () => {
    const mockService = {
      restoreSegments: vi.fn(),
    } as unknown as TextSegmentationService;

    const beforeSegments: TextSegment[] = [
      {
        sequentialId: 0,
        pdfJsId: '1',
        page: 1,
        text: 'Segmento 1',
        excluded: false,
        linkedChildren: [],
      },
    ];

    const afterSegments: TextSegment[] = [
      {
        sequentialId: 0,
        pdfJsId: '1',
        page: 1,
        text: 'Segmento 1',
        excluded: true,
        linkedChildren: [],
      },
    ];

    const cmd = new TextSegmentationCommand(
      'Excluir segmento de texto',
      beforeSegments,
      afterSegments,
      mockService
    );

    cmd.undo();
    expect(mockService.restoreSegments).toHaveBeenCalledWith(beforeSegments);

    cmd.redo();
    expect(mockService.restoreSegments).toHaveBeenCalledWith(afterSegments);
  });
});
