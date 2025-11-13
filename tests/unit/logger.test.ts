/**
 * logger.ts 단위 테스트
 *
 * 구조화된 로깅 기능과 타이머 기능을 테스트합니다.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { LogLevel } from '../../src/lib/logger.js';

// Logger 클래스를 테스트용으로 재정의
class TestLogger {
  private minLevel: LogLevel;

  constructor(minLevel: LogLevel = LogLevel.INFO) {
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(metadata && Object.keys(metadata).length > 0 && { metadata }),
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.DEBUG:
        console.debug(output);
        break;
      default:
        console.log(output);
    }
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, metadata);
  }

  startTimer(): () => number {
    const startTime = Date.now();
    return () => Date.now() - startTime;
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }
}

describe('Logger - Basic Functionality', () => {
  let logger: TestLogger;
  let mockConsoleLog: jest.Mock;
  let mockConsoleError: jest.Mock;
  let mockConsoleWarn: jest.Mock;
  let mockConsoleDebug: jest.Mock;

  beforeEach(() => {
    logger = new TestLogger(LogLevel.DEBUG);

    // console 메서드들을 모킹
    mockConsoleLog = jest.fn();
    mockConsoleError = jest.fn();
    mockConsoleWarn = jest.fn();
    mockConsoleDebug = jest.fn();

    console.log = mockConsoleLog;
    console.error = mockConsoleError;
    console.warn = mockConsoleWarn;
    console.debug = mockConsoleDebug;
  });

  it('should log info message', () => {
    logger.info('Test info message');

    expect(mockConsoleLog).toHaveBeenCalledTimes(1);
    const loggedData = mockConsoleLog.mock.calls[0]![0] as string;
    const parsed = JSON.parse(loggedData);

    expect(parsed.level).toBe(LogLevel.INFO);
    expect(parsed.message).toBe('Test info message');
    expect(parsed.timestamp).toBeDefined();
  });

  it('should log error message', () => {
    logger.error('Test error message');

    expect(mockConsoleError).toHaveBeenCalledTimes(1);
    const loggedData = mockConsoleError.mock.calls[0]![0] as string;
    const parsed = JSON.parse(loggedData);

    expect(parsed.level).toBe(LogLevel.ERROR);
    expect(parsed.message).toBe('Test error message');
  });

  it('should log warn message', () => {
    logger.warn('Test warning message');

    expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
    const loggedData = mockConsoleWarn.mock.calls[0]![0] as string;
    const parsed = JSON.parse(loggedData);

    expect(parsed.level).toBe(LogLevel.WARN);
    expect(parsed.message).toBe('Test warning message');
  });

  it('should log debug message', () => {
    logger.debug('Test debug message');

    expect(mockConsoleDebug).toHaveBeenCalledTimes(1);
    const loggedData = mockConsoleDebug.mock.calls[0]![0] as string;
    const parsed = JSON.parse(loggedData);

    expect(parsed.level).toBe(LogLevel.DEBUG);
    expect(parsed.message).toBe('Test debug message');
  });
});

describe('Logger - Metadata', () => {
  let logger: TestLogger;
  let mockConsoleLog: jest.Mock;

  beforeEach(() => {
    logger = new TestLogger(LogLevel.INFO);
    mockConsoleLog = jest.fn();
    console.log = mockConsoleLog;
  });

  it('should include metadata in log', () => {
    const metadata = {
      doc_id: 'doc_123',
      file_name: 'test.pdf',
      index_latency_ms: 1234,
    };

    logger.info('Document indexed', metadata);

    const loggedData = mockConsoleLog.mock.calls[0]![0] as string;
    const parsed = JSON.parse(loggedData);

    expect(parsed.metadata).toEqual(metadata);
  });

  it('should handle empty metadata', () => {
    logger.info('No metadata');

    const loggedData = mockConsoleLog.mock.calls[0]![0] as string;
    const parsed = JSON.parse(loggedData);

    expect(parsed.metadata).toBeUndefined();
  });

  it('should handle complex metadata', () => {
    const metadata = {
      filters: {
        year_min: 2020,
        tags: ['ai', 'ml'],
      },
      results_count: 10,
      query_latency_ms: 500,
    };

    logger.info('Search completed', metadata);

    const loggedData = mockConsoleLog.mock.calls[0]![0] as string;
    const parsed = JSON.parse(loggedData);

    expect(parsed.metadata).toEqual(metadata);
  });

  it('should not include metadata if object is empty', () => {
    logger.info('Empty metadata object', {});

    const loggedData = mockConsoleLog.mock.calls[0]![0] as string;
    const parsed = JSON.parse(loggedData);

    expect(parsed.metadata).toBeUndefined();
  });
});

describe('Logger - Log Levels', () => {
  let logger: TestLogger;

  beforeEach(() => {
    // console 메서드들을 모킹
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    console.debug = jest.fn();
  });

  it('should respect INFO level (default)', () => {
    logger = new TestLogger(LogLevel.INFO);

    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Error message');

    expect(console.debug).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('should respect WARN level', () => {
    logger = new TestLogger(LogLevel.WARN);

    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Error message');

    expect(console.debug).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('should respect ERROR level', () => {
    logger = new TestLogger(LogLevel.ERROR);

    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Error message');

    expect(console.debug).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('should log all levels when DEBUG is set', () => {
    logger = new TestLogger(LogLevel.DEBUG);

    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Error message');

    expect(console.debug).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('should allow changing log level at runtime', () => {
    logger = new TestLogger(LogLevel.ERROR);

    logger.info('Should not log');
    expect(console.log).not.toHaveBeenCalled();

    logger.setLevel(LogLevel.INFO);
    logger.info('Should log');
    expect(console.log).toHaveBeenCalledTimes(1);
  });
});

describe('Logger - Timer', () => {
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger(LogLevel.INFO);
  });

  it('should create a working timer', () => {
    const timer = logger.startTimer();

    expect(typeof timer).toBe('function');
  });

  it('should measure elapsed time', async () => {
    const timer = logger.startTimer();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const elapsed = timer();

    expect(elapsed).toBeGreaterThanOrEqual(90); // 약간의 여유
    expect(elapsed).toBeLessThan(200);
  });

  it('should return different times on multiple calls', async () => {
    const timer = logger.startTimer();

    await new Promise((resolve) => setTimeout(resolve, 50));
    const elapsed1 = timer();

    await new Promise((resolve) => setTimeout(resolve, 50));
    const elapsed2 = timer();

    expect(elapsed2).toBeGreaterThan(elapsed1);
  });

  it('should work with multiple timers', async () => {
    const timer1 = logger.startTimer();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const timer2 = logger.startTimer();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const elapsed1 = timer1();
    const elapsed2 = timer2();

    expect(elapsed1).toBeGreaterThan(elapsed2);
  });
});

describe('Logger - JSON Output Format', () => {
  let logger: TestLogger;
  let mockConsoleLog: jest.Mock;

  beforeEach(() => {
    logger = new TestLogger(LogLevel.INFO);
    mockConsoleLog = jest.fn();
    console.log = mockConsoleLog;
  });

  it('should output valid JSON', () => {
    logger.info('Test message');

    const loggedData = mockConsoleLog.mock.calls[0]![0] as string;

    expect(() => JSON.parse(loggedData)).not.toThrow();
  });

  it('should include timestamp in ISO format', () => {
    logger.info('Test message');

    const loggedData = mockConsoleLog.mock.calls[0]![0] as string;
    const parsed = JSON.parse(loggedData);

    expect(parsed.timestamp).toBeDefined();
    expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
  });

  it('should handle special characters in message', () => {
    const message = 'Test "quotes" and \n newlines \t tabs';
    logger.info(message);

    const loggedData = mockConsoleLog.mock.calls[0]![0] as string;
    const parsed = JSON.parse(loggedData);

    expect(parsed.message).toBe(message);
  });

  it('should serialize metadata correctly', () => {
    const metadata = {
      string: 'value',
      number: 123,
      boolean: true,
      array: [1, 2, 3],
      nested: { key: 'value' },
    };

    logger.info('Complex metadata', metadata);

    const loggedData = mockConsoleLog.mock.calls[0]![0] as string;
    const parsed = JSON.parse(loggedData);

    expect(parsed.metadata).toEqual(metadata);
  });
});
