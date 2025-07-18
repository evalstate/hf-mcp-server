#!/usr/bin/env node

// Quick diagnostic script for HF logging configuration
console.log('=== HF Logging Environment Check ===\n');

// Check environment variables
const envVars = {
  'LOGGING_DATASET_ID': process.env.LOGGING_DATASET_ID,
  'LOGGING_HF_TOKEN': process.env.LOGGING_HF_TOKEN ? '✓ Set' : '✗ Not set',
  'DEFAULT_HF_TOKEN': process.env.DEFAULT_HF_TOKEN ? '✓ Set' : '✗ Not set',
  'LOGGING_BATCH_SIZE': process.env.LOGGING_BATCH_SIZE || '100 (default)',
  'LOGGING_FLUSH_INTERVAL': process.env.LOGGING_FLUSH_INTERVAL || '300000 (default)',
  'NODE_ENV': process.env.NODE_ENV || 'production (default)',
  'LOG_LEVEL': process.env.LOG_LEVEL || 'info (default)',
};

console.log('Environment Variables:');
for (const [key, value] of Object.entries(envVars)) {
  console.log(`  ${key}: ${value || '✗ Not set'}`);
}

// Check if any token is available
const hasToken = !!(process.env.LOGGING_HF_TOKEN || process.env.DEFAULT_HF_TOKEN);
console.log(`\n${hasToken ? '✓' : '✗'} HF Token available`);

// Check if logging should be enabled
const loggingEnabled = !!process.env.LOGGING_DATASET_ID && hasToken;
console.log(`${loggingEnabled ? '✓' : '✗'} HF Dataset logging should be ${loggingEnabled ? 'enabled' : 'disabled'}`);

if (!loggingEnabled) {
  console.log('\n⚠️  Issues found:');
  if (!process.env.LOGGING_DATASET_ID) {
    console.log('  - LOGGING_DATASET_ID is not set');
  }
  if (!hasToken) {
    console.log('  - No HF token found (set LOGGING_HF_TOKEN or DEFAULT_HF_TOKEN)');
  }
}

console.log('\n=== Transport Path Check ===');
const path = require('path');
const fs = require('fs');

// Check if the transport file exists in various locations
const possiblePaths = [
  './hf-dataset-transport.js',
  path.join(__dirname, 'packages/app/dist/server/lib/hf-dataset-transport.js'),
  path.join(__dirname, 'packages/app/src/server/lib/hf-dataset-transport.ts'),
];

console.log('Checking transport file locations:');
for (const p of possiblePaths) {
  const exists = fs.existsSync(p);
  console.log(`  ${exists ? '✓' : '✗'} ${p}`);
}