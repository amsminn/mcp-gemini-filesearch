/**
 * get_passages 도구 구현
 *
 * 특정 문서의 지정된 페이지 범위 내용을 조회합니다.
 */

import { geminiClient } from '../lib/gemini-client.js';
import { logger } from '../lib/logger.js';
import { handleErrors } from '../lib/error-handler.js';
import {
  GetPassagesInputSchema,
  type GetPassagesInput,
  type GetPassagesOutput,
} from '../lib/validators.js';

/**
 * get_passages MCP 도구 핸들러
 *
 * @param input - 페이지 조회 요청 (doc_id, page_spans)
 * @returns 페이지 내용 목록
 */
export async function getPassages(input: unknown): Promise<GetPassagesOutput> {
  const timer = logger.startTimer();

  return handleErrors(async () => {
    // 입력 검증
    const validatedInput = GetPassagesInputSchema.parse(input) as GetPassagesInput;
    logger.debug('get_passages tool called', {
      doc_id: validatedInput.doc_id,
      page_spans_count: validatedInput.page_spans.length,
    });

    // 파일 정보 조회 (파일명 확인)
    const allDocs = await geminiClient.listDocuments(1, 100);
    const doc = allDocs.documents.find((d) => d.doc_id === validatedInput.doc_id);
    const fileName = doc?.file_name || 'unknown';

    // Gemini 클라이언트를 통해 페이지 내용 조회
    const passages = await geminiClient.getPassages(
      validatedInput.doc_id,
      validatedInput.page_spans
    );

    const latency = timer();
    logger.info('get_passages completed', {
      doc_id: validatedInput.doc_id,
      file_name: fileName,
      passages_count: passages.length,
      total_latency_ms: latency,
    });

    return {
      success: true,
      doc_id: validatedInput.doc_id,
      file_name: fileName,
      passages,
    };
  }, 'getPassages');
}

/**
 * get_passages 도구 메타데이터 (MCP 서버 등록용)
 */
export const getPassagesToolMetadata = {
  name: 'get_passages',
  description:
    'Retrieve full text content of specific page ranges from a document for citation verification.',
  inputSchema: {
    type: 'object',
    properties: {
      doc_id: {
        type: 'string',
        description: 'Document identifier from search results',
      },
      page_spans: {
        type: 'array',
        description: 'List of page ranges to retrieve',
        items: {
          type: 'object',
          properties: {
            start: {
              type: 'number',
              description: 'Starting page number (1-indexed)',
            },
            end: {
              type: 'number',
              description: 'Ending page number (inclusive)',
            },
          },
          required: ['start', 'end'],
        },
      },
    },
    required: ['doc_id', 'page_spans'],
  },
};
