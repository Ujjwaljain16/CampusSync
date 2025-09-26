# Role Change Data Management Guide

## Overview
This document outlines what happens to user data when roles are changed in the CampusSync system.

## Data Categories

### 1. **Permanent Data (Never Changes)**
These data types remain with the user regardless of role changes:

- **Profile Information** (`profiles` table)
  - `full_name`, `university`, `graduation_year`, `major`, `location`, `gpa`
  - **Reason**: Personal information belongs to the individual

- **Certificates** (`certificates` table)
  - All uploaded certificates and their metadata
  - **Reason**: Certificates are personal achievements

- **Verifiable Credentials** (`verifiable_credentials` table)
  - Digital credentials issued to the user
  - **Reason**: VCs are tied to the individual's identity

- **Audit Logs** (`audit_logs` table)
  - Historical actions performed by the user
  - **Reason**: Audit trails must remain immutable

- **Authentication Data** (`auth.users`)
  - Email, password, OAuth connections
  - **Reason**: Authentication is tied to the individual

### 2. **Access Control Data (Changes Immediately)**
These are controlled by RLS policies and change instantly:

- **API Access Permissions**
  - What endpoints the user can access
  - **Behavior**: Changes immediately based on new role

- **Database Row Access**
  - What rows in tables the user can see/modify
  - **Behavior**: RLS policies enforce new role permissions

- **Dashboard Redirects**
  - Where the user is redirected after login
  - **Behavior**: Changes immediately based on new role

### 3. **Role-Specific Data (Handled on Change)**
These require special handling during role transitions:

#### **Faculty → Student**
- **Approval History**: Remains in audit logs (historical record)
- **Pending Approvals**: Transferred to other faculty or admin
- **Faculty Dashboard Access**: Revoked immediately

#### **Recruiter → Student**
- **Student Search Access**: Revoked immediately
- **Bulk Verification Access**: Revoked immediately
- **Cached Student Data**: Cleared (handled by RLS)

#### **Admin → Any Role**
- **System Management Access**: Revoked immediately
- **User Management Access**: Revoked immediately
- **Admin Dashboard Access**: Revoked immediately
- **Safety Check**: At least one admin must remain

#### **Any Role → Admin**
- **Full System Access**: Granted immediately
- **All Data Access**: Granted immediately
- **Admin Privileges**: Granted immediately

## Data Security Considerations

### 1. **Immediate Access Revocation**
- RLS policies ensure immediate permission changes
- No cached access remains after role change
- Session tokens may need refresh

### 2. **Audit Trail Preservation**
- All role changes are logged with:
  - Old role and new role
  - Who made the change
  - Reason for change
  - Timestamp

### 3. **Data Integrity**
- User data remains consistent
- No data loss during role changes
- Historical records preserved

## Role Change Scenarios

### **Scenario 1: Student → Faculty**
```
Before: Can upload certificates, view own profile
After: Can approve certificates, view all student data
Data Impact: None - all personal data preserved
```

### **Scenario 2: Faculty → Student**
```
Before: Can approve certificates, view student data
After: Can upload certificates, view own profile
Data Impact: None - all personal data preserved
```

### **Scenario 3: Recruiter → Student**
```
Before: Can search students, verify credentials
After: Can upload certificates, view own profile
Data Impact: None - all personal data preserved
```

### **Scenario 4: Admin → Faculty**
```
Before: Full system access
After: Faculty-level access only
Data Impact: None - all personal data preserved
Security: At least one admin must remain
```

## Implementation Details

### **Role Change API**
- Endpoint: `POST /api/admin/roles/change`
- Handles data transitions
- Logs all changes
- Enforces security rules

### **Data Handling Functions**
- `handleRoleSpecificData()`: Pre-change data handling
- `handlePostRoleChange()`: Post-change actions
- Automatic RLS policy enforcement

### **Security Measures**
- Admin self-demotion prevention
- Last admin protection
- Comprehensive audit logging
- Immediate access revocation

## Best Practices

1. **Always log role changes** with reason
2. **Test role changes** in development first
3. **Notify users** of role changes
4. **Monitor audit logs** for suspicious changes
5. **Maintain admin redundancy** (multiple admins)

## Troubleshooting

### **User can't access expected features after role change**
- Check RLS policies are working
- Verify role was updated in database
- Clear user session and re-login

### **Data appears to be missing after role change**
- Data is preserved - check RLS policies
- User may not have permission to see certain data
- Check audit logs for role change confirmation

### **Admin accidentally demoted themselves**
- Use another admin account to restore role
- Check audit logs for the change
- Implement additional safeguards
