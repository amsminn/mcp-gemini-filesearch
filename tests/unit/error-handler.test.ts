/**
 * error-handler.ts 단위 테스트
 *
 * 오류 처리, 재시도 로직, Gemini API 오류 파싱을 테스트합니다.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  ErrorCode,
  MCPError,
  isRetryable,
  retryWithBackoff,
  parseGeminiError,
  handleErrors,
} from '../../src/lib/error-handler.js';

describe('ErrorHandler - MCPError', () => {
  it('should create MCPError with code and message', () => {
    const error = new MCPError(ErrorCode.FILE_TOO_LARGE, 'File is too large');

    expect(error.code).toBe(ErrorCode.FILE_TOO_LARGE);
    expect(error.message).toBe('File is too large');
    expect(error.retryable).toBe(false);
    expect(error.name).toBe('MCPError');
  });

  it('should create retryable MCPError', () => {
    const error = new MCPError(ErrorCode.RATE_LIMITED, 'Rate limit exceeded', true);

    expect(error.retryable).toBe(true);
  });

  it('should create MCPError with details', () => {
    const details = { status_code: 500, attempt: 3 };
    const error = new MCPError(ErrorCode.API_ERROR, 'API failed', true, details);

    expect(error.details).toEqual(details);
  });

  it('should convert to ErrorResponse', () => {
    const error = new MCPError(ErrorCode.UPLOAD_FAILED, 'Upload failed', false, { size: 1024 });
    const response = error.toErrorResponse();

    expect(response).toEqual({
      error: true,
      error_code: ErrorCode.UPLOAD_FAILED,
      message: 'Upload failed',
      retryable: false,
      details: { size: 1024 },
    });
  });

  it('should convert to ErrorResponse without details', () => {
    const error = new MCPError(ErrorCode.FILE_NOT_FOUND, 'File not found');
    const response = error.toErrorResponse();

    expect(response).toEqual({
      error: true,
      error_code: ErrorCode.FILE_NOT_FOUND,
      message: 'File not found',
      retryable: false,
    });
  });
});

describe('ErrorHandler - isRetryable', () => {
  it('should return true for retryable error codes', () => {
    const retryableErrors = [
      new MCPError(ErrorCode.RATE_LIMITED, 'Rate limited'),
      new MCPError(ErrorCode.NETWORK_ERROR, 'Network error'),
      new MCPError(ErrorCode.INDEXING_TIMEOUT, 'Timeout'),
      new MCPError(ErrorCode.API_ERROR, 'API error'),
    ];

    retryableErrors.forEach((error) => {
      expect(isRetryable(error)).toBe(true);
    });
  });

  it('should return false for non-retryable error codes', () => {
    const nonRetryableErrors = [
      new MCPError(ErrorCode.FILE_TOO_LARGE, 'Too large'),
      new MCPError(ErrorCode.INVALID_FILE_TYPE, 'Invalid type'),
      new MCPError(ErrorCode.FILE_NOT_FOUND, 'Not found'),
      new MCPError(ErrorCode.AUTH_FAILED, 'Auth failed'),
    ];

    nonRetryableErrors.forEach((error) => {
      expect(isRetryable(error)).toBe(false);
    });
  });

  it('should respect explicit retryable flag', () => {
    const error = new MCPError(ErrorCode.UPLOAD_FAILED, 'Upload failed', true);
    expect(isRetryable(error)).toBe(true);
  });

  it('should return true for retryable HTTP status codes', () => {
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];

    retryableStatusCodes.forEach((status) => {
      const error = { status };
      expect(isRetryable(error)).toBe(true);
    });
  });

  it('should return false for non-retryable HTTP status codes', () => {
    const nonRetryableStatusCodes = [400, 401, 403, 404];

    nonRetryableStatusCodes.forEach((status) => {
      const error = { status };
      expect(isRetryable(error)).toBe(false);
    });
  });

  it('should return false for unknown error types', () => {
    expect(isRetryable('string error')).toBe(false);
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
    expect(isRetryable(123)).toBe(false);
  });
});

describe('ErrorHandler - retryWithBackoff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should succeed on first attempt', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');

    const result = await retryWithBackoff(mockFn);

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable error and succeed', async () => {
    const mockFn = jest
      .fn()
      .mockRejectedValueOnce(new MCPError(ErrorCode.RATE_LIMITED, 'Rate limited', true))
      .mockResolvedValueOnce('success');

    const result = await retryWithBackoff(mockFn, {
      delays: [10, 20, 30], // 빠른 테스트를 위해 짧은 지연
    });

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should retry up to maxAttempts', async () => {
    const mockFn = jest
      .fn()
      .mockRejectedValue(new MCPError(ErrorCode.NETWORK_ERROR, 'Network error', true));

    await expect(
      retryWithBackoff(mockFn, {
        maxAttempts: 3,
        delays: [10, 20, 30],
      })
    ).rejects.toThrow('Network error');

    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-retryable error', async () => {
    const mockFn = jest
      .fn()
      .mockRejectedValue(new MCPError(ErrorCode.FILE_NOT_FOUND, 'Not found', false));

    await expect(
      retryWithBackoff(mockFn, {
        delays: [10, 20, 30],
      })
    ).rejects.toThrow('Not found');

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should call onRetry callback', async () => {
    const onRetry = jest.fn();
    const mockFn = jest
      .fn()
      .mockRejectedValueOnce(new MCPError(ErrorCode.RATE_LIMITED, 'Rate limited', true))
      .mockResolvedValueOnce('success');

    await retryWithBackoff(mockFn, {
      delays: [10],
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        code: ErrorCode.RATE_LIMITED,
      })
    );
  });

  it('should use default delays if not specified', async () => {
    const mockFn = jest
      .fn()
      .mockRejectedValueOnce(new MCPError(ErrorCode.API_ERROR, 'API error', true))
      .mockResolvedValueOnce('success');

    const result = await retryWithBackoff(mockFn);

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should apply jitter to delays', async () => {
    const startTime = Date.now();
    const mockFn = jest
      .fn()
      .mockRejectedValueOnce(new MCPError(ErrorCode.RATE_LIMITED, 'Rate limited', true))
      .mockResolvedValueOnce('success');

    await retryWithBackoff(mockFn, {
      delays: [100],
    });

    const elapsed = Date.now() - startTime;
    // 지터 때문에 100ms보다 약간 더 걸림 (최대 200ms 지터)
    expect(elapsed).toBeGreaterThanOrEqual(100);
    expect(elapsed).toBeLessThan(400); // 충분한 여유
  });
});

describe('ErrorHandler - parseGeminiError', () => {
  it('should return MCPError as-is', () => {
    const original = new MCPError(ErrorCode.FILE_TOO_LARGE, 'Too large');
    const parsed = parseGeminiError(original);

    expect(parsed).toBe(original);
  });

  it('should parse file size error', () => {
    const error = new Error('File too large for upload');
    const parsed = parseGeminiError(error);

    expect(parsed.code).toBe(ErrorCode.FILE_TOO_LARGE);
    expect(parsed.retryable).toBe(false);
    expect(parsed.details?.original_error).toBe('File too large for upload');
  });

  it('should parse invalid file type error', () => {
    const error = new Error('Invalid file format');
    const parsed = parseGeminiError(error);

    expect(parsed.code).toBe(ErrorCode.INVALID_FILE_TYPE);
    expect(parsed.retryable).toBe(false);
  });

  it('should parse unsupported file error', () => {
    const error = new Error('Unsupported file type');
    const parsed = parseGeminiError(error);

    expect(parsed.code).toBe(ErrorCode.INVALID_FILE_TYPE);
  });

  it('should parse rate limit error', () => {
    const error = new Error('Rate limit exceeded');
    const parsed = parseGeminiError(error);

    expect(parsed.code).toBe(ErrorCode.RATE_LIMITED);
    expect(parsed.retryable).toBe(true);
  });

  it('should parse quota error as rate limit', () => {
    const error = new Error('Quota exceeded');
    const parsed = parseGeminiError(error);

    expect(parsed.code).toBe(ErrorCode.RATE_LIMITED);
    expect(parsed.retryable).toBe(true);
  });

  it('should parse authentication error', () => {
    const authErrors = [
      new Error('Authentication failed'),
      new Error('Unauthorized access'),
      new Error('Invalid API key'),
    ];

    authErrors.forEach((error) => {
      const parsed = parseGeminiError(error);
      expect(parsed.code).toBe(ErrorCode.AUTH_FAILED);
      expect(parsed.retryable).toBe(false);
    });
  });

  it('should parse store not found error', () => {
    const error = new Error('Store not found');
    const parsed = parseGeminiError(error);

    expect(parsed.code).toBe(ErrorCode.STORE_NOT_FOUND);
    expect(parsed.retryable).toBe(false);
  });

  it('should parse network errors', () => {
    const networkErrors = [
      new Error('Network error occurred'),
      new Error('Request timeout'),
      new Error('ECONNREFUSED'),
      new Error('ENOTFOUND'),
    ];

    networkErrors.forEach((error) => {
      const parsed = parseGeminiError(error);
      expect(parsed.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(parsed.retryable).toBe(true);
    });
  });

  it('should parse generic API error', () => {
    const error = new Error('Something went wrong');
    const parsed = parseGeminiError(error);

    expect(parsed.code).toBe(ErrorCode.API_ERROR);
    expect(parsed.retryable).toBe(true);
  });

  it('should handle string errors', () => {
    const parsed = parseGeminiError('String error message');

    expect(parsed.code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(parsed.message).toBe('String error message');
    expect(parsed.retryable).toBe(false);
  });

  it('should handle unknown error types', () => {
    const parsed = parseGeminiError({ weird: 'object' });

    expect(parsed.code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(parsed.message).toBe('Unknown error occurred');
    expect(parsed.retryable).toBe(false);
  });

  it('should include error details', () => {
    const error = new Error('Test error');
    error.name = 'CustomError';
    const parsed = parseGeminiError(error);

    expect(parsed.details).toEqual({
      original_error: 'Test error',
      name: 'CustomError',
    });
  });
});

describe('ErrorHandler - handleErrors', () => {
  it('should return successful result', async () => {
    const fn = jest.fn().mockResolvedValue('success');

    const result = await handleErrors(fn, 'test context');

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should convert and throw MCPError', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Test error'));

    await expect(handleErrors(fn, 'test context')).rejects.toThrow(MCPError);
  });

  it('should preserve MCPError', async () => {
    const originalError = new MCPError(ErrorCode.FILE_NOT_FOUND, 'Not found');
    const fn = jest.fn().mockRejectedValue(originalError);

    await expect(handleErrors(fn, 'test context')).rejects.toBe(originalError);
  });

  it('should work without context', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('No context'));

    await expect(handleErrors(fn)).rejects.toThrow(MCPError);
  });

  it('should parse Gemini errors correctly', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Rate limit exceeded'));

    try {
      await handleErrors(fn, 'rate limit test');
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(MCPError);
      expect((error as MCPError).code).toBe(ErrorCode.RATE_LIMITED);
      expect((error as MCPError).retryable).toBe(true);
    }
  });
});
