/**
 * 오류 처리 프레임워크
 *
 * 표준화된 오류 코드, 재시도 로직, 패스스루 오류 처리를 제공합니다.
 */

import { logger } from './logger.js';
import type { ErrorResponse } from './validators.js';

// ============================================================================
// 표준 오류 코드
// ============================================================================

export enum ErrorCode {
  // 파일 관련 오류
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',

  // 업로드/다운로드 오류
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',

  // 인덱싱 및 쿼리 오류
  INDEXING_TIMEOUT = 'INDEXING_TIMEOUT',
  INDEXING_FAILED = 'INDEXING_FAILED',
  QUERY_FAILED = 'QUERY_FAILED',

  // Store 관련 오류
  STORE_NOT_FOUND = 'STORE_NOT_FOUND',
  STORE_ACCESS_DENIED = 'STORE_ACCESS_DENIED',

  // API 오류
  RATE_LIMITED = 'RATE_LIMITED',
  API_ERROR = 'API_ERROR',
  AUTH_FAILED = 'AUTH_FAILED',

  // 검증 오류
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',

  // 일반 오류
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// ============================================================================
// 커스텀 오류 클래스
// ============================================================================

export class MCPError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable: boolean = false,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MCPError';
    Object.setPrototypeOf(this, MCPError.prototype);
  }

  toErrorResponse(): ErrorResponse {
    return {
      error: true,
      error_code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.details && { details: this.details }),
    };
  }
}

// ============================================================================
// 재시도 가능 여부 판단
// ============================================================================

const RETRYABLE_ERROR_CODES = new Set([
  ErrorCode.RATE_LIMITED,
  ErrorCode.NETWORK_ERROR,
  ErrorCode.INDEXING_TIMEOUT,
  ErrorCode.API_ERROR,
]);

const RETRYABLE_HTTP_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export function isRetryable(error: unknown): boolean {
  if (error instanceof MCPError) {
    return error.retryable || RETRYABLE_ERROR_CODES.has(error.code);
  }

  // HTTP 상태 코드 확인
  if (typeof error === 'object' && error !== null) {
    const statusCode = (error as { status?: number }).status;
    if (statusCode && RETRYABLE_HTTP_STATUS_CODES.has(statusCode)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// 재시도 로직 (지수 백오프)
// ============================================================================

interface RetryOptions {
  maxAttempts?: number;
  delays?: number[]; // milliseconds
  onRetry?: (attempt: number, error: unknown) => void;
}

const DEFAULT_DELAYS = [500, 1000, 2000]; // 0.5s → 1s → 2s

/**
 * 지수 백오프를 사용한 재시도 로직
 *
 * @param fn - 실행할 비동기 함수
 * @param options - 재시도 옵션
 * @returns 함수 실행 결과
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, delays = DEFAULT_DELAYS, onRetry } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 마지막 시도이거나 재시도 불가능한 오류인 경우 즉시 throw
      if (attempt === maxAttempts || !isRetryable(error)) {
        throw error;
      }

      // 재시도 전 대기
      const baseDelay = delays[attempt - 1] ?? delays[delays.length - 1] ?? 1000;
      const jitter = Math.random() * 200; // 0-200ms 랜덤 지터
      const delay = baseDelay + jitter;

      logger.warn('Retrying after error', {
        attempt,
        error_code: error instanceof MCPError ? error.code : 'UNKNOWN',
        delay_ms: Math.round(delay),
        retryable: isRetryable(error),
      });

      if (onRetry) {
        onRetry(attempt, error);
      }

      await sleep(delay);
    }
  }

  // 이 코드는 실행되지 않아야 하지만, TypeScript를 위해 필요
  throw lastError;
}

/**
 * Sleep 유틸리티
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Gemini API 오류 파싱
// ============================================================================

/**
 * Gemini API 오류를 표준화된 MCPError로 변환
 *
 * Gemini API 오류를 그대로 패스스루하되, 표준화된 형식으로 래핑합니다.
 */
export function parseGeminiError(error: unknown): MCPError {
  // 이미 MCPError인 경우 그대로 반환
  if (error instanceof MCPError) {
    return error;
  }

  // Error 객체인 경우
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const details = {
      original_error: error.message,
      name: error.name,
    };

    // 파일 크기 오류
    if (message.includes('too large') || message.includes('file size')) {
      return new MCPError(ErrorCode.FILE_TOO_LARGE, error.message, false, details);
    }

    // 파일 타입 오류
    if (message.includes('invalid file') || message.includes('unsupported')) {
      return new MCPError(ErrorCode.INVALID_FILE_TYPE, error.message, false, details);
    }

    // Rate limiting
    if (message.includes('rate limit') || message.includes('quota')) {
      return new MCPError(ErrorCode.RATE_LIMITED, error.message, true, details);
    }

    // 인증 오류
    if (
      message.includes('auth') ||
      message.includes('unauthorized') ||
      message.includes('api key')
    ) {
      return new MCPError(ErrorCode.AUTH_FAILED, error.message, false, details);
    }

    // Store 관련 오류
    if (message.includes('store') && message.includes('not found')) {
      return new MCPError(ErrorCode.STORE_NOT_FOUND, error.message, false, details);
    }

    // 네트워크 오류
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    ) {
      return new MCPError(ErrorCode.NETWORK_ERROR, error.message, true, details);
    }

    // 기타 API 오류
    return new MCPError(ErrorCode.API_ERROR, error.message, true, details);
  }

  // 알 수 없는 오류
  const errorMessage = typeof error === 'string' ? error : 'Unknown error occurred';
  return new MCPError(ErrorCode.UNKNOWN_ERROR, errorMessage, false);
}

// ============================================================================
// 오류 처리 헬퍼
// ============================================================================

/**
 * 함수 실행 중 발생한 오류를 표준화된 형식으로 처리
 */
export async function handleErrors<T>(fn: () => Promise<T>, context?: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const mcpError = parseGeminiError(error);

    logger.error(context ? `Error in ${context}` : 'Error occurred', {
      error_code: mcpError.code,
      message: mcpError.message,
      retryable: mcpError.retryable,
      ...(mcpError.details && { details: mcpError.details }),
    });

    throw mcpError;
  }
}
