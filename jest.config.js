/**
 * Jest 설정 파일
 *
 * TypeScript + ES Modules 환경에서 Jest를 실행하기 위한 설정
 */

export default {
  // TypeScript 지원
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],

  // 테스트 환경
  testEnvironment: 'node',

  // 모듈 경로 설정
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // 테스트 파일 패턴
  testMatch: ['**/tests/unit/**/*.test.ts'],

  // 커버리지 설정
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/server.ts', // 서버 엔트리포인트 제외
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],

  // 커버리지 임계값 (unit 테스트만 사용)
  // gemini-client.ts와 tools는 실제 API 호출이 필요하므로 unit 테스트 제외
  coverageThreshold: {
    // Core libraries require high coverage
    './src/lib/validators.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './src/lib/error-handler.ts': {
      branches: 90,
      functions: 100,
      lines: 95,
      statements: 95,
    },
    './src/lib/logger.ts': {
      branches: 70,
      functions: 50,
      lines: 70,
      statements: 70,
    },
  },

  // 타임아웃 설정
  testTimeout: 10000, // Unit 테스트용

  // 변환 설정
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'Node16',
          moduleResolution: 'Node16',
        },
      },
    ],
  },

  // 모듈 파일 확장자
  moduleFileExtensions: ['ts', 'js', 'json'],

  // 테스트 실행 전 환경변수 설정
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // 병렬 실행 제한 (API 호출 제한 고려)
  maxWorkers: 2,

  // 상세한 출력
  verbose: true,
};
