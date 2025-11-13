/**
 * Gemini API 클라이언트
 *
 * Google Gemini File Search API를 래핑하여 File Store 작업을 제공합니다.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from './logger.js';
import { handleErrors, retryWithBackoff, MCPError, ErrorCode } from './error-handler.js';
import type { Document, DocumentMetadata, SearchResult, Passage, PageSpan } from './validators.js';

// ============================================================================
// 타입 정의
// ============================================================================

/**
 * Gemini File Search Store 인터페이스
 */
interface FileSearchStore {
  name: string; // Store ID (예: "fileSearchStores/xxx")
  displayName?: string; // 사용자 정의 이름
  createTime?: string;
  updateTime?: string;
}

// ============================================================================
// 환경변수 검증
// ============================================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_FILESTORE_NAME = process.env.GEMINI_FILESTORE_NAME;

if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is required');
}

// GEMINI_FILESTORE_NAME은 displayName으로 사용 (자동 검색/생성)

// ============================================================================
// Gemini Client 클래스
// ============================================================================

export class GeminiClient {
  private readonly ai: GoogleGenerativeAI;
  private readonly fileManager: GoogleAIFileManager;
  private readonly apiKey: string;
  private storeId: string | null;
  private storeName: string | null;

  constructor(apiKey: string = GEMINI_API_KEY!, storeName?: string) {
    this.ai = new GoogleGenerativeAI(apiKey);
    this.fileManager = new GoogleAIFileManager(apiKey);
    this.apiKey = apiKey;
    this.storeName = storeName || GEMINI_FILESTORE_NAME || null;
    this.storeId = null; // 초기화 후 resolveStoreByDisplayName에서 설정

    logger.info('GeminiClient initialized', {
      store_name: this.storeName || 'not_set',
    });
  }

  // ==========================================================================
  // File Upload 작업
  // ==========================================================================

  /**
   * 파일 업로드 (로컬 경로 또는 URL)
   *
   * @param source - 로컬 파일 경로 또는 HTTP(S) URL
   * @param metadata - 문서 메타데이터
   * @returns 업로드된 문서 정보
   */
  async uploadDocument(source: string, metadata?: DocumentMetadata): Promise<Document> {
    const timer = logger.startTimer();

    return handleErrors(async () => {
      // Store ID 확인 및 자동 해석
      if (!this.storeId) {
        if (!this.storeName) {
          throw new MCPError(
            ErrorCode.STORE_NOT_FOUND,
            'File Store name is not configured. Set GEMINI_FILESTORE_NAME environment variable.',
            false
          );
        }
        // storeName으로 Store ID 자동 해석
        this.storeId = await this.resolveStoreByDisplayName(this.storeName);
        logger.info('Store ID resolved from display name', {
          store_name: this.storeName,
          store_id: this.storeId,
        });
      }

      // URL인 경우 다운로드
      const localPath = await this.ensureLocalFile(source);
      const fileName = path.basename(localPath);

      logger.info('Starting document upload', {
        file_name: fileName,
        source: source.startsWith('http') ? 'url' : 'local',
      });

      // 파일 해시 계산 (중복 검사용)
      const hash = await this.calculateFileHash(localPath);
      const dedupeKey = this.generateDedupeKey(hash, metadata);

      // 파일 크기 확인
      const stats = await fs.stat(localPath);
      const sizeBytes = stats.size;

      logger.debug('File prepared for upload', {
        file_name: fileName,
        size_bytes: sizeBytes,
        hash,
      });

      // Gemini API에 파일 업로드 (재시도 로직 포함)
      const uploadResponse = await retryWithBackoff(
        async () => {
          return await this.fileManager.uploadFile(localPath, {
            mimeType: this.getMimeType(fileName),
            displayName: metadata?.title || fileName,
          });
        },
        {
          maxAttempts: 3,
          onRetry: (attempt) => {
            logger.warn('Retrying file upload', { attempt, file_name: fileName });
          },
        }
      );

      const latency = timer();
      logger.info('Document upload completed', {
        file_name: fileName,
        doc_id: uploadResponse.file.name,
        index_latency_ms: latency,
        bytes_uploaded: sizeBytes,
      });

      // URL에서 다운로드한 임시 파일 삭제
      if (source.startsWith('http')) {
        await fs.unlink(localPath).catch(() => {
          /* ignore cleanup errors */
        });
      }

      // Document 객체 생성
      return {
        doc_id: uploadResponse.file.name,
        store_id: this.storeId,
        file_name: fileName,
        file_uri: uploadResponse.file.uri,
        mime_type: uploadResponse.file.mimeType || this.getMimeType(fileName),
        size_bytes: sizeBytes,
        created_at: new Date().toISOString(),
        metadata: metadata || {},
        hash,
        dedupe_key: dedupeKey,
      };
    }, 'uploadDocument');
  }

  /**
   * 로컬 파일 경로 확보 (URL인 경우 다운로드)
   */
  private async ensureLocalFile(source: string): Promise<string> {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      return this.downloadFile(source);
    }

    // 로컬 파일 존재 확인
    try {
      await fs.access(source);
      return source;
    } catch {
      throw new MCPError(ErrorCode.FILE_NOT_FOUND, `File not found: ${source}`, false);
    }
  }

  /**
   * URL에서 파일 다운로드
   */
  private async downloadFile(url: string): Promise<string> {
    return handleErrors(async () => {
      logger.info('Downloading file from URL', { url });

      const response = await fetch(url);
      if (!response.ok) {
        throw new MCPError(
          ErrorCode.DOWNLOAD_FAILED,
          `Failed to download file: ${response.status} ${response.statusText}`,
          false
        );
      }

      // 임시 파일 생성
      const tempDir = await fs.mkdtemp(path.join('/tmp', 'mcp-gemini-'));
      const fileName = this.extractFileName(url, response.headers.get('content-type'));
      const tempPath = path.join(tempDir, fileName);

      // 파일 저장
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(tempPath, buffer);

      logger.info('File downloaded successfully', {
        url,
        temp_path: tempPath,
        size_bytes: buffer.length,
      });

      return tempPath;
    }, 'downloadFile');
  }

  /**
   * URL 또는 Content-Type에서 파일명 추출
   */
  private extractFileName(url: string, contentType: string | null): string {
    // URL에서 파일명 추출 시도
    const urlPath = new URL(url).pathname;
    const fileNameFromUrl = path.basename(urlPath);
    if (fileNameFromUrl && fileNameFromUrl !== '/') {
      return fileNameFromUrl;
    }

    // Content-Type에서 확장자 추출
    const ext = this.getExtensionFromMimeType(contentType);
    return `download_${Date.now()}.${ext}`;
  }

  /**
   * MIME 타입에서 확장자 추출
   */
  private getExtensionFromMimeType(mimeType: string | null): string {
    if (!mimeType) return 'bin';

    const mimeMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/msword': 'doc',
      'text/plain': 'txt',
      'text/markdown': 'md',
      'application/json': 'json',
    };

    return mimeMap[mimeType] || 'bin';
  }

  /**
   * 파일명에서 MIME 타입 추론
   */
  private getMimeType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();

    const extMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
    };

    return extMap[ext] || 'application/octet-stream';
  }

  /**
   * 파일 해시 계산 (SHA-256)
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * 중복 제거 키 생성
   */
  private generateDedupeKey(hash: string, metadata?: DocumentMetadata): string {
    // 해시 + 메타데이터 조합으로 중복 제거 키 생성
    const metaStr = metadata
      ? JSON.stringify({
          title: metadata.title,
          doi: metadata.doi,
        })
      : '';

    return crypto
      .createHash('sha256')
      .update(hash + metaStr)
      .digest('hex');
  }

  // ==========================================================================
  // Search 작업
  // ==========================================================================

  /**
   * 문서 검색
   *
   * @param query - 자연어 검색 쿼리
   * @param topK - 반환할 결과 수
   * @param filters - 검색 필터
   * @returns 검색 결과 목록
   */
  async searchDocuments(
    query: string,
    topK: number = 10,
    filters?: {
      year_min?: number;
      year_max?: number;
      tags?: string[];
      authors?: string[];
    }
  ): Promise<SearchResult[]> {
    const timer = logger.startTimer();

    return handleErrors(async () => {
      logger.info('Starting document search', {
        query: query.substring(0, 100),
        top_k: topK,
        filters,
      });

      // 업로드된 파일 목록 조회
      const listResponse = await this.fileManager.listFiles();
      const files = listResponse.files || [];

      if (files.length === 0) {
        logger.warn('No files found for search');
        return [];
      }

      // Gemini 모델 초기화 (gemini-2.5-flash 사용)
      const model = this.ai.getGenerativeModel({
        model: 'gemini-2.5-flash',
      });

      // 검색 쿼리 실행 (업로드된 모든 파일 포함)
      const fileParts = files.slice(0, Math.min(files.length, 10)).map((file) => ({
        fileData: {
          mimeType: file.mimeType || 'application/pdf',
          fileUri: file.uri,
        },
      }));

      const response = await retryWithBackoff(async () => {
        return await model.generateContent([
          ...fileParts,
          {
            text: `Based on the provided documents, answer the following query and provide specific page numbers or sections for citations:\n\n${query}\n\nPlease structure your response with relevant excerpts and their sources.`,
          },
        ]);
      });

      const responseText = response.response.text();

      // 응답을 SearchResult 형식으로 변환
      const results: SearchResult[] = [
        {
          doc_id: files[0]?.name || 'unknown',
          file_name: files[0]?.displayName || 'document',
          snippet: responseText.substring(0, 500),
          score: 1.0,
          page_start: 1,
          page_end: 1,
          metadata: {},
        },
      ];

      const latency = timer();
      logger.info('Document search completed', {
        query_latency_ms: latency,
        results_count: results.length,
      });

      return results;
    }, 'searchDocuments');
  }

  // ==========================================================================
  // Get Passages 작업
  // ==========================================================================

  /**
   * 특정 페이지 내용 조회
   *
   * @param docId - 문서 ID
   * @param pageSpans - 페이지 범위 목록
   * @returns 페이지 내용 목록
   */
  async getPassages(docId: string, pageSpans: PageSpan[]): Promise<Passage[]> {
    return handleErrors(async () => {
      logger.info('Getting passages', {
        doc_id: docId,
        page_spans: pageSpans,
      });

      // 파일 정보 조회
      const file = await retryWithBackoff(async () => {
        return await this.fileManager.getFile(docId);
      });

      if (!file || !file.uri) {
        throw new MCPError(ErrorCode.FILE_NOT_FOUND, `File not found: ${docId}`, false);
      }

      // Gemini 모델 초기화
      const model = this.ai.getGenerativeModel({
        model: 'gemini-2.5-flash',
      });

      // 각 페이지 범위에 대해 내용 조회
      const passages: Passage[] = [];

      for (const span of pageSpans) {
        const prompt = `Extract the full text content from page ${span.start}${
          span.end !== span.start ? ` to page ${span.end}` : ''
        } of this document. Return ONLY the text content from these pages without any additional commentary.`;

        const response = await retryWithBackoff(async () => {
          return await model.generateContent([
            {
              fileData: {
                mimeType: file.mimeType || 'application/pdf',
                fileUri: file.uri,
              },
            },
            { text: prompt },
          ]);
        });

        const text = response.response.text();

        passages.push({
          page_start: span.start,
          page_end: span.end,
          text,
        });
      }

      logger.info('Passages retrieved successfully', {
        doc_id: docId,
        passages_count: passages.length,
      });

      return passages;
    }, 'getPassages');
  }

  // ==========================================================================
  // List Documents 작업
  // ==========================================================================

  /**
   * 문서 목록 조회
   *
   * @param page - 페이지 번호 (1-indexed)
   * @param pageSize - 페이지당 결과 수
   * @param filters - 필터
   * @returns 문서 목록 및 페이징 정보
   */
  async listDocuments(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      year_min?: number;
      year_max?: number;
      tags?: string[];
      authors?: string[];
    }
  ): Promise<{ documents: Document[]; totalCount: number }> {
    return handleErrors(async () => {
      logger.info('Listing documents', {
        page,
        page_size: pageSize,
        filters,
      });

      // Gemini File API를 사용하여 업로드된 파일 목록 조회
      const listFilesResponse = await retryWithBackoff(async () => {
        return await this.fileManager.listFiles();
      });

      // 파일 목록을 Document 형식으로 변환
      const allDocuments: Document[] = [];
      const files = listFilesResponse.files || [];

      for (const file of files) {
        const doc: Document = {
          doc_id: file.name,
          store_id: this.storeId || 'unknown',
          file_name: file.displayName || path.basename(file.uri || ''),
          file_uri: file.uri,
          mime_type: file.mimeType || 'application/octet-stream',
          size_bytes: file.sizeBytes ? parseInt(file.sizeBytes) : 0,
          created_at: file.createTime || new Date().toISOString(),
          metadata: {},
          hash: '', // API에서 제공하지 않음
          dedupe_key: '',
        };

        // 필터 적용
        if (filters) {
          // 메타데이터 필터링은 현재 API에서 지원하지 않으므로 스킵
          // 향후 메타데이터를 파일명이나 displayName에 포함시켜 필터링 가능
        }

        allDocuments.push(doc);
      }

      // 페이지네이션 적용
      const totalCount = allDocuments.length;
      const startIdx = (page - 1) * pageSize;
      const endIdx = startIdx + pageSize;
      const documents = allDocuments.slice(startIdx, endIdx);

      logger.info('Documents listed', {
        total_count: totalCount,
        page,
        returned_count: documents.length,
      });

      return {
        documents,
        totalCount,
      };
    }, 'listDocuments');
  }

  // ==========================================================================
  // Delete Document 작업
  // ==========================================================================

  /**
   * 문서 삭제
   *
   * @param docId - 삭제할 문서 ID
   */
  async deleteDocument(docId: string): Promise<void> {
    return handleErrors(async () => {
      logger.info('Deleting document', { doc_id: docId });

      await retryWithBackoff(async () => {
        await this.fileManager.deleteFile(docId);
      });

      logger.info('Document deleted successfully', { doc_id: docId });
    }, 'deleteDocument');
  }

  // ==========================================================================
  // Health Check
  // ==========================================================================

  /**
   * API 연결 상태 확인
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      // 간단한 API 호출로 연결 확인
      const model = this.ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
      await model.generateContent('ping');

      return {
        healthy: true,
        message: 'Gemini API connection is healthy',
      };
    } catch (error) {
      logger.error('Health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        healthy: false,
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // ==========================================================================
  // File Store 관리
  // ==========================================================================

  /**
   * displayName으로 File Search Store 해석
   *
   * @param displayName - Store 표시 이름
   * @returns Store ID (없으면 새로 생성)
   */
  async resolveStoreByDisplayName(displayName: string): Promise<string> {
    return handleErrors(async () => {
      logger.info('Resolving File Store by display name', { display_name: displayName });

      // 전체 Store 목록 조회 (최대 20개)
      const stores = await this.listFileStores(20);

      // displayName이 일치하는 Store 찾기
      const matchingStore = stores.find((store) => store.displayName === displayName);

      if (matchingStore) {
        logger.info('Found existing File Store', {
          display_name: displayName,
          store_id: matchingStore.name,
        });
        return matchingStore.name;
      }

      // 없으면 새로 생성
      logger.info('Creating new File Store with display name', { display_name: displayName });
      return await this.createFileStore(displayName);
    }, 'resolveStoreByDisplayName');
  }

  /**
   * File Search Store 생성
   *
   * @param displayName - Store 표시 이름 (선택, 최대 512자)
   * @returns 생성된 Store ID
   */
  async createFileStore(displayName?: string): Promise<string> {
    return handleErrors(async () => {
      logger.info('Creating File Search Store', { display_name: displayName });

      // displayName이 제공된 경우 중복 체크
      if (displayName) {
        const stores = await this.listFileStores(20);
        const existingStore = stores.find((store) => store.displayName === displayName);

        if (existingStore) {
          throw new MCPError(
            ErrorCode.API_ERROR,
            `A File Store with display name "${displayName}" already exists (ID: ${existingStore.name}). Use a different name or use the existing store.`,
            false
          );
        }
      }

      const url = 'https://generativelanguage.googleapis.com/v1beta/fileSearchStores';
      const body = displayName ? { displayName } : {};

      const response = await fetch(`${url}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new MCPError(
          ErrorCode.API_ERROR,
          `Failed to create File Store: ${response.status} ${response.statusText} - ${errorText}`,
          false
        );
      }

      const data = (await response.json()) as { name: string; displayName?: string };
      const storeId = data.name; // 예: "fileSearchStores/abc123xyz"

      logger.info('File Search Store created successfully', {
        store_id: storeId,
        display_name: data.displayName,
      });

      // 생성된 Store ID를 현재 인스턴스에 설정
      this.storeId = storeId;

      return storeId;
    }, 'createFileStore');
  }

  /**
   * File Search Store 존재 여부 확인
   *
   * @param storeId - 확인할 Store ID
   * @returns Store가 존재하면 true, 아니면 false
   */
  async checkFileStoreExists(storeId: string): Promise<boolean> {
    return handleErrors(async () => {
      logger.debug('Checking File Store existence', { store_id: storeId });

      const url = `https://generativelanguage.googleapis.com/v1beta/${storeId}`;

      const response = await fetch(`${url}?key=${this.apiKey}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 404) {
        return false;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new MCPError(
          ErrorCode.API_ERROR,
          `Failed to check File Store: ${response.status} ${response.statusText} - ${errorText}`,
          true
        );
      }

      logger.debug('File Store exists', { store_id: storeId });
      return true;
    }, 'checkFileStoreExists');
  }

  /**
   * File Search Store가 설정되어 있고 유효한지 확인
   * 설정되지 않았으면 에러 발생
   *
   * @throws MCPError - Store ID가 없거나 유효하지 않으면 에러
   */
  async ensureFileStore(): Promise<void> {
    if (!this.storeId) {
      if (!this.storeName) {
        throw new MCPError(
          ErrorCode.STORE_NOT_FOUND,
          'File Store name is not configured. Set GEMINI_FILESTORE_NAME environment variable.',
          false
        );
      }
      // storeName으로 Store ID 자동 해석
      this.storeId = await this.resolveStoreByDisplayName(this.storeName);
      logger.info('Store ID resolved from display name', {
        store_name: this.storeName,
        store_id: this.storeId,
      });
    }

    const exists = await this.checkFileStoreExists(this.storeId);
    if (!exists) {
      throw new MCPError(
        ErrorCode.STORE_NOT_FOUND,
        `File Store not found: ${this.storeId}. This should not happen if resolveStoreByDisplayName worked correctly.`,
        false
      );
    }
  }

  /**
   * File Search Store 목록 조회
   *
   * @param pageSize - 페이지당 결과 수 (최대 100)
   * @returns Store 목록
   */
  async listFileStores(pageSize: number = 20): Promise<FileSearchStore[]> {
    return handleErrors(async () => {
      logger.info('Listing File Search Stores', { page_size: pageSize });

      const url = 'https://generativelanguage.googleapis.com/v1beta/fileSearchStores';

      const response = await fetch(`${url}?pageSize=${pageSize}&key=${this.apiKey}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new MCPError(
          ErrorCode.API_ERROR,
          `Failed to list File Stores: ${response.status} ${response.statusText} - ${errorText}`,
          true
        );
      }

      const data = (await response.json()) as { fileSearchStores?: FileSearchStore[] };
      const stores = data.fileSearchStores || [];

      logger.info('File Search Stores listed', { count: stores.length });

      return stores;
    }, 'listFileStores');
  }

  /**
   * 현재 설정된 Store ID 반환
   */
  getStoreId(): string | null {
    return this.storeId;
  }

  /**
   * Store ID 설정 (기존 Store 사용 시)
   */
  setStoreId(storeId: string): void {
    this.storeId = storeId;
    logger.info('Store ID updated', { store_id: storeId });
  }
}

// ============================================================================
// 싱글톤 인스턴스
// ============================================================================

export const geminiClient = new GeminiClient();
