/**
 * create_file_store 도구 구현
 *
 * 새로운 Gemini File Search Store를 생성합니다.
 */

import { geminiClient } from '../lib/gemini-client.js';
import { logger } from '../lib/logger.js';
import { handleErrors } from '../lib/error-handler.js';
import { z } from 'zod';

// ============================================================================
// 입력/출력 스키마
// ============================================================================

const CreateFileStoreInputSchema = z.object({
  display_name: z
    .string()
    .max(512)
    .optional()
    .describe('Display name for the File Store (optional, max 512 characters)'),
});

interface CreateFileStoreOutput {
  success: boolean;
  store_id: string;
  display_name?: string;
  message: string;
  instructions: string;
}

/**
 * create_file_store MCP 도구 핸들러
 *
 * @param input - File Store 생성 요청 (display_name)
 * @returns 생성된 Store 정보
 */
export async function createFileStore(input: unknown): Promise<CreateFileStoreOutput> {
  const timer = logger.startTimer();

  return handleErrors(async () => {
    // 입력 검증
    const validatedInput = CreateFileStoreInputSchema.parse(input);
    logger.debug('create_file_store tool called', {
      display_name: validatedInput.display_name,
    });

    // Gemini 클라이언트를 통해 File Store 생성
    const storeId = await geminiClient.createFileStore(validatedInput.display_name);

    const latency = timer();
    logger.info('create_file_store completed', {
      store_id: storeId,
      total_latency_ms: latency,
    });

    return {
      success: true,
      store_id: storeId,
      display_name: validatedInput.display_name,
      message: `File Search Store created successfully: ${storeId}`,
      instructions: validatedInput.display_name
        ? `To use this Store, set GEMINI_FILESTORE_NAME="${validatedInput.display_name}" in your MCP client configuration. The server will automatically find this Store by its display name.`
        : `To use this Store with the MCP server, restart with:\n\nnpx mcp-gemini-filesearch \\\n  -e GEMINI_API_KEY=<your-key> \\\n  -e GEMINI_FILESTORE_NAME=<your-store-name>\n\nYou can use any name you like, and the server will manage the actual Store ID automatically.`,
    };
  }, 'createFileStore');
}

/**
 * create_file_store 도구 메타데이터 (MCP 서버 등록용)
 */
export const createFileStoreToolMetadata = {
  name: 'create_file_store',
  description:
    'Create a new Gemini File Search Store. You must create a File Store before uploading documents. The Store ID can be reused across sessions to maintain document collections.',
  inputSchema: {
    type: 'object',
    properties: {
      display_name: {
        type: 'string',
        description: 'Optional display name for the File Store (max 512 characters)',
      },
    },
  },
};
