#!/usr/bin/env node

/**
 * Simple MCP client to test the server
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testMCPServer() {
  console.log('🚀 Testing MCP Server...\n');

  // Start MCP server
  const serverPath = join(__dirname, 'dist', 'server.js');
  const server = spawn('node', [serverPath], {
    env: {
      ...process.env,
      GEMINI_API_KEY: 'AIzaSyDoUHEfdSQjY-lLZkYuccwiDyBygdjzPmE',
      GEMINI_FILESTORE_ID: 'test-file-store',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let responseData = '';

  server.stdout.on('data', (data) => {
    responseData += data.toString();
  });

  server.stderr.on('data', (data) => {
    console.error('STDERR:', data.toString());
  });

  // Wait a bit for server to start
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Send initialize request
  const initializeRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    },
  };

  console.log('📤 Sending initialize request...');
  server.stdin.write(JSON.stringify(initializeRequest) + '\n');

  // Wait for response
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Send initialized notification
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // Request tools list
  const toolsListRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  };

  console.log('📤 Sending tools/list request...\n');
  server.stdin.write(JSON.stringify(toolsListRequest) + '\n');

  // Wait for response
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log('📥 Server responses:\n');
  console.log(responseData);

  server.kill();
  process.exit(0);
}

testMCPServer().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
