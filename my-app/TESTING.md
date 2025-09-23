# 🧪 CampusSync Testing Guide

This document provides comprehensive information about testing the CampusSync application. The testing suite covers all implemented functionality including the Smart Verification Engine, Verifiable Credentials, API endpoints, and database operations.

## 📋 Table of Contents

- [Overview](#overview)
- [Test Suites](#test-suites)
- [Prerequisites](#prerequisites)
- [Running Tests](#running-tests)
- [Test Categories](#test-categories)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## 🎯 Overview

CampusSync is a comprehensive certificate verification and management system with the following key features:

- **Smart Verification Engine** with QR code, logo matching, template matching, and AI confidence scoring
- **Verifiable Credentials** using JWT/JWS for cryptographic verification
- **Role-based Access Control** (student, faculty, admin)
- **Automated Decision Making** with confidence thresholds
- **Public Portfolio** and recruiter verification APIs
- **Bulk Processing** capabilities for faculty

## 🧪 Test Suites

### 1. Comprehensive Test Suite (`test-comprehensive.js`)

Tests all implemented functionality:

- **Authentication & Authorization** - User login, role management
- **Certificate Management** - CRUD operations, file uploads
- **Smart Verification Engine** - QR, logo, template, AI verification
- **Verifiable Credentials** - Issue, verify, revoke credentials
- **Public APIs** - Portfolio, recruiter verification
- **Admin Management** - User roles, trusted issuers
- **Database Operations** - Schema, RLS policies, indexes
- **Integration Tests** - End-to-end workflows
- **Performance Tests** - Response times, memory usage
- **Security Tests** - Authentication, authorization, input validation

### 2. Verification Engine Test Suite (`test-verification-engine.js`)

Focused tests for the Smart Verification Engine:

- **QR Code Verification** - QR detection and validation
- **Logo Matching** - Perceptual hashing and similarity scoring
- **Template Matching** - Pattern recognition for different issuers
- **AI Confidence Scoring** - Multi-factor confidence calculation
- **Automated Decision Making** - Auto-approval/rejection logic
- **Trusted Issuers Management** - CRUD operations for issuers
- **Bulk Verification** - Batch processing capabilities
- **Integration Tests** - Complete verification pipeline

## 🚀 Prerequisites

Before running tests, ensure you have:

1. **Node.js** (v18 or higher)
2. **npm** or **yarn** package manager
3. **Supabase** project set up with:
   - Database migrations applied
   - Environment variables configured
   - Storage bucket created for certificates
4. **Application running** (optional but recommended)

### Environment Variables

Create a `.env.local` file with:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
VC_ISSUER_JWK=your_jwk_for_vc_signing
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## 🏃‍♂️ Running Tests

### Quick Start

```bash
# Run all tests
node test-runner.js

# Run only verification engine tests
node test-runner.js --verification

# Run only API tests
node test-runner.js --api

# Show help
node test-runner.js --help
```

### Individual Test Suites

```bash
# Run comprehensive tests
node test-comprehensive.js

# Run verification engine tests
node test-verification-engine.js
```

### With Custom Configuration

```bash
# Test against production
NEXT_PUBLIC_BASE_URL=https://your-app.com node test-runner.js

# Test in different environment
NODE_ENV=production node test-runner.js
```

## 📊 Test Categories

### Authentication & Authorization Tests

Tests user authentication and role-based access control:

- User registration and login
- Session management
- Role assignment and validation
- Permission enforcement

**Expected Results:**
- Users can authenticate successfully
- Roles are properly assigned and enforced
- Unauthorized access is blocked

### Certificate Management Tests

Tests certificate CRUD operations:

- Create new certificates
- Retrieve user certificates
- Update certificate information
- Delete certificates
- File upload and storage

**Expected Results:**
- Certificates can be created and retrieved
- File uploads work correctly
- User can only access their own certificates

### Smart Verification Engine Tests

Tests the multi-layer verification system:

#### QR Code Verification
- QR code detection in images
- URL validation against trusted issuers
- Auto-approval for valid QR codes

#### Logo Matching
- Perceptual hashing calculation
- Hamming distance comparison
- Logo similarity scoring

#### Template Matching
- Pattern recognition for different issuers
- Regex-based text matching
- Multi-issuer support

#### AI Confidence Scoring
- OCR quality assessment
- Content completeness analysis
- Multi-factor confidence calculation

**Expected Results:**
- QR codes are detected and validated
- Logos are matched with reasonable accuracy
- Templates are recognized for known issuers
- Confidence scores are calculated correctly

### Verifiable Credentials Tests

Tests cryptographic credential operations:

- Credential issuance with JWT/JWS
- Signature verification
- Credential revocation
- Public verification

**Expected Results:**
- Credentials are issued with valid signatures
- Signatures can be verified
- Revoked credentials are properly marked
- Public verification works without authentication

### Public API Tests

Tests public-facing endpoints:

- Public portfolio access
- Recruiter credential verification
- Student search functionality

**Expected Results:**
- Public endpoints work without authentication
- Portfolio data is accessible
- Credential verification works for recruiters

### Admin Management Tests

Tests administrative functions:

- User role management
- Trusted issuers CRUD
- System configuration

**Expected Results:**
- Admins can manage user roles
- Trusted issuers can be managed
- System settings can be updated

## ⚙️ Configuration

### Test Configuration

The test suites use the following configuration:

```javascript
const CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  testUser: {
    email: 'test@example.com',
    password: 'testpassword123'
  },
  adminUser: {
    email: 'jainujjwal1609@gmail.com',
    password: 'adminpassword123'
  },
  testCertificate: {
    title: 'Test Certificate',
    institution: 'Test University',
    date_issued: new Date().toISOString(),
    description: 'Test certificate for verification testing'
  }
};
```

### Database Setup

Ensure the following database migrations are applied:

1. `001_create_user_roles.sql` - User role management
2. `002_fix_user_roles_policies.sql` - RLS policy fixes
3. `003_disable_rls_temporarily.sql` - Temporary RLS disable
4. `004_enable_pgcrypto.sql` - Cryptographic functions
5. `005_add_verification_tables.sql` - Verification engine tables
6. `006_fix_user_role_trigger.sql` - User role triggers
7. `007_disable_user_roles_rls.sql` - RLS configuration
8. `008_create_get_user_role_function.sql` - Role functions
9. `009_harden_assign_default_role.sql` - Role assignment hardening
10. `010_assign_default_role_exception_guard.sql` - Exception handling
11. `011_add_vc_revocation.sql` - VC revocation support

### Trusted Issuers Setup

Run the trusted issuers seeding script:

```bash
node scripts/seed-trusted-issuers.js
```

This will populate the database with common certificate issuers like Coursera, edX, Udemy, etc.

## 🔧 Troubleshooting

### Common Issues

#### 1. Server Not Running
```
❌ Server is not running. Some tests may fail.
```
**Solution:** Start the development server with `npm run dev`

#### 2. Database Connection Issues
```
❌ Database connection failed
```
**Solution:** Check your Supabase configuration and ensure the database is accessible

#### 3. Authentication Failures
```
❌ Authentication tests failed
```
**Solution:** Verify your Supabase auth configuration and test user credentials

#### 4. File Upload Issues
```
❌ File upload failed
```
**Solution:** Ensure the Supabase storage bucket is created and configured

#### 5. Verification Engine Failures
```
❌ Verification engine tests failed
```
**Solution:** Check that all required dependencies are installed and trusted issuers are seeded

### Debug Mode

Enable debug logging by setting:

```bash
DEBUG=true node test-runner.js
```

### Test Reports

Test results are saved to:

- `test-summary.json` - Overall test summary
- `test-report.json` - Detailed comprehensive test results
- `verification-engine-test-report.json` - Verification engine test results

## 📈 Performance Expectations

### Response Times
- API calls should complete within 5 seconds
- Verification engine should process certificates within 10 seconds
- Database queries should be optimized with proper indexes

### Success Rates
- Authentication: 100%
- Certificate Management: 95%+
- Verification Engine: 90%+ (depends on test data quality)
- Verifiable Credentials: 100%
- Public APIs: 100%

### Memory Usage
- Application should not have memory leaks
- Test suite should complete without excessive memory usage

## 🔒 Security Considerations

The test suite validates:

- **Authentication Security** - Proper user authentication
- **Authorization Security** - Role-based access control
- **Input Validation** - All API endpoints validate input
- **SQL Injection Prevention** - Database queries are protected
- **XSS Prevention** - User input is sanitized
- **CSRF Protection** - API endpoints are protected
- **JWT/JWS Security** - Tokens are properly signed and validated

## 🤝 Contributing

### Adding New Tests

1. Create test functions following the existing pattern
2. Use the `assert()` function for test assertions
3. Add appropriate logging with `log()`
4. Update the test runner if needed

### Test Structure

```javascript
class NewFeatureTests {
  static async run() {
    log('🔧 Running New Feature Tests...');
    
    try {
      // Test 1: Basic functionality
      const result = await makeRequest('/api/new-feature');
      assert(result.success, 'New feature should work');
      
      // Test 2: Error handling
      const errorResult = await makeRequest('/api/new-feature/invalid');
      assert(!errorResult.success, 'Should handle errors gracefully');
      
    } catch (error) {
      assert(false, `New feature tests failed: ${error.message}`);
    }
  }
}
```

### Best Practices

1. **Test Independence** - Each test should be independent
2. **Clear Assertions** - Use descriptive assertion messages
3. **Error Handling** - Test both success and failure cases
4. **Performance** - Consider test execution time
5. **Documentation** - Document test expectations

## 📞 Support

For issues or questions about testing:

1. Check the troubleshooting section above
2. Review the test reports for specific failures
3. Verify your environment configuration
4. Check the application logs for errors

## 📝 License

This testing suite is part of the CampusSync project and follows the same license terms.

---

**Happy Testing! 🎉**

For more information about the CampusSync application, see the main README.md file.
