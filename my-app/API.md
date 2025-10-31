# 📚 API Documentation

## Base URL
```
Development: http://localhost:3000
Production: https://your-domain.com
```

## Authentication

All authenticated endpoints require a valid JWT token in the Authorization header:

```bash
Authorization: Bearer <your-jwt-token>
```

## Rate Limits

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Auth | 5 requests | 15 minutes |
| Upload | 3 requests | 5 minutes |
| Search | 20 requests | 1 minute |
| Standard | 10 requests | 1 minute |

---

## 🔐 Authentication Endpoints

### POST `/api/auth/complete-login`
Login with email and password

**Request Body:**
```json
{
  "email": "user@university.edu",
  "password": "password123"
}
```

**Response:**
```json
{
  "session": {
    "access_token": "...",
    "refresh_token": "...",
    "user": { "id": "...", "email": "..." }
  }
}
```

### POST `/api/auth/complete-signup`
Create a new account

**Request Body:**
```json
{
  "email": "user@university.edu",
  "password": "password123",
  "fullName": "John Doe",
  "requestedRole": "student"
}
```

---

## 📄 Certificate Endpoints

### GET `/api/certificates/mine`
Get all certificates for authenticated user

**Query Parameters:**
- `status` (optional): `verified`, `pending`, `rejected`

**Response:**
```json
{
  "certificates": [
    {
      "id": "uuid",
      "title": "Web Development Certificate",
      "institution": "Harvard University",
      "date_issued": "2024-01-15",
      "verification_status": "verified"
    }
  ]
}
```

### POST `/api/certificates/verify`
Upload and verify a certificate

**Form Data:**
- `file`: Certificate file (PDF, JPG, PNG)
- `metadata`: JSON metadata

**Response:**
```json
{
  "documentId": "uuid",
  "status": "pending",
  "confidence": 0.85
}
```

### GET `/api/certificates/pending`
Get pending certificates (Faculty/Admin only)

**Response:**
```json
{
  "documents": [
    {
      "id": "uuid",
      "title": "Certificate",
      "student_id": "uuid",
      "verification_status": "pending"
    }
  ]
}
```

---

## 👥 Recruiter Endpoints

### GET `/api/recruiter/search-students`
Search for students with verified credentials

**Query Parameters:**
- `q` (optional): Search query
- `skill` (optional): Filter by skill
- `certification` (optional): Filter by certification
- `institution` (optional): Filter by institution
- `limit` (optional): Results per page (default: 20)
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "data": {
    "students": [
      {
        "id": "uuid",
        "name": "John Doe",
        "email": "john@university.edu",
        "university": "Harvard",
        "skills": ["Python", "React"],
        "certifications": [...],
        "verified_count": 5
      }
    ],
    "pagination": {
      "total": 100,
      "limit": 20,
      "offset": 0,
      "has_more": true
    }
  }
}
```

### GET `/api/recruiter/student/[studentId]`
Get detailed student profile

**Response:**
```json
{
  "profile": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@university.edu",
    "university": "Harvard",
    "major": "Computer Science",
    "graduation_year": 2024
  },
  "certificates": [...],
  "stats": {
    "total": 10,
    "verified": 8,
    "pending": 2
  }
}
```

### POST `/api/recruiter/verify-credential`
Verify a specific credential

**Request Body:**
```json
{
  "credentialId": "uuid"
}
```

**Response:**
```json
{
  "valid": true,
  "credential": {...},
  "verification": {
    "method": "W3C VC",
    "timestamp": "2024-01-15T10:00:00Z",
    "issuer": "did:web:campussync.com"
  }
}
```

---

## 👨‍🏫 Faculty Endpoints

### GET `/api/faculty/dashboard`
Get faculty dashboard data

**Response:**
```json
{
  "stats": {
    "pending_reviews": 15,
    "approved_today": 8,
    "total_reviewed": 150
  },
  "pending_documents": [...]
}
```

### POST `/api/documents/verify`
Approve or reject a document

**Request Body:**
```json
{
  "documentId": "uuid",
  "verificationStatus": "verified",
  "reason": "Approved after manual review"
}
```

---

## 👑 Admin Endpoints

### GET `/api/admin/dashboard`
Get admin dashboard statistics

**Response:**
```json
{
  "stats": {
    "total_users": 1000,
    "total_certificates": 5000,
    "pending_reviews": 50,
    "active_recruiters": 25
  },
  "recent_activity": [...]
}
```

### POST `/api/admin/roles/change`
Change user role

**Request Body:**
```json
{
  "userId": "uuid",
  "newRole": "faculty"
}
```

### GET `/api/admin/analytics`
Get comprehensive analytics

**Response:**
```json
{
  "overview": {...},
  "trends": {...},
  "performance": {...}
}
```

---

## 📊 Analytics Endpoints

### GET `/api/analytics/faculty`
Get verification analytics (Faculty/Admin only)

**Response:**
```json
{
  "overview": {
    "totalCertificates": 1000,
    "autoApproved": 800,
    "pending": 50,
    "verified": 900,
    "rejected": 50
  },
  "confidenceDistribution": {
    "high": 700,
    "medium": 250,
    "low": 50
  },
  "verificationMethods": {
    "qr_verified": 100,
    "logo_match": 200,
    "ai_confidence": 500,
    "manual_review": 200
  }
}
```

---

## 🏥 Health Check Endpoints

### GET `/api/health`
Simple health check

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z"
}
```

### GET `/api/health/detailed`
Detailed system health

**Response:**
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "healthy", "responseTime": 45 },
    "system": { "status": "healthy", "memory_mb": {...} }
  }
}
```

---

## 🔄 Verifiable Credentials

### POST `/api/vc/issue`
Issue a W3C Verifiable Credential

**Request Body:**
```json
{
  "certificateId": "uuid"
}
```

**Response:**
```json
{
  "credential": {
    "@context": [...],
    "type": ["VerifiableCredential"],
    "issuer": "did:web:campussync.com",
    "credentialSubject": {...},
    "proof": {...}
  }
}
```

### POST `/api/vcs/verify`
Verify a VC signature

**Request Body:**
```json
{
  "credential": {...}
}
```

---

## Error Responses

All endpoints return standard error formats:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {...}
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Webhooks

### POST `/api/webhooks/verification`
Verification status updates

**Payload:**
```json
{
  "event": "certificate.verified",
  "data": {
    "certificateId": "uuid",
    "userId": "uuid",
    "status": "verified"
  }
}
```

---

## Best Practices

1. **Always include authentication headers** for protected endpoints
2. **Implement retry logic** with exponential backoff
3. **Cache responses** where appropriate
4. **Handle rate limits** gracefully
5. **Validate input** on client side before sending

---

**Last Updated**: October 31, 2025
**API Version**: 1.0.0
