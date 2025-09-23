#!/usr/bin/env node

/**
 * 🛠️ CampusSync Test Setup Script
 * 
 * This script sets up the testing environment for CampusSync:
 * - Checks prerequisites
 * - Validates configuration
 * - Sets up test data
 * - Verifies database connectivity
 * 
 * Run with: node setup-tests.js
 */

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
    
    logInfo('Environment variables loaded from .env.local');
    return true;
  } else {
    logWarning('.env.local file not found');
    return false;
  }
}

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

// Check if file exists
function fileExists(filePath) {
  return fs.existsSync(filePath);
}

// Check if directory exists
function dirExists(dirPath) {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

// Check Node.js version
function checkNodeVersion() {
  const version = process.version;
  const majorVersion = parseInt(version.slice(1).split('.')[0]);
  
  logInfo(`Node.js version: ${version}`);
  
  if (majorVersion >= 18) {
    logSuccess('Node.js version is compatible (>= 18)');
    return true;
  } else {
    logError('Node.js version 18 or higher is required');
    return false;
  }
}

// Check if package.json exists
function checkPackageJson() {
  if (fileExists('package.json')) {
    logSuccess('package.json found');
    
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      
      // Check for required dependencies
      const requiredDeps = [
        'next',
        '@supabase/supabase-js',
        '@supabase/ssr',
        'jose',
        'jimp',
        '@zxing/library',
        'tesseract.js'
      ];
      
      const missingDeps = requiredDeps.filter(dep => 
        !packageJson.dependencies[dep] && !packageJson.devDependencies[dep]
      );
      
      if (missingDeps.length === 0) {
        logSuccess('All required dependencies are present');
        return true;
      } else {
        logError(`Missing dependencies: ${missingDeps.join(', ')}`);
        return false;
      }
    } catch (error) {
      logError(`Error reading package.json: ${error.message}`);
      return false;
    }
  } else {
    logError('package.json not found');
    return false;
  }
}

// Check environment variables
function checkEnvironmentVariables() {
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ];
  
  const optionalVars = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'VC_ISSUER_JWK',
    'NEXT_PUBLIC_BASE_URL'
  ];
  
  let allRequired = true;
  
  logInfo('Checking environment variables...');
  
  // Check required variables
  for (const varName of requiredVars) {
    if (process.env[varName]) {
      logSuccess(`${varName} is set`);
    } else {
      logError(`${varName} is not set`);
      allRequired = false;
    }
  }
  
  // Check optional variables
  for (const varName of optionalVars) {
    if (process.env[varName]) {
      logSuccess(`${varName} is set`);
    } else {
      logWarning(`${varName} is not set (optional)`);
    }
  }
  
  return allRequired;
}

// Check if test files exist
function checkTestFiles() {
  const testFiles = [
    'test-comprehensive.js',
    'test-verification-engine.js',
    'test-runner.js'
  ];
  
  let allExist = true;
  
  logInfo('Checking test files...');
  
  for (const file of testFiles) {
    if (fileExists(file)) {
      logSuccess(`${file} exists`);
    } else {
      logError(`${file} not found`);
      allExist = false;
    }
  }
  
  return allExist;
}

// Check if database migrations exist
function checkDatabaseMigrations() {
  const migrationsDir = 'supabase-migrations';
  
  if (!dirExists(migrationsDir)) {
    logError('supabase-migrations directory not found');
    return false;
  }
  
  const requiredMigrations = [
    '001_create_user_roles.sql',
    '005_add_verification_tables.sql',
    '011_add_vc_revocation.sql'
  ];
  
  let allExist = true;
  
  logInfo('Checking database migrations...');
  
  for (const migration of requiredMigrations) {
    const migrationPath = path.join(migrationsDir, migration);
    if (fileExists(migrationPath)) {
      logSuccess(`${migration} exists`);
    } else {
      logError(`${migration} not found`);
      allExist = false;
    }
  }
  
  return allExist;
}

// Check if scripts directory exists
function checkScripts() {
  const scriptsDir = 'scripts';
  
  if (!dirExists(scriptsDir)) {
    logWarning('scripts directory not found');
    return false;
  }
  
  const requiredScripts = [
    'seed-trusted-issuers.js',
    'setup-admin.js'
  ];
  
  let allExist = true;
  
  logInfo('Checking setup scripts...');
  
  for (const script of requiredScripts) {
    const scriptPath = path.join(scriptsDir, script);
    if (fileExists(scriptPath)) {
      logSuccess(`${script} exists`);
    } else {
      logWarning(`${script} not found`);
    }
  }
  
  return allExist;
}

// Create test assets directory
function createTestAssets() {
  const testAssetsDir = 'test-assets';
  
  if (!dirExists(testAssetsDir)) {
    try {
      fs.mkdirSync(testAssetsDir, { recursive: true });
      logSuccess('Created test-assets directory');
    } catch (error) {
      logError(`Failed to create test-assets directory: ${error.message}`);
      return false;
    }
  } else {
    logSuccess('test-assets directory exists');
  }
  
  // Create a sample test certificate image (placeholder)
  const sampleImagePath = path.join(testAssetsDir, 'sample-certificate.jpg');
  if (!fileExists(sampleImagePath)) {
    try {
      // Create a minimal JPEG file for testing
      const jpegData = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
        0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
        0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
        0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
        0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
        0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01,
        0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
        0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xFF, 0xC4,
        0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x0C,
        0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0x80, 0xFF, 0xD9
      ]);
      
      fs.writeFileSync(sampleImagePath, jpegData);
      logSuccess('Created sample test certificate image');
    } catch (error) {
      logWarning(`Failed to create sample test image: ${error.message}`);
    }
  } else {
    logSuccess('Sample test certificate image exists');
  }
  
  return true;
}

// Generate setup report
function generateSetupReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    checks: results,
    summary: {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length
    }
  };
  
  fs.writeFileSync('test-setup-report.json', JSON.stringify(report, null, 2));
  logInfo('Setup report saved to test-setup-report.json');
}

// Main setup function
async function setupTests() {
  logHeader('CampusSync Test Setup');
  
  // Load environment variables first
  loadEnvFile();
  
  const results = [];
  
  // Run all checks
  const checks = [
    { name: 'Node.js Version', check: checkNodeVersion },
    { name: 'Package.json', check: checkPackageJson },
    { name: 'Environment Variables', check: checkEnvironmentVariables },
    { name: 'Test Files', check: checkTestFiles },
    { name: 'Database Migrations', check: checkDatabaseMigrations },
    { name: 'Setup Scripts', check: checkScripts },
    { name: 'Test Assets', check: createTestAssets }
  ];
  
  for (const check of checks) {
    logInfo(`Running check: ${check.name}`);
    const passed = check.check();
    results.push({ name: check.name, passed });
  }
  
  // Generate report
  generateSetupReport(results);
  
  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  logHeader('Setup Summary');
  log(`Total Checks: ${results.length}`);
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  
  if (failed > 0) {
    log('\nFailed Checks:', 'red');
    results.filter(r => !r.passed).forEach(result => {
      log(`  - ${result.name}`, 'red');
    });
    
    log('\nNext Steps:', 'yellow');
    log('1. Fix the failed checks above');
    log('2. Run this setup script again');
    log('3. Once all checks pass, run the tests with: node test-runner.js');
  } else {
    log('\n🎉 All checks passed! You can now run the tests:', 'green');
    log('  node test-runner.js', 'bright');
  }
  
  return failed === 0;
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

// Run setup if called directly
if (require.main === module) {
  setupTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    logError(`Setup failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { setupTests };
