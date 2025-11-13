#!/usr/bin/env node

/**
 * MCP Gemini FileSearch CLI
 *
 * 실행 가능한 진입점 - 환경변수 파싱 및 서버 시작
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * CLI 인자 파싱
 *
 * -e 플래그로 환경변수를 설정하고, --port/--host 옵션을 지원합니다.
 *
 * 사용 예:
 *   npx mcp-gemini-filesearch \
 *     -e GEMINI_API_KEY=AIzaSyXXXX \
 *     -e GEMINI_FILESTORE_NAME=my-research-store \
 *     --port 8787 --host 0.0.0.0
 */
function parseArgs(args) {
  const env = { ...process.env };
  let port = '8765';
  let host = '127.0.0.1';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-e' && i + 1 < args.length) {
      // 환경변수 파싱: -e KEY=VALUE
      const envVar = args[i + 1];
      const [key, ...valueParts] = envVar.split('=');
      const value = valueParts.join('='); // = 문자가 value에 포함될 수 있음

      if (key && value) {
        env[key] = value;
      } else {
        console.error(`❌ Invalid environment variable format: ${envVar}`);
        console.error('   Expected format: -e KEY=VALUE');
        process.exit(1);
      }
      i++; // 다음 인자 스킵
    } else if (arg === '--port' && i + 1 < args.length) {
      port = args[i + 1];
      i++;
    } else if (arg === '--host' && i + 1 < args.length) {
      host = args[i + 1];
      i++;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  // PORT와 HOST를 환경변수로 설정
  env.MCP_PORT = port;
  env.MCP_HOST = host;

  return env;
}

/**
 * 도움말 출력
 */
function printHelp() {
  console.log(`
MCP Gemini FileSearch Server v1.3

USAGE:
  npx mcp-gemini-filesearch [OPTIONS]

REQUIRED ENVIRONMENT VARIABLES:
  -e GEMINI_API_KEY=<key>              Gemini API key (required)
  -e GEMINI_FILESTORE_NAME=<name>      File Search store display name (required)

OPTIONAL:
  --port <port>                        Server port (default: 8765)
  --host <host>                        Server host (default: 127.0.0.1)
  --help, -h                           Show this help message

EXAMPLE:
  npx mcp-gemini-filesearch \\
    -e GEMINI_API_KEY=AIzaSyXXXX \\
    -e GEMINI_FILESTORE_NAME=my-research-store

  # Custom port and host
  npx mcp-gemini-filesearch \\
    -e GEMINI_API_KEY=AIzaSyXXXX \\
    -e GEMINI_FILESTORE_NAME=my-research-store \\
    --port 8787 --host 0.0.0.0

FILE STORE:
  The server will automatically find or create a File Store with the specified display name.
  Use the same name to access the same store across sessions.

ENVIRONMENT VARIABLES:
  LOG_LEVEL                       Log level: debug, info, warn, error (default: info)
`);
}

/**
 * 서버 프로세스 시작
 */
function startServer(env) {
  // server.ts의 경로 (dist 디렉토리에서 실행)
  const serverPath = join(__dirname, '..', 'dist', 'server.js');

  // Node.js로 서버 실행
  const serverProcess = spawn('node', [serverPath], {
    env,
    stdio: 'inherit', // 표준 입출력 상속
  });

  // 서버 프로세스 종료 처리
  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`❌ Server process exited with code ${code}`);
      process.exit(code);
    }
  });

  serverProcess.on('error', (error) => {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  });

  // 프로세스 종료 시그널 전달
  process.on('SIGINT', () => {
    serverProcess.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    serverProcess.kill('SIGTERM');
  });
}

/**
 * 메인 함수
 */
function main() {
  const args = process.argv.slice(2);

  // 인자 파싱 및 환경변수 설정
  const env = parseArgs(args);

  // 필수 환경변수 검증
  if (!env.GEMINI_API_KEY) {
    console.error('❌ Missing required environment variable: GEMINI_API_KEY');
    console.error('');
    console.error('Run with --help for more information');
    process.exit(1);
  }

  if (!env.GEMINI_FILESTORE_NAME) {
    console.error('❌ Missing required environment variable: GEMINI_FILESTORE_NAME');
    console.error('');
    console.error('Example configuration:');
    console.error('');
    console.error('  {');
    console.error('    "env": {');
    console.error('      "GEMINI_API_KEY": "your-api-key",');
    console.error('      "GEMINI_FILESTORE_NAME": "my-research-store"');
    console.error('    }');
    console.error('  }');
    console.error('');
    console.error('The server will automatically find or create a File Store with this name.');
    console.error('');
    process.exit(1);
  }

  // 서버 시작
  startServer(env);
}

// CLI 실행
main();
