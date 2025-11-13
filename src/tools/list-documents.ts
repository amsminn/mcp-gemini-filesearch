/**
 * list_documents 도구 구현
 *
 * 인덱싱된 문서 목록을 페이지네이션과 함께 조회합니다.
 */

import { geminiClient } from '../lib/gemini-client.js';
import { logger } from '../lib/logger.js';
import { handleErrors } from '../lib/error-handler.js';
import {
  ListDocumentsInputSchema,
  type ListDocumentsInput,
  type ListDocumentsOutput,
} from '../lib/validators.js';

/**
 * list_documents MCP 도구 핸들러
 *
 * @param input - 목록 조회 요청 (page, page_size, filters)
 * @returns 문서 목록 및 페이징 정보
 */
export async function listDocuments(input: unknown): Promise<ListDocumentsOutput> {
  const timer = logger.startTimer();

  return handleErrors(async () => {
    // 입력 검증
    const validatedInput = ListDocumentsInputSchema.parse(input) as ListDocumentsInput;
    logger.debug('list_documents tool called', {
      page: validatedInput.page,
      page_size: validatedInput.page_size,
      has_filters: !!validatedInput.filters,
    });

    // Gemini 클라이언트를 통해 문서 목록 조회
    const { documents, totalCount } = await geminiClient.listDocuments(
      validatedInput.page,
      validatedInput.page_size,
      validatedInput.filters
    );

    const totalPages = Math.ceil(totalCount / validatedInput.page_size);

    const latency = timer();
    logger.info('list_documents completed', {
      page: validatedInput.page,
      documents_count: documents.length,
      total_count: totalCount,
      total_latency_ms: latency,
    });

    return {
      success: true,
      documents,
      total_count: totalCount,
      page: validatedInput.page,
      page_size: validatedInput.page_size,
      total_pages: totalPages,
    };
  }, 'listDocuments');
}

/**
 * list_documents 도구 메타데이터 (MCP 서버 등록용)
 */
export const listDocumentsToolMetadata = {
  name: 'list_documents',
  description:
    'List all indexed documents with pagination and optional filters. Returns document metadata including title, authors, year, and tags.',
  inputSchema: {
    type: 'object',
    properties: {
      page: {
        type: 'number',
        description: 'Page number (1-indexed, default: 1)',
        default: 1,
      },
      page_size: {
        type: 'number',
        description: 'Results per page (default: 20, max: 100)',
        default: 20,
      },
      filters: {
        type: 'object',
        description: 'Optional filters',
        properties: {
          year_min: {
            type: 'number',
            description: 'Minimum publication year',
          },
          year_max: {
            type: 'number',
            description: 'Maximum publication year',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by document tags',
          },
          authors: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by authors',
          },
        },
      },
    },
  },
};
