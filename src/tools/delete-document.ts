/**
 * delete_document 도구 구현
 *
 * 지정된 문서를 File Store에서 삭제합니다.
 */

import { geminiClient } from '../lib/gemini-client.js';
import { logger } from '../lib/logger.js';
import { handleErrors } from '../lib/error-handler.js';
import {
  DeleteDocumentInputSchema,
  type DeleteDocumentInput,
  type DeleteDocumentOutput,
} from '../lib/validators.js';

/**
 * delete_document MCP 도구 핸들러
 *
 * @param input - 삭제 요청 (doc_id)
 * @returns 삭제 결과
 */
export async function deleteDocument(input: unknown): Promise<DeleteDocumentOutput> {
  const timer = logger.startTimer();

  return handleErrors(async () => {
    // 입력 검증
    const validatedInput = DeleteDocumentInputSchema.parse(input) as DeleteDocumentInput;
    logger.debug('delete_document tool called', {
      doc_id: validatedInput.doc_id,
    });

    // Gemini 클라이언트를 통해 문서 삭제
    await geminiClient.deleteDocument(validatedInput.doc_id);

    const latency = timer();
    logger.info('delete_document completed', {
      doc_id: validatedInput.doc_id,
      total_latency_ms: latency,
    });

    return {
      success: true,
      doc_id: validatedInput.doc_id,
      message: `Document deleted successfully: ${validatedInput.doc_id}`,
    };
  }, 'deleteDocument');
}

/**
 * delete_document 도구 메타데이터 (MCP 서버 등록용)
 */
export const deleteDocumentToolMetadata = {
  name: 'delete_document',
  description: 'Remove a document from the file store by its document identifier.',
  inputSchema: {
    type: 'object',
    properties: {
      doc_id: {
        type: 'string',
        description: 'Document identifier to delete',
      },
    },
    required: ['doc_id'],
  },
};
