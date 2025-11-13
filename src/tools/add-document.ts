/**
 * add_document 도구 구현
 *
 * 파일(로컬 경로 또는 URL)을 업로드하고 인덱싱합니다.
 */

import { geminiClient } from '../lib/gemini-client.js';
import { logger } from '../lib/logger.js';
import { handleErrors } from '../lib/error-handler.js';
import { AddDocumentInputSchema, type AddDocumentOutput } from '../lib/validators.js';

/**
 * add_document MCP 도구 핸들러
 *
 * @param input - 문서 추가 요청 (source, metadata)
 * @returns 업로드된 문서 정보
 */
export async function addDocument(input: unknown): Promise<AddDocumentOutput> {
  const timer = logger.startTimer();

  return handleErrors(async () => {
    // 입력 검증
    const validatedInput = AddDocumentInputSchema.parse(input);
    logger.debug('add_document tool called', {
      source: validatedInput.source.substring(0, 100),
      has_metadata: !!validatedInput.metadata,
    });

    // Gemini 클라이언트를 통해 문서 업로드
    const document = await geminiClient.uploadDocument(
      validatedInput.source,
      validatedInput.metadata
    );

    const latency = timer();
    logger.info('add_document completed', {
      doc_id: document.doc_id,
      file_name: document.file_name,
      total_latency_ms: latency,
    });

    return {
      success: true,
      doc_id: document.doc_id,
      store_id: document.store_id,
      file_name: document.file_name,
      hash: document.hash,
      message: `Document uploaded successfully: ${document.file_name}`,
    };
  }, 'addDocument');
}

/**
 * add_document 도구 메타데이터 (MCP 서버 등록용)
 */
export const addDocumentToolMetadata = {
  name: 'add_document',
  description:
    'Upload and index a document from local path or URL. Supports automatic URL download and SHA-256 deduplication.',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Local file path or HTTP(S) URL to the document to upload',
      },
      metadata: {
        type: 'object',
        description: 'Optional document metadata',
        properties: {
          title: {
            type: 'string',
            description: 'Document title',
          },
          authors: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of authors',
          },
          year: {
            type: 'number',
            description: 'Publication year',
          },
          doi: {
            type: 'string',
            description: 'Digital Object Identifier',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Document tags',
          },
          source_url: {
            type: 'string',
            description: 'Original source URL',
          },
        },
      },
    },
    required: ['source'],
  },
};
