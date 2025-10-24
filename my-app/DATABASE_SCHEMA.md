# CampusSync Database Schema Documentation

## 📋 Table Overview

### 1. **user_roles** Table
**Purpose**: Manages user roles and permissions
```sql
Columns:
- id (UUID, Primary Key)
- user_id (UUID, Foreign Key → profiles.id)
- role (TEXT) - Values: 'admin', 'recruiter', 'student', 'faculty'
- assigned_by (UUID, Foreign Key → profiles.id)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### 2. **profiles** Table
**Purpose**: Stores user profile information
```sql
Columns:
- id (UUID, Primary Key) - Matches user_roles.user_id
- role (TEXT) - User's role
- full_name (TEXT) - User's display name
- created_at (TIMESTAMP)
```

### 3. **certificates** Table
**Purpose**: Stores certificate information and verification data
```sql
Columns:
- id (UUID, Primary Key)
- student_id (UUID, Foreign Key → profiles.id) - Certificate owner
- user_id (UUID, Foreign Key → profiles.id) - Certificate owner (duplicate)
- title (TEXT) - Certificate title
- institution (TEXT) - Issuing institution
- date_issued (TIMESTAMP) - Issue date
- description (TEXT) - Certificate description
- file_url (TEXT) - URL to certificate file
- verification_status (TEXT) - Values: 'verified', 'rejected', 'pending'
- confidence_score (FLOAT) - AI confidence (0-1)
- verification_method (TEXT) - How it was verified
- auto_approved (BOOLEAN) - Whether auto-approved
- issuer_verified (BOOLEAN) - Whether issuer is verified
- faculty_id (UUID, Foreign Key → profiles.id) - Reviewing faculty
- status (TEXT) - Processing status
- ocr_text (TEXT) - Extracted OCR text
- fields (JSONB) - Extracted fields
- qr_code_data (TEXT) - QR code information
- digital_signature (TEXT) - Digital signature
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### 4. **audit_logs** Table
**Purpose**: Tracks all system actions and changes
```sql
Columns:
- id (BIGINT, Primary Key)
- actor_id (UUID, Foreign Key → profiles.id) - Who performed action
- user_id (UUID, Foreign Key → profiles.id) - User context
- action (TEXT) - Action performed
- target_id (UUID, Foreign Key → certificates.id) - What was affected
- details (JSONB) - Additional action details
- created_at (TIMESTAMP)
```

### 5. **verifiable_credentials** Table
**Purpose**: Stores issued verifiable credentials
```sql
Columns: (Currently empty - no sample data)
```

## 🔗 Relationships

### Primary Relationships:
1. **user_roles.user_id** → **profiles.id** (1:1)
2. **certificates.student_id** → **profiles.id** (N:1)
3. **certificates.user_id** → **profiles.id** (N:1) - Duplicate of above
4. **certificates.faculty_id** → **profiles.id** (N:1)
5. **audit_logs.actor_id** → **profiles.id** (N:1)
6. **audit_logs.user_id** → **profiles.id** (N:1)
7. **audit_logs.target_id** → **certificates.id** (N:1)

### Key Insights:
- **Dual ownership**: Certificates have both `student_id` and `user_id` (same value)
- **Role-based access**: All users have roles in `user_roles` table
- **Minimal profiles**: Only `id`, `role`, `full_name`, `created_at`
- **Rich certificates**: Extensive metadata for verification
- **Comprehensive audit**: All actions tracked in `audit_logs`

## 📊 Current Data State:
- **4 users**: 1 admin, 1 recruiter, 1 student, 1 faculty
- **3 certificates**: 2 admin-owned, 1 student-owned
- **3 audit logs**: Tracking approval/rejection actions
- **0 verifiable credentials**: Not yet implemented

## 🎯 API Implications:
- **Recruiter APIs**: Should query `certificates` by `student_id` and join with `profiles`
- **Faculty APIs**: Should query `certificates` and join with `profiles` for student info
- **Student APIs**: Should query `certificates` where `student_id` = user.id
- **Admin APIs**: Can access all data across all tables
