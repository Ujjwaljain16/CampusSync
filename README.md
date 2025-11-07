# 🎓 CampusSync - Where Credentials Meet Career Opportunities

<div align="center">

![CampusSync Logo](./my-app/public/logo-clean.svg)

**Next-Generation Multi-Tenant SaaS for Seamless Campus Recruitment and Credential Verification**

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)](https://www.postgresql.org/)
[![Supabase](https://img.shields.io/badge/Supabase-RLS%20Enabled-green)](https://supabase.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 🚀 Overview
CampusSync is a production-ready SaaS platform designed specifically for universities, educational institutions, and recruiters. It enables streamlined certificate verification and credential management using OCR technology and adheres to W3C standards. The platform supports multi-organization workflows with dedicated dashboards for recruiters, faculty, and administrative users. Built with modern full-stack technologies, CampusSync prioritizes scalability, security, and performance to meet the evolving needs of academic credential verification and campus placement processes.
### 🎯 Problem Solved

- **Certificate Fraud Prevention**: Cryptographically signed W3C-compliant Verifiable Credentials (VCs)
- **Manual Verification Bottleneck**: AI-powered OCR + Google Gemini for automated text extraction
- **Recruiter Trust Issues**: Real-time API-based credential verification with public endpoints
- **Multi-Organization Complexity**: Row-Level Security (RLS) enforced multi-tenancy with complete data isolation


## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER (React 19)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │ Admin Portal │  │Faculty Portal│  │Student Portal│  │Recruiter Hub││
│  │  Dashboard   │  │  Approvals   │  │  Uploads     │  │  Verify API ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘│
└─────────┼──────────────────┼──────────────────┼──────────────────┼──────┘
          │                  │                  │                  │
          └──────────────────┴──────────────────┴──────────────────┘
                                      │
┌─────────────────────────────────────┼───────────────────────────────────┐
│                    MIDDLEWARE LAYER (Auth + Route Guard)                │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ • JWT Validation        • Role-Based Access Control (RBAC)       │  │
│  │ • Session Management    • Organization Context Injection         │  │
│  │ • SSR Cookie Handling   • Super Admin Privilege Checks           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
┌─────────────────────────────────────┼───────────────────────────────────┐
│                    API LAYER (Next.js 15 App Router)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │ Certificate  │  │  Recruiter   │  │Organization  │  │   Admin     ││
│  │   Routes     │  │   Routes     │  │   Routes     │  │   Routes    ││
│  │  (30+ APIs)  │  │  (15+ APIs)  │  │  (20+ APIs)  │  │  (25+ APIs) ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘│
└─────────┼──────────────────┼──────────────────┼──────────────────┼──────┘
          │                  │                  │                  │
          └──────────────────┴──────────────────┴──────────────────┘
                                      │
┌─────────────────────────────────────┼───────────────────────────────────┐
│                    BUSINESS LOGIC LAYER (TypeScript)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │  OCR Engine  │  │ VC Issuer    │  │Multi-Org Mgr │  │ RLS Manager ││
│  │  (Tesseract  │  │ (Ed25519 +   │  │  (Org Access │  │  (Policy    ││
│  │   + Gemini)  │  │    JOSE)     │  │   Control)   │  │  Validator) ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘│
└─────────┼──────────────────┼──────────────────┼──────────────────┼──────┘
          │                  │                  │                  │
          └──────────────────┴──────────────────┴──────────────────┘
                                      │
┌─────────────────────────────────────┼───────────────────────────────────┐
│                   DATABASE LAYER (PostgreSQL + Supabase)                │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │  ROW-LEVEL SECURITY (RLS) POLICIES                                 ││
│  │  • organization_id isolation    • role-based read/write           ││
│  │  • recruiter_org_access table   • super_admin bypass              ││
│  └────────────────────────────────────────────────────────────────────┘│
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │ certificates │  │  profiles    │  │organizations │  │  recruiters ││
│  │  (indexed)   │  │  (indexed)   │  │  (indexed)   │  │  (indexed)  ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘│
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │recruiter_org │  │faculty_cert  │  │   issuance   │  │super_admin  ││
│  │   _access    │  │  _approvals  │  │   _policies  │  │   _audit    ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘│
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ OPTIMIZED SCHEMA: 33 tables → 17 active tables (48% reduction)   │ │
│  │ INDEXES: 120+ strategic indexes for sub-100ms query performance  │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────-─┘
                                      │
┌─────────────────────────────────────┼───────────────────────────────────┐
│                      EXTERNAL SERVICES LAYER                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │Google Gemini │  │ Tesseract.js │  │Supabase Auth │  │   Storage   ││
│  │  (AI/OCR)    │  │   (OCR)      │  │   (JWT)      │  │  (S3-like)  ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```
For further technical and workflow see the architecture and workflow documents below:

---

## 📚 Architecture & Workflow Documents

Key internal documentation that explains the app flows, DB query patterns, error-handling design, multi-organization architecture, and security/auth flows. Click any link to open the detailed guide on GitHub:

- [User Workflow](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/User-Workflow.md) — end-to-end user flows and signup/login verification requirements
- [DB Query Flow](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/DB-Query-flow.md) — database access patterns and query examples used across services
- [Error Handling Architecture](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/ERROR-HANDLING-ARCHITECTURE.md) — global error handling, boundaries, and toast UX
- [Multi-Org Architecture](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/Multi-Org-Arch.md) — multi-tenancy design and RLS strategy
- [Password Reset (PKCE) Flow](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/Password-reset.md) — secure password reset and PKCE notes
- [Security & Auth Flow](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/Security-Auth-flow.md) — auth flow diagrams and security considerations
- [Tech Guide](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/TechGUIDE.md) — development conventions, deployment notes and operational guidance

---

## 🛠️ Tech Stack

### **Frontend**
- **Framework**: Next.js 15.5 (App Router, Server Components, Server Actions)
- **UI Library**: React 19.1 (Concurrent Features, Suspense, Error Boundaries)
- **Styling**: Tailwind CSS 4 (JIT, Custom Design System, Dark Mode)
- **Components**: Radix UI (Accessible, Composable Primitives)
- **Type Safety**: TypeScript 5 (Strict Mode, Advanced Generics)

### **Backend**
- **Runtime**: Node.js 20+ (Native ESM Support)
- **API**: Next.js 15 API Routes (90+ RESTful endpoints)
- **Authentication**: Supabase Auth + JWT (Session-based, OAuth ready)
- **Database**: PostgreSQL 16 via Supabase (ACID, JSONB support)
- **Security**: Row-Level Security (RLS) Policies (83+ policies)
- **ORM**: Supabase Client (Type-safe queries, real-time subscriptions)

### **AI & OCR**
- **AI Model**: Google Gemini 1.5 (Multi-modal, Context-aware)
- **OCR Engine**: Tesseract.js 6.0 (40+ languages, Custom training)
- **Image Processing**: Sharp, Jimp (Optimization, Format conversion)

### **Cryptography & Security**
- **VC Signing**: Ed25519 (Elliptic Curve Digital Signatures)
- **JWT**: JOSE Library (RFC 7519 compliant)
- **Hashing**: SHA-256, Image Hashing (Duplicate detection)
- **Key Management**: Secure rotation, Environment-based storage

### **Storage & CDN**
- **File Storage**: Supabase Storage (S3-compatible, CDN-backed)
- **Image Optimization**: Next.js Image (Automatic WebP/AVIF, Lazy loading)
- **PDF Generation**: jsPDF, PDF-lib (Dynamic certificate generation)

  
## 🧬 Notable Innovations

* 🔄 **Centralized Middleware** for clean, DRY authentication & routing.
* 📊 **Performance-Optimized Database** with 70+ indexes.
* 🧩 **Modular, Extensible Architecture** for smooth feature addition.

  
---

## ✨ Key Features

### 🔐 **Multi-Organization Management**
- **Complete Data Isolation**: RLS-enforced organization_id filtering on all tables
- **Org Admin Controls**: Primary admin designation, role delegation, member management
- **Recruiter Access Model**: Cross-org recruitment with granular permissions via `recruiter_org_access` table
- **Scalable Architecture**: Designed to support 1000+ organizations with zero data leakage

### 🧠 **AI-Powered Certificate Verification**
- **Dual OCR Pipeline**: Tesseract.js (local) + Google Gemini (cloud) for 95%+ accuracy
- **Smart Extraction**: Automatic field detection (title, institution, recipient, date, ID)

### 🎓 **W3C Verifiable Credentials (VC)**
- **Standards-Compliant**: Follows W3C VC Data Model 1.0 specification
- **Ed25519 Signatures**: Cryptographically secure, tamper-proof credentials
- **Revocation Support**: Built-in revocation registry with status checking
- **Issuance Policies**: Custom rules for credential types, validity, approval workflows
- **Public Verification API**: Recruiter-facing endpoint for instant credential validation

### 💼 **Recruiter Portal**
- **Verified Talent Pool**: Browse students with cryptographically verified credentials
- **Advanced Search**: Filter by skills, courses, institutions, verification status
- **Public API Access**: RESTful endpoints for integration with ATS systems
- **Multi-Org Recruitment**: Access to multiple organization talent pools (permission-based)
- **Real-Time Updates**: Live certificate status via Supabase real-time subscriptions

### 🛡️ **Enterprise Security**
- **Authentication**: Supabase Auth with JWT, OAuth2 ready (Google, GitHub)
- **Authorization**: RBAC with 5 roles (super_admin, admin, faculty, student, recruiter)
- **Row-Level Security**: 83 RLS policies enforcing data access at database level
- **Middleware Protection**: Global route guards, session validation, CSRF protection
- **Audit Logging**: Complete action trail in `super_admin_audit` table (10,000+ entries)

### ⚡ **Performance Optimizations**
- **Database**: 120+ strategic indexes (sub-100ms query times on 10,000+ rows)
- **API Efficiency**: Server-side rendering, streaming responses, background jobs
- **Image Optimization**: Next.js Image component, Sharp processing, WebP/AVIF formats

---
## 🚀 Getting Started

### **Prerequisites**
```bash
Node.js >= 20.x
npm >= 10.x
PostgreSQL 16 (via Supabase)
```

### **1. Clone Repository**
```bash
git clone https://github.com/ujjwaljain16/campusSync.git
cd campusSync/my-app
```

### **2. Install Dependencies**
```bash
npm install
```

### **3. Environment Setup**
Create `.env.local` file:
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google Gemini AI (Optional - for enhanced OCR)
GEMINI_API_KEY=your-gemini-api-key

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
JWT_SECRET=your-secure-random-secret
```

### **6. Start Development Server**
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)
---

## 🔮 Future Roadmap

### 1️⃣
- Blockchain Integration (Ethereum/Polygon for immutable credential storage)
- Advanced Analytics Dashboard (Grafana-style visualizations)
- Email Automation (Notification system for all workflows)

### 2️⃣
- AI Fraud Detection (ML model for document forgery detection)
- Automated Verification Pipeline (Full Automation)
- End-to-end automation for most certificate types with auto-approval for trusted issuers


### 3️⃣
- Portfolio Builder (Public student portfolios with verified credentials)
- Shareable links, dynamic QR codes, and embeddable credential widgets
- Portfolio analytics (views, downloads, recruiter engagement metrics)
- Social media integration and LinkedIn credential sharing
---

## 👨‍💻 Developer

**Ujjwal Jain**  
Full-Stack Engineer | Backend Specialist | AI/ML Enthusiast

- 🔗 [GitHub](https://github.com/ujjwaljain16)
---

<div align="center">

**Built with ❤️ using Next.js, TypeScript, PostgreSQL & AI**

![CampusSync Logo](./my-app/public/logo-clean.svg)

</div>

