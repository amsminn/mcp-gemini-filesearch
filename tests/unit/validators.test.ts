/**
 * validators.ts 단위 테스트
 *
 * 모든 Zod 스키마의 유효성 검증을 테스트합니다.
 */

import { describe, it, expect } from '@jest/globals';
import {
  DocumentMetadataSchema,
  DocumentSchema,
  AddDocumentInputSchema,
  AddDocumentOutputSchema,
  SearchInputSchema,
  SearchOutputSchema,
  SearchResultSchema,
  GetPassagesInputSchema,
  GetPassagesOutputSchema,
  PageSpanSchema,
  PassageSchema,
  ListDocumentsInputSchema,
  ListDocumentsOutputSchema,
  DeleteDocumentInputSchema,
  DeleteDocumentOutputSchema,
  ErrorResponseSchema,
} from '../../src/lib/validators.js';

describe('Validators - DocumentMetadataSchema', () => {
  it('should validate valid metadata', () => {
    const validMetadata = {
      title: 'Test Document',
      authors: ['John Doe', 'Jane Smith'],
      year: 2023,
      doi: '10.1234/test',
      tags: ['research', 'ai'],
      source_url: 'https://example.com/doc.pdf',
    };

    expect(() => DocumentMetadataSchema.parse(validMetadata)).not.toThrow();
  });

  it('should validate empty metadata', () => {
    expect(() => DocumentMetadataSchema.parse({})).not.toThrow();
  });

  it('should reject invalid year (too old)', () => {
    const invalidMetadata = { year: 1899 };
    expect(() => DocumentMetadataSchema.parse(invalidMetadata)).toThrow();
  });

  it('should reject invalid year (future)', () => {
    const invalidMetadata = { year: 2101 };
    expect(() => DocumentMetadataSchema.parse(invalidMetadata)).toThrow();
  });

  it('should reject invalid URL', () => {
    const invalidMetadata = { source_url: 'not-a-url' };
    expect(() => DocumentMetadataSchema.parse(invalidMetadata)).toThrow();
  });

  it('should accept partial metadata', () => {
    const partialMetadata = {
      title: 'Only Title',
      year: 2020,
    };
    expect(() => DocumentMetadataSchema.parse(partialMetadata)).not.toThrow();
  });
});

describe('Validators - DocumentSchema', () => {
  it('should validate complete document', () => {
    const validDoc = {
      doc_id: 'doc_123',
      store_id: 'store_456',
      file_name: 'test.pdf',
      file_uri: 'gs://bucket/test.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1024000,
      created_at: '2023-12-01T10:00:00.000Z',
      metadata: {
        title: 'Test',
        year: 2023,
      },
      hash: 'abc123def456',
      dedupe_key: 'xyz789',
    };

    expect(() => DocumentSchema.parse(validDoc)).not.toThrow();
  });

  it('should reject missing required fields', () => {
    const invalidDoc = {
      doc_id: 'doc_123',
      // missing other required fields
    };

    expect(() => DocumentSchema.parse(invalidDoc)).toThrow();
  });

  it('should reject invalid datetime', () => {
    const invalidDoc = {
      doc_id: 'doc_123',
      store_id: 'store_456',
      file_name: 'test.pdf',
      file_uri: 'gs://bucket/test.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1024000,
      created_at: 'invalid-date',
      metadata: {},
      hash: 'abc123',
      dedupe_key: 'xyz789',
    };

    expect(() => DocumentSchema.parse(invalidDoc)).toThrow();
  });
});

describe('Validators - AddDocumentInputSchema', () => {
  it('should validate local file path', () => {
    const input = {
      source: '/path/to/document.pdf',
    };

    expect(() => AddDocumentInputSchema.parse(input)).not.toThrow();
  });

  it('should validate URL source', () => {
    const input = {
      source: 'https://example.com/document.pdf',
      metadata: {
        title: 'Remote Document',
      },
    };

    expect(() => AddDocumentInputSchema.parse(input)).not.toThrow();
  });

  it('should validate with full metadata', () => {
    const input = {
      source: '/path/to/doc.pdf',
      metadata: {
        title: 'Full Metadata Test',
        authors: ['Author 1'],
        year: 2023,
        doi: '10.1234/test',
        tags: ['tag1', 'tag2'],
        source_url: 'https://example.com',
      },
    };

    expect(() => AddDocumentInputSchema.parse(input)).not.toThrow();
  });

  it('should reject missing source', () => {
    const input = {};
    expect(() => AddDocumentInputSchema.parse(input)).toThrow();
  });
});

describe('Validators - AddDocumentOutputSchema', () => {
  it('should validate successful output', () => {
    const output = {
      success: true,
      doc_id: 'doc_123',
      store_id: 'store_456',
      file_name: 'test.pdf',
      hash: 'abc123',
      message: 'Upload successful',
    };

    expect(() => AddDocumentOutputSchema.parse(output)).not.toThrow();
  });

  it('should validate duplicate detection', () => {
    const output = {
      success: true,
      doc_id: 'doc_123',
      duplicate: true,
      message: 'Document already exists',
    };

    expect(() => AddDocumentOutputSchema.parse(output)).not.toThrow();
  });

  it('should validate minimal success response', () => {
    const output = {
      success: true,
    };

    expect(() => AddDocumentOutputSchema.parse(output)).not.toThrow();
  });
});

describe('Validators - SearchInputSchema', () => {
  it('should validate basic search query', () => {
    const input = {
      query: 'machine learning',
    };

    const parsed = SearchInputSchema.parse(input);
    expect(parsed.top_k).toBe(10); // default value
  });

  it('should validate search with top_k', () => {
    const input = {
      query: 'neural networks',
      top_k: 20,
    };

    expect(() => SearchInputSchema.parse(input)).not.toThrow();
  });

  it('should validate search with filters', () => {
    const input = {
      query: 'deep learning',
      top_k: 15,
      filters: {
        year_min: 2020,
        year_max: 2023,
        tags: ['ai', 'ml'],
        authors: ['John Doe'],
      },
    };

    expect(() => SearchInputSchema.parse(input)).not.toThrow();
  });

  it('should reject empty query', () => {
    const input = { query: '' };
    expect(() => SearchInputSchema.parse(input)).toThrow();
  });

  it('should reject invalid top_k (zero)', () => {
    const input = { query: 'test', top_k: 0 };
    expect(() => SearchInputSchema.parse(input)).toThrow();
  });

  it('should reject invalid top_k (too large)', () => {
    const input = { query: 'test', top_k: 101 };
    expect(() => SearchInputSchema.parse(input)).toThrow();
  });
});

describe('Validators - SearchResultSchema', () => {
  it('should validate complete search result', () => {
    const result = {
      doc_id: 'doc_123',
      file_name: 'test.pdf',
      snippet: 'This is a relevant excerpt...',
      score: 0.95,
      page_start: 5,
      page_end: 7,
      metadata: {
        title: 'Test Doc',
        year: 2023,
      },
    };

    expect(() => SearchResultSchema.parse(result)).not.toThrow();
  });

  it('should reject invalid score (negative)', () => {
    const result = {
      doc_id: 'doc_123',
      file_name: 'test.pdf',
      snippet: 'Text',
      score: -0.1,
      metadata: {},
    };

    expect(() => SearchResultSchema.parse(result)).toThrow();
  });

  it('should reject invalid score (>1)', () => {
    const result = {
      doc_id: 'doc_123',
      file_name: 'test.pdf',
      snippet: 'Text',
      score: 1.5,
      metadata: {},
    };

    expect(() => SearchResultSchema.parse(result)).toThrow();
  });
});

describe('Validators - SearchOutputSchema', () => {
  it('should validate search output', () => {
    const output = {
      success: true,
      results: [
        {
          doc_id: 'doc_1',
          file_name: 'test1.pdf',
          snippet: 'snippet 1',
          score: 0.9,
          metadata: {},
        },
      ],
      query: 'test query',
      total_results: 1,
    };

    expect(() => SearchOutputSchema.parse(output)).not.toThrow();
  });

  it('should validate empty results', () => {
    const output = {
      success: true,
      results: [],
      query: 'no results',
      total_results: 0,
    };

    expect(() => SearchOutputSchema.parse(output)).not.toThrow();
  });
});

describe('Validators - PageSpanSchema', () => {
  it('should validate valid page span', () => {
    const span = { start: 1, end: 5 };
    expect(() => PageSpanSchema.parse(span)).not.toThrow();
  });

  it('should reject zero or negative page numbers', () => {
    const span = { start: 0, end: 5 };
    expect(() => PageSpanSchema.parse(span)).toThrow();
  });

  it('should validate single page span', () => {
    const span = { start: 10, end: 10 };
    expect(() => PageSpanSchema.parse(span)).not.toThrow();
  });
});

describe('Validators - GetPassagesInputSchema', () => {
  it('should validate get passages input', () => {
    const input = {
      doc_id: 'doc_123',
      page_spans: [
        { start: 1, end: 3 },
        { start: 10, end: 12 },
      ],
    };

    expect(() => GetPassagesInputSchema.parse(input)).not.toThrow();
  });

  it('should reject empty page_spans', () => {
    const input = {
      doc_id: 'doc_123',
      page_spans: [],
    };

    expect(() => GetPassagesInputSchema.parse(input)).toThrow();
  });

  it('should validate single page span', () => {
    const input = {
      doc_id: 'doc_123',
      page_spans: [{ start: 5, end: 5 }],
    };

    expect(() => GetPassagesInputSchema.parse(input)).not.toThrow();
  });
});

describe('Validators - PassageSchema and GetPassagesOutputSchema', () => {
  it('should validate passage', () => {
    const passage = {
      page_start: 1,
      page_end: 3,
      text: 'This is the passage text content...',
    };

    expect(() => PassageSchema.parse(passage)).not.toThrow();
  });

  it('should validate get passages output', () => {
    const output = {
      success: true,
      doc_id: 'doc_123',
      file_name: 'test.pdf',
      passages: [
        {
          page_start: 1,
          page_end: 2,
          text: 'Passage 1',
        },
        {
          page_start: 5,
          page_end: 5,
          text: 'Passage 2',
        },
      ],
    };

    expect(() => GetPassagesOutputSchema.parse(output)).not.toThrow();
  });
});

describe('Validators - ListDocumentsInputSchema', () => {
  it('should validate with defaults', () => {
    const input = {};
    const parsed = ListDocumentsInputSchema.parse(input);

    expect(parsed.page).toBe(1);
    expect(parsed.page_size).toBe(20);
  });

  it('should validate with custom pagination', () => {
    const input = {
      page: 3,
      page_size: 50,
    };

    expect(() => ListDocumentsInputSchema.parse(input)).not.toThrow();
  });

  it('should validate with filters', () => {
    const input = {
      page: 1,
      page_size: 10,
      filters: {
        year_min: 2020,
        tags: ['ai'],
      },
    };

    expect(() => ListDocumentsInputSchema.parse(input)).not.toThrow();
  });

  it('should reject invalid page (zero)', () => {
    const input = { page: 0 };
    expect(() => ListDocumentsInputSchema.parse(input)).toThrow();
  });

  it('should reject invalid page_size (too large)', () => {
    const input = { page_size: 101 };
    expect(() => ListDocumentsInputSchema.parse(input)).toThrow();
  });
});

describe('Validators - ListDocumentsOutputSchema', () => {
  it('should validate list output', () => {
    const output = {
      success: true,
      documents: [],
      total_count: 0,
      page: 1,
      page_size: 20,
      total_pages: 0,
    };

    expect(() => ListDocumentsOutputSchema.parse(output)).not.toThrow();
  });

  it('should validate with documents', () => {
    const output = {
      success: true,
      documents: [
        {
          doc_id: 'doc_1',
          store_id: 'store_1',
          file_name: 'test.pdf',
          file_uri: 'gs://bucket/test.pdf',
          mime_type: 'application/pdf',
          size_bytes: 1024,
          created_at: '2023-01-01T00:00:00.000Z',
          metadata: {},
          hash: 'hash123',
          dedupe_key: 'dedupe123',
        },
      ],
      total_count: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    };

    expect(() => ListDocumentsOutputSchema.parse(output)).not.toThrow();
  });
});

describe('Validators - DeleteDocumentSchema', () => {
  it('should validate delete input', () => {
    const input = { doc_id: 'doc_123' };
    expect(() => DeleteDocumentInputSchema.parse(input)).not.toThrow();
  });

  it('should validate delete output', () => {
    const output = {
      success: true,
      doc_id: 'doc_123',
      message: 'Document deleted successfully',
    };

    expect(() => DeleteDocumentOutputSchema.parse(output)).not.toThrow();
  });

  it('should reject missing doc_id', () => {
    const input = {};
    expect(() => DeleteDocumentInputSchema.parse(input)).toThrow();
  });
});

describe('Validators - ErrorResponseSchema', () => {
  it('should validate error response', () => {
    const error = {
      error: true as const,
      error_code: 'FILE_TOO_LARGE',
      message: 'File size exceeds limit',
      retryable: false,
    };

    expect(() => ErrorResponseSchema.parse(error)).not.toThrow();
  });

  it('should validate error with details', () => {
    const error = {
      error: true as const,
      error_code: 'UPLOAD_FAILED',
      message: 'Upload failed',
      retryable: true,
      details: {
        attempt: 3,
        status_code: 500,
      },
    };

    expect(() => ErrorResponseSchema.parse(error)).not.toThrow();
  });

  it('should reject error: false', () => {
    const error = {
      error: false,
      error_code: 'TEST',
      message: 'Test',
      retryable: false,
    };

    expect(() => ErrorResponseSchema.parse(error)).toThrow();
  });
});
