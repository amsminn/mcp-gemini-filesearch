#!/usr/bin/env node
/**
 * MCP Gemini FileSearch Server
 *
 * Google Gemini File Search API를 MCP 프로토콜로 래핑하는 서버입니다.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './lib/logger.js';
import { allToolMetadata, toolHandlers } from './tools/index.js';

/**
 * 환경변수 검증
 *
 * 필수 환경변수가 설정되어 있는지 확인합니다.
 */
function validateEnvironment(): void {
  const required = ['GEMINI_API_KEY', 'GEMINI_FILESTORE_NAME'];
  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    logger.error('Missing required environment variables', {
      missing_vars: missing.join(', '),
    });
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * MCP 서버 인스턴스 생성 및 설정
 */
async function createServer(): Promise<Server> {
  // 환경변수 검증
  validateEnvironment();

  logger.info('Gemini client initialized', {
    store_name: process.env.GEMINI_FILESTORE_NAME!,
  });

  // MCP 서버 생성
  const server = new Server(
    {
      name: 'mcp-gemini-filesearch',
      version: '1.3.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 도구 목록 핸들러 등록
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug('ListTools request received');
    return {
      tools: allToolMetadata,
    };
  });

  // 도구 호출 핸들러 등록
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.debug('CallTool request received', {
      tool_name: name,
    });

    // 도구 핸들러 찾기
    const handler = toolHandlers[name as keyof typeof toolHandlers];

    if (!handler) {
      logger.error('Unknown tool requested', {
        tool_name: name,
      });
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      // 도구 실행
      const result = await handler(args);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error('Tool execution failed', {
        tool_name: name,
        error_message: error instanceof Error ? error.message : String(error),
      });

      // 에러를 MCP 형식으로 반환
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: true,
                message: error instanceof Error ? error.message : 'Unknown error',
                tool: name,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * 서버 시작
 */
async function main(): Promise<void> {
  try {
    const server = await createServer();

    // Stdio transport로 서버 시작
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // 서버 정보 로깅 (stderr로 출력하여 MCP 프로토콜과 분리)
    const host = process.env.MCP_HOST || '127.0.0.1';
    const port = process.env.MCP_PORT || '8765';
    const storeName = process.env.GEMINI_FILESTORE_NAME;

    console.error('🔹 MCP Gemini FileSearch Server v1.3');
    console.error(`🔹 Store: ${storeName}`);
    console.error(`🔹 Listening on ${host}:${port}`);

    logger.info('MCP server started', {
      version: '1.3.0',
      host,
      port,
      store_name: storeName,
    });

    // 프로세스 종료 시그널 처리
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully');
      await server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      await server.close();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error_message: error instanceof Error ? error.message : String(error),
    });
    console.error(
      '❌ Failed to start server:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// 서버 시작
main();
