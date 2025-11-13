/**
 * 구조화된 로깅 유틸리티
 *
 * 성능 메트릭 추적 및 디버깅을 위한 구조화된 로그 출력을 제공합니다.
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface LogMetadata {
  [key: string]: unknown;
  // 성능 메트릭
  index_latency_ms?: number;
  query_latency_ms?: number;
  bytes_uploaded?: number;
  // 요청 정보
  doc_id?: string;
  store_id?: string;
  file_name?: string;
  // 오류 정보
  error_code?: string;
  retryable?: boolean;
  attempt?: number;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: LogMetadata;
}

class Logger {
  private minLevel: LogLevel;

  constructor(minLevel: LogLevel = LogLevel.INFO) {
    this.minLevel = minLevel;
  }

  /**
   * 로그 레벨 우선순위 확인
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  /**
   * 로그 엔트리 포맷팅 및 출력
   */
  private log(level: LogLevel, message: string, metadata?: LogMetadata): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(metadata && Object.keys(metadata).length > 0 && { metadata }),
    };

    const output = JSON.stringify(entry);

    // MCP 서버에서는 모든 로그를 stderr로 출력해야 함
    // stdout은 JSON-RPC 메시지 전용
    console.error(output);
  }

  debug(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  info(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  error(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.ERROR, message, metadata);
  }

  /**
   * 성능 메트릭 추적을 위한 타이머 시작
   */
  startTimer(): () => number {
    const startTime = Date.now();
    return () => Date.now() - startTime;
  }

  /**
   * 로그 레벨 변경
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }
}

// 환경변수로 로그 레벨 설정
const logLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || LogLevel.INFO;
export const logger = new Logger(logLevel);
