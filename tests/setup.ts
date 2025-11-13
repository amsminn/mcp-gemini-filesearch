/**
 * Jest 테스트 셋업 파일
 *
 * 모든 테스트 실행 전에 로드되어 환경을 설정합니다.
 */

// 환경변수 설정 (테스트용)
process.env.GEMINI_API_KEY = 'test-api-key-12345';
process.env.GEMINI_FILESTORE_ID = 'test-store-id-67890';
process.env.LOG_LEVEL = 'error'; // 테스트 중 로그 최소화

// 타임존 설정
process.env.TZ = 'UTC';
