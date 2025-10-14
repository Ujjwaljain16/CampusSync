# 🧪 CampusSync Testing Guide

This guide covers the complete testing suite for CampusSync, including unit tests, integration tests, and end-to-end workflow testing.

## 📋 Test Files Overview

### Core Test Files
- **`test-setup.js`** - Environment setup and validation
- **`test-core-workflow.js`** - Essential functionality testing
- **`test-complete-end-to-end.js`** - Full workflow simulation
- **`run-tests.js`** - Test orchestration and reporting

## 🚀 Quick Start

### 1. Setup Test Environment
```bash
# Install dependencies
npm install

# Setup test environment
node test-setup.js
```

### 2. Run Core Tests
```bash
# Run essential functionality tests
node test-core-workflow.js

# Or use the test runner
node run-tests.js
```

### 3. Run Full E2E Tests
```bash
# Run complete end-to-end tests
node run-tests.js --full
```

## 🔧 Test Environment Requirements

### Environment Variables
Ensure `.env.local` contains:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### Database Schema
The tests require these tables:
- `user_roles` - User role assignments
- `certificates` - Certificate storage
- `documents` - Document metadata
- `document_metadata` - OCR and verification data
- `verifiable_credentials` - VC storage
- `audit_logs` - System audit trail
- `role_requests` - Role request management

### API Server
Ensure the Next.js development server is running:
```bash
npm run dev
```

## 📊 Test Coverage

### Core Workflow Tests (`test-core-workflow.js`)
- ✅ Database connectivity
- ✅ API endpoint availability
- ✅ Authentication system
- ✅ OCR pipeline functionality
- ✅ Role-based access control
- ✅ VC system (issue, verify, revoke)
- ✅ Advanced features (webhooks, analytics)

### End-to-End Tests (`test-complete-end-to-end.js`)
- ✅ Student workflow (upload → review → portfolio)
- ✅ Faculty workflow (review → approve → VC issue)
- ✅ Recruiter workflow (search → verify → export)
- ✅ Admin workflow (manage → monitor → analytics)
- ✅ OCR pipeline (multi-engine → AI → policy)
- ✅ VC lifecycle (issue → verify → revoke)
- ✅ Advanced features (webhooks → status list → notifications)

## 🎯 Test Scenarios

### 1. Student Workflow
```
1. Student signs up → Gets student role
2. Student uploads certificate → OCR processing
3. Student views dashboard → Sees pending certificates
4. Student creates public portfolio → Shareable link
```

### 2. Faculty Workflow
```
1. Faculty signs up → Gets faculty role
2. Faculty views pending documents → Reviews evidence
3. Faculty approves/rejects → Updates status
4. Faculty batch operations → Multiple approvals
```

### 3. Recruiter Workflow
```
1. Recruiter signs up → Gets recruiter role
2. Recruiter searches students → Advanced filters
3. Recruiter verifies credentials → Bulk verification
4. Recruiter exports data → CSV reports
```

### 4. Admin Workflow
```
1. Admin manages roles → Role changes
2. Admin views analytics → System metrics
3. Admin manages requests → Approve/deny roles
4. Admin monitors system → Health checks
```

## 🔍 OCR Pipeline Testing

### Document Types Tested
- **Certificates** - Course completion certificates
- **Transcripts** - Academic transcripts
- **Letters** - Recommendation letters
- **IDs** - Student identification documents

### OCR Engines Tested
- **PDF Text Extraction** - Native PDF text
- **Google Vision API** - Cloud OCR service
- **PaddleOCR** - FastAPI microservice
- **Tesseract.js** - Local fallback OCR

### AI Features Tested
- **Confidence Scoring** - AI confidence assessment
- **Policy Engine** - Automated verification rules
- **Field Extraction** - Structured data extraction
- **Logo Matching** - Institution verification

## 🔐 VC System Testing

### VC Lifecycle
1. **Issue** - Create verifiable credential
2. **Verify** - Validate credential authenticity
3. **Status Check** - Check revocation status
4. **Revoke** - Revoke credential with reason

### VC Features Tested
- **JWK Management** - Key generation and rotation
- **Digital Signatures** - JOSE library integration
- **Status List** - StatusList2021 compliance
- **Revocation Registry** - Persistent status tracking

## 📈 Test Results Interpretation

### Success Indicators
- ✅ All API endpoints responding (200, 401, 403 OK)
- ✅ Database operations successful
- ✅ Authentication working
- ✅ OCR pipeline processing documents
- ✅ Role-based access enforced
- ✅ VC system functional

### Common Issues
- ❌ **Database Connection Failed** - Check Supabase credentials
- ❌ **API Server Not Running** - Run `npm run dev`
- ❌ **Missing Environment Variables** - Check `.env.local`
- ❌ **Schema Missing** - Run database migrations

## 🛠️ Troubleshooting

### Test Setup Issues
```bash
# Check environment variables
node -e "console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)"

# Test database connection
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('user_roles').select('count').then(console.log);
"
```

### API Server Issues
```bash
# Check if server is running
curl http://localhost:3000/api/health

# Check specific endpoint
curl http://localhost:3000/api/student/dashboard
```

### Database Issues
```bash
# Check table existence
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('user_roles').select('*').limit(1).then(r => console.log(r.error || 'OK'));
"
```

## 📝 Test Customization

### Adding New Tests
1. Create test file: `test-new-feature.js`
2. Follow the pattern in existing test files
3. Add to `run-tests.js` orchestration
4. Update this documentation

### Test Data Management
- Tests create temporary data
- Cleanup happens automatically
- Use unique identifiers (timestamps)
- Avoid conflicts with production data

## 🎉 Production Readiness

### Pre-Production Checklist
- [ ] All tests passing
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] API server responding
- [ ] OCR pipeline working
- [ ] VC system functional
- [ ] Role-based access enforced
- [ ] Audit logging enabled

### Performance Testing
- Load test API endpoints
- Stress test OCR pipeline
- Monitor database performance
- Test concurrent users
- Validate VC issuance speed

## 📞 Support

If you encounter issues with the testing suite:

1. Check the troubleshooting section above
2. Verify all environment variables are set
3. Ensure the API server is running
4. Check database connectivity
5. Review test logs for specific errors

The testing suite is designed to be comprehensive yet easy to run, providing confidence that CampusSync is production-ready! 🚀