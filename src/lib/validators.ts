/**
 * Zod 스키마 정의
 *
 * 모든 MCP 도구의 입출력 검증을 위한 스키마를 정의합니다.
 */

import { z } from 'zod';

// ============================================================================
// 공통 스키마
// ============================================================================

/**
 * 문서 메타데이터 스키마
 */
export const DocumentMetadataSchema = z.object({
  title: z.string().optional(),
  authors: z.array(z.string()).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  doi: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source_url: z.string().url().optional(),
});

export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

/**
 * 문서 정보 스키마
 */
export const DocumentSchema = z.object({
  doc_id: z.string(),
  store_id: z.string(),
  file_name: z.string(),
  file_uri: z.string(),
  mime_type: z.string(),
  size_bytes: z.number(),
  created_at: z.string().datetime(),
  metadata: DocumentMetadataSchema,
  hash: z.string(),
  dedupe_key: z.string(),
});

export type Document = z.infer<typeof DocumentSchema>;

// ============================================================================
// add_document 스키마
// ============================================================================

export const AddDocumentInputSchema = z.object({
  source: z.string().describe('Local file path or HTTP(S) URL to the document to upload'),
  metadata: DocumentMetadataSchema.optional().describe('Optional document metadata'),
});

export type AddDocumentInput = z.infer<typeof AddDocumentInputSchema>;

export const AddDocumentOutputSchema = z.object({
  success: z.boolean(),
  doc_id: z.string().optional(),
  store_id: z.string().optional(),
  file_name: z.string().optional(),
  hash: z.string().optional(),
  message: z.string().optional(),
  duplicate: z.boolean().optional().describe('True if document was already indexed'),
});

export type AddDocumentOutput = z.infer<typeof AddDocumentOutputSchema>;

// ============================================================================
// search 스키마
// ============================================================================

export const SearchInputSchema = z.object({
  query: z.string().min(1).describe('Natural language search query'),
  top_k: z.number().int().min(1).max(100).default(10).describe('Number of results to return'),
  filters: z
    .object({
      year_min: z.number().int().min(1900).optional(),
      year_max: z.number().int().max(2100).optional(),
      tags: z.array(z.string()).optional(),
      authors: z.array(z.string()).optional(),
    })
    .optional()
    .describe('Optional filters to narrow search results'),
});

export type SearchInput = z.infer<typeof SearchInputSchema>;

export const SearchResultSchema = z.object({
  doc_id: z.string(),
  file_name: z.string(),
  snippet: z.string().describe('Text excerpt matching the query'),
  score: z.number().min(0).max(1).describe('Relevance score (0-1)'),
  page_start: z.number().int().optional(),
  page_end: z.number().int().optional(),
  metadata: DocumentMetadataSchema,
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchOutputSchema = z.object({
  success: z.boolean(),
  results: z.array(SearchResultSchema),
  query: z.string(),
  total_results: z.number().int(),
});

export type SearchOutput = z.infer<typeof SearchOutputSchema>;

// ============================================================================
// get_passages 스키마
// ============================================================================

export const PageSpanSchema = z.object({
  start: z.number().int().min(1).describe('Starting page number (1-indexed)'),
  end: z.number().int().min(1).describe('Ending page number (inclusive)'),
});

export type PageSpan = z.infer<typeof PageSpanSchema>;

export const GetPassagesInputSchema = z.object({
  doc_id: z.string().describe('Document identifier from search results'),
  page_spans: z.array(PageSpanSchema).min(1).describe('Page ranges to retrieve'),
});

export type GetPassagesInput = z.infer<typeof GetPassagesInputSchema>;

export const PassageSchema = z.object({
  page_start: z.number().int(),
  page_end: z.number().int(),
  text: z.string(),
});

export type Passage = z.infer<typeof PassageSchema>;

export const GetPassagesOutputSchema = z.object({
  success: z.boolean(),
  doc_id: z.string(),
  file_name: z.string(),
  passages: z.array(PassageSchema),
});

export type GetPassagesOutput = z.infer<typeof GetPassagesOutputSchema>;

// ============================================================================
// list_documents 스키마
// ============================================================================

export const ListDocumentsInputSchema = z.object({
  page: z.number().int().min(1).default(1).describe('Page number (1-indexed)'),
  page_size: z.number().int().min(1).max(100).default(20).describe('Results per page'),
  filters: z
    .object({
      year_min: z.number().int().min(1900).optional(),
      year_max: z.number().int().max(2100).optional(),
      tags: z.array(z.string()).optional(),
      authors: z.array(z.string()).optional(),
    })
    .optional(),
});

export type ListDocumentsInput = z.infer<typeof ListDocumentsInputSchema>;

export const ListDocumentsOutputSchema = z.object({
  success: z.boolean(),
  documents: z.array(DocumentSchema),
  total_count: z.number().int(),
  page: z.number().int(),
  page_size: z.number().int(),
  total_pages: z.number().int(),
});

export type ListDocumentsOutput = z.infer<typeof ListDocumentsOutputSchema>;

// ============================================================================
// delete_document 스키마
// ============================================================================

export const DeleteDocumentInputSchema = z.object({
  doc_id: z.string().describe('Document identifier to delete'),
});

export type DeleteDocumentInput = z.infer<typeof DeleteDocumentInputSchema>;

export const DeleteDocumentOutputSchema = z.object({
  success: z.boolean(),
  doc_id: z.string(),
  message: z.string(),
});

export type DeleteDocumentOutput = z.infer<typeof DeleteDocumentOutputSchema>;

// ============================================================================
// 오류 응답 스키마
// ============================================================================

export const ErrorResponseSchema = z.object({
  error: z.literal(true),
  error_code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  details: z.record(z.unknown()).optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
