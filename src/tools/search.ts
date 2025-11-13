/**
 * search 도구 구현
 *
 * 자연어 쿼리로 문서를 검색합니다.
 */

import { geminiClient } from '../lib/gemini-client.js';
import { logger } from '../lib/logger.js';
import { handleErrors } from '../lib/error-handler.js';
import { SearchInputSchema, type SearchInput, type SearchOutput } from '../lib/validators.js';

/**
 * search MCP 도구 핸들러
 *
 * @param input - 검색 요청 (query, top_k, filters)
 * @returns 검색 결과 목록
 */
export async function search(input: unknown): Promise<SearchOutput> {
  const timer = logger.startTimer();

  return handleErrors(async () => {
    // 입력 검증
    const validatedInput = SearchInputSchema.parse(input) as SearchInput;
    logger.debug('search tool called', {
      query: validatedInput.query.substring(0, 100),
      top_k: validatedInput.top_k,
      has_filters: !!validatedInput.filters,
    });

    // Gemini 클라이언트를 통해 문서 검색
    const results = await geminiClient.searchDocuments(
      validatedInput.query,
      validatedInput.top_k,
      validatedInput.filters
    );

    const latency = timer();
    logger.info('search completed', {
      query: validatedInput.query.substring(0, 50),
      results_count: results.length,
      query_latency_ms: latency,
    });

    return {
      success: true,
      results,
      query: validatedInput.query,
      total_results: results.length,
    };
  }, 'search');
}

/**
 * search 도구 메타데이터 (MCP 서버 등록용)
 */
export const searchToolMetadata = {
  name: 'search',
  description:
    'Search indexed documents with natural language query. Returns snippets with relevance scores, page ranges, and document metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language search query',
      },
      top_k: {
        type: 'number',
        description: 'Number of results to return (default: 10, max: 100)',
        default: 10,
      },
      filters: {
        type: 'object',
        description: 'Optional filters to narrow search results',
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
    required: ['query'],
  },
};
