#!/usr/bin/env node
/**
 * Deployment verification script
 * Checks that the server can start and respond to health checks
 */

import { spawn } from 'child_process';
import http from 'http';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

console.log('Starting deployment verification...');

// Start the server
const server = spawn('node', ['server.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: PORT,
    HOST: HOST,
    SESSION_SECRET: process.env.SESSION_SECRET || 'test_secret_key_12345',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'test_key',
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || 'test_key'
  },
  stdio: 'pipe'
});

let serverReady = false;

server.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(`Server: ${output.trim()}`);
  
  if (output.includes('AI Listing Agent') && output.includes('Health check')) {
    serverReady = true;
    setTimeout(runHealthChecks, 2000);
  }
});

server.stderr.on('data', (data) => {
  console.error(`Server Error: ${data}`);
});

server.on('close', (code) => {
  console.log(`Server process exited with code ${code}`);
  process.exit(code);
});

function runHealthChecks() {
  console.log('\nRunning health checks...');
  
  const endpoints = ['/health', '/healthz', '/ping', '/ready'];
  const promises = endpoints.map(endpoint => checkEndpoint(endpoint));
  
  Promise.all(promises)
    .then(results => {
      const allPassed = results.every(result => result.success);
      console.log(`\nHealth check summary: ${results.filter(r => r.success).length}/${results.length} passed`);
      
      if (allPassed) {
        console.log('✅ All health checks passed! Server is deployment ready.');
        process.exit(0);
      } else {
        console.log('❌ Some health checks failed. Check the errors above.');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Health check failed:', err);
      process.exit(1);
    })
    .finally(() => {
      server.kill();
    });
}

function checkEndpoint(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: HOST === '0.0.0.0' ? 'localhost' : HOST,
      port: PORT,
      path: path,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const success = res.statusCode >= 200 && res.statusCode < 300;
        console.log(`${success ? '✅' : '❌'} ${path}: ${res.statusCode} ${success ? 'OK' : 'FAILED'}`);
        
        if (!success) {
          console.log(`   Response: ${data}`);
        }
        
        resolve({ endpoint: path, success, statusCode: res.statusCode, data });
      });
    });

    req.on('error', (error) => {
      console.log(`❌ ${path}: ERROR - ${error.message}`);
      resolve({ endpoint: path, success: false, error: error.message });
    });

    req.on('timeout', () => {
      console.log(`❌ ${path}: TIMEOUT`);
      req.destroy();
      resolve({ endpoint: path, success: false, error: 'timeout' });
    });

    req.end();
  });
}

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\nStopping verification...');
  server.kill();
  process.exit(0);
});

// Timeout after 30 seconds
setTimeout(() => {
  console.log('❌ Verification timeout - server may not be starting properly');
  server.kill();
  process.exit(1);
}, 30000);