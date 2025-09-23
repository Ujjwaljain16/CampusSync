#!/usr/bin/env node

/**
 * 🧪 CampusSync Test Runner
 * 
 * This script runs all test suites for the CampusSync application.
 * It provides options to run specific test categories or all tests.
 * 
 * Usage:
 *   node test-runner.js                    # Run all tests
 *   node test-runner.js --verification    # Run only verification engine tests
 *   node test-runner.js --api             # Run only API tests
 *   node test-runner.js --help            # Show help
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env.local');
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envLines = envContent.split('\n');
    
    for (const line of envLines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // Remove quotes
          process.env[key] = value;
        }
      }
    }
    
    return true;
  }
  return false;
}

// Test configuration
const CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  testSuites: {
    comprehensive: 'test-comprehensive.js',
    verification: 'test-verification-engine.js',
    ocr: 'test-ocr-extraction.js',
    ocrExtractorUnit: 'test-ocr-extractor-unit.js',
    ocrExtractorApi: 'test-ocr-extractor-api.js'
  }
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`  ${message}`, 'bright');
  log(`${'='.repeat(60)}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// Check if server is running
async function checkServerRunning() {
  try {
    // Try a public endpoint that doesn't require auth
    const response = await fetch(`${CONFIG.baseUrl}/api/recruiter/verify-credential?jws=test`);
    // Even if it returns an error, if we get a response, server is running
    return response.status !== undefined;
  } catch (error) {
    return false;
  }
}

// Run a test suite
function runTestSuite(suiteName, testFile) {
  logHeader(`Running ${suiteName} Tests`);
  
  try {
    if (!fs.existsSync(testFile)) {
      logError(`Test file not found: ${testFile}`);
      return false;
    }
    
    logInfo(`Executing: node ${testFile}`);
    const startTime = Date.now();
    
    execSync(`node ${testFile}`, { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logSuccess(`${suiteName} tests completed in ${duration}ms`);
    return true;
    
  } catch (error) {
    logError(`${suiteName} tests failed: ${error.message}`);
    return false;
  }
}

// Generate test report summary
function generateTestReport(results) {
  const totalTests = results.length;
  const passedTests = results.filter(r => r.success).length;
  const failedTests = totalTests - passedTests;
  const successRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;
  
  logHeader('Test Report Summary');
  log(`Total Test Suites: ${totalTests}`);
  log(`Passed: ${passedTests}`, 'green');
  log(`Failed: ${failedTests}`, failedTests > 0 ? 'red' : 'green');
  log(`Success Rate: ${successRate.toFixed(2)}%`, successRate === 100 ? 'green' : 'yellow');
  
  if (failedTests > 0) {
    log('\nFailed Test Suites:', 'red');
    results.filter(r => !r.success).forEach(result => {
      log(`  - ${result.name}`, 'red');
    });
  }
  
  // Save summary to file
  const summary = {
    timestamp: new Date().toISOString(),
    totalSuites: totalTests,
    passed: passedTests,
    failed: failedTests,
    successRate,
    results: results.map(r => ({
      name: r.name,
      success: r.success,
      duration: r.duration
    }))
  };
  
  fs.writeFileSync('test-summary.json', JSON.stringify(summary, null, 2));
  logInfo('Test summary saved to test-summary.json');
}

// Show help
function showHelp() {
  logHeader('CampusSync Test Runner');
  log('This script runs comprehensive tests for the CampusSync application.\n');
  
  log('Usage:', 'bright');
  log('  node test-runner.js [options]\n');
  
  log('Options:', 'bright');
  log('  --verification    Run only verification engine tests');
  log('  --api            Run only API tests');
  log('  --all            Run all test suites (default)');
  log('  --help           Show this help message\n');
  
  log('Environment Variables:', 'bright');
  log('  NEXT_PUBLIC_BASE_URL    Base URL for the application (default: http://localhost:3000)');
  log('  NODE_ENV               Environment (development, production)\n');
  
  log('Examples:', 'bright');
  log('  node test-runner.js');
  log('  node test-runner.js --verification');
  log('  NEXT_PUBLIC_BASE_URL=https://myapp.com node test-runner.js --all');
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }
  
  // Load environment variables first
  loadEnvFile();
  
  logHeader('CampusSync Test Runner');
  logInfo(`Testing against: ${CONFIG.baseUrl}`);
  
  // Check if server is running
  logInfo('Checking if server is running...');
  const serverRunning = await checkServerRunning();
  
  if (!serverRunning) {
    logWarning('Server is not running. Some tests may fail.');
    logInfo('To start the server, run: npm run dev');
  } else {
    logSuccess('Server is running and accessible');
  }
  
  // Determine which tests to run
  let testSuites = [];
  
  if (args.includes('--verification')) {
    testSuites = [{ name: 'Verification Engine', file: CONFIG.testSuites.verification }];
  } else if (args.includes('--api')) {
    testSuites = [{ name: 'Comprehensive API', file: CONFIG.testSuites.comprehensive }];
  } else {
    // Run all tests
    testSuites = [
      { name: 'Comprehensive API', file: CONFIG.testSuites.comprehensive },
      { name: 'Verification Engine', file: CONFIG.testSuites.verification },
      { name: 'OCR Extraction', file: CONFIG.testSuites.ocr },
      { name: 'OCR Extractor Unit', file: CONFIG.testSuites.ocrExtractorUnit },
      { name: 'OCR Extractor API', file: CONFIG.testSuites.ocrExtractorApi }
    ];
  }
  
  // Run tests
  const results = [];
  const startTime = Date.now();
  
  for (const suite of testSuites) {
    const suiteStartTime = Date.now();
    const success = runTestSuite(suite.name, suite.file);
    const suiteEndTime = Date.now();
    
    results.push({
      name: suite.name,
      success,
      duration: suiteEndTime - suiteStartTime
    });
  }
  
  const totalTime = Date.now() - startTime;
  
  // Generate report
  generateTestReport(results);
  
  logInfo(`Total execution time: ${totalTime}ms`);
  
  // Exit with appropriate code
  const hasFailures = results.some(r => !r.success);
  process.exit(hasFailures ? 1 : 0);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logError(`Uncaught Exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logError(`Unhandled Rejection: ${reason}`);
  process.exit(1);
});

// Run the main function
if (require.main === module) {
  main().catch(error => {
    logError(`Test runner failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { main, runTestSuite, checkServerRunning };
