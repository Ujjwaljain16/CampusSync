# 🎓 CampusSync - Where Credentials Meet Career Opportunities

<div align="center">

![CampusSync Logo](./my-app/public/logo-clean.svg)

**Next-Generation Multi-Tenant SaaS for Seamless Campus Recruitment and Credential Verification**

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-blue)](https://www.postgresql.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20RLS-green)](https://supabase.com/)

</div>

---

## 🚀 Overview
CampusSync is a multi-tenant SaaS platform (under active development; see [Security notes & known limitations](#-security-notes--known-limitations)) designed specifically for universities, educational institutions, and recruiters. It enables streamlined certificate verification and credential management using Gemini Vision based extraction and issues credentials modelled on the W3C Verifiable Credentials data model (JWS-signed). The platform supports multi-organization workflows with dedicated dashboards for recruiters, faculty, and administrative users. Built with modern full-stack technologies, CampusSync prioritizes scalability, security, and performance to meet the evolving needs of academic credential verification and campus placement processes.
### 🎯 Problem Solved

- **Certificate Fraud Prevention**: Faculty-approved certificates are issued as JWS-signed Verifiable Credentials (W3C VC Data Model style)
- **Manual Verification Bottleneck**: Google Gemini Vision extracts certificate fields automatically; faculty review and approve
- **Recruiter Trust Issues**: Rate-limited public endpoints to verify a credential's signature and revocation status
- **Multi-Organization Complexity**: Organization-scoped API queries plus Supabase Row-Level Security (RLS) for multi-tenancy (RLS policies live in your Supabase project; see security notes)


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
│  │ • Session refresh/check  • Role checks in each API route (RBAC) │  │
│  │ • Page route guards      • Org context resolved per API request  │  │
│  │ • SSR Cookie Handling    • /api/* enforces its own authN/authZ   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
┌─────────────────────────────────────┼───────────────────────────────────┐
│                    API LAYER (Next.js 15 App Router)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │ Certificate  │  │  Recruiter   │  │Organization  │  │   Admin     ││
│  │   Routes     │  │   Routes     │  │   Routes     │  │   Routes    ││
│  │ (~12 routes) │  │ (~16 routes) │  │ (~12 routes) │  │ (~35 routes)││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘│
└─────────┼──────────────────┼──────────────────┼──────────────────┼──────┘
          │                  │                  │                  │
          └──────────────────┴──────────────────┴──────────────────┘
                                      │
┌─────────────────────────────────────┼───────────────────────────────────┐
│                    BUSINESS LOGIC LAYER (TypeScript)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │  OCR Engine  │  │ VC Issuer    │  │Multi-Org Mgr │  │ RLS Manager ││
│  │   (Gemini    │  │ (JWS via     │  │  (Org Access │  │  (Policy    ││
│  │   Vision)    │  │    JOSE)     │  │   Control)   │  │  Validator) ││
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
│  │ Schema/RLS/index SQL is not included in this repository          │ │
│  │ (see Security notes); figures in older docs are unverified       │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────-─┘
                                      │
┌─────────────────────────────────────┼───────────────────────────────────┐
│                      EXTERNAL SERVICES LAYER                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │Google Gemini │  │ SMTP (email) │  │Supabase Auth │  │   Storage   ││
│  │ Vision (OCR) │  │ (nodemailer) │  │   (JWT)      │  │  (S3-like)  ││
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
## Demo :

<img width="1920" height="1080" alt="Screenshot 2025-11-08 020659" src="https://github.com/user-attachments/assets/2215fee3-3ac0-4c8f-b8eb-ff49635fce14" />
<img width="1920" height="1080" alt="Screenshot 2025-11-08 020728" src="https://github.com/user-attachments/assets/68fe9b65-0400-404e-a4b6-76833c241d39" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/365776ff-9902-4b67-b613-b35819277e85" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/7165c7d0-a63c-4544-90f4-428abee3f0e6" />
<img width="1920" height="1080" alt="Screenshot 2025-11-08 021252" src="https://github.com/user-attachments/assets/e6934b5d-c6b8-408a-9711-b36e68709600" />
<img width="1436" height="98" alt="Screenshot 2025-11-08 021437" src="https://github.com/user-attachments/assets/0156943f-6e78-4a4d-ad3d-3eebbd52e15b" />
<img width="1920" height="1080" alt="Screenshot 2025-11-08 021400" src="https://github.com/user-attachments/assets/81c5f47c-ac9a-47d5-9e0a-b8eadf2234e0" />
<img width="1920" height="1080" alt="Screenshot 2025-11-08 023426" src="https://github.com/user-attachments/assets/6bd9b53e-c107-4662-9aaf-d38b8c3c02a7" />
<img width="1920" height="1080" alt="Screenshot 2025-11-08 021635" src="https://github.com/user-attachments/assets/c955233f-8da1-4a2f-b59a-cc332dfc0942" />
<img width="1920" height="1080" alt="Screenshot 2025-11-08 021615" src="https://github.com/user-attachments/assets/20e8ffda-c656-41ed-96c2-170131375313" />
<img width="1920" height="1080" alt="Screenshot 2025-11-08 021654" src="https://github.com/user-attachments/assets/d7a95f63-d3e6-47b3-a3fb-5a9254614513" />
<img width="1920" height="1080" alt="Screenshot 2025-11-08 022348" src="https://github.com/user-attachments/assets/1e5defe6-8002-48c1-82e4-de5cf8392d7e" />
<img width="1920" height="1080" alt="Screenshot 2025-11-08 023613" src="https://github.com/user-attachments/assets/2eaeb796-fc84-43b7-9b05-c506ad408e75" />

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
- **API**: Next.js 15 API Routes (~90 route handlers)
- **Authentication**: Supabase Auth + JWT (session cookies; Google OAuth implemented)
- **Database**: PostgreSQL 16 via Supabase (ACID, JSONB support)
- **Security**: Supabase Row-Level Security (policies managed in Supabase, not versioned in this repo)
- **ORM**: Supabase Client (Type-safe queries, real-time subscriptions)

### **AI & OCR**
- **AI Model**: Google Gemini Vision (`gemini-2.0-flash-exp` by default, configurable via `GEMINI_MODEL`) for certificate field extraction
- **OCR Engine**: Gemini Vision only. Tesseract.js is **not** used by the current code
- **Image Processing**: Sharp (used by `next/image`)

### **Cryptography & Security**
- **VC Signing**: JWS via the JOSE library; the algorithm is set by the `alg` of the `VC_ISSUER_JWK` key you provide (RS256/RSA-2048 in the key tooling), not Ed25519
- **JWT**: JOSE Library (RFC 7519)
- **Webhooks**: HMAC-SHA256 signature verification (`WEBHOOK_SECRET`)
- **Key Management**: The issuer key is supplied through the `VC_ISSUER_JWK` environment variable; rotation is manual

### **Storage & CDN**
- **File Storage**: Supabase Storage (S3-compatible, CDN-backed)
- **Image Optimization**: Next.js Image (Automatic WebP/AVIF, Lazy loading)
- **PDF Generation**: jsPDF, PDF-lib (Dynamic certificate generation)

  
## 🧬 Notable Innovations

* 🔄 **Centralized Middleware** for page-route authentication and routing; API routes use shared `withAuth`/`withRole` wrappers.
* 🧩 **Modular, Extensible Architecture** for smooth feature addition.

  
---

## ✨ Key Features

### 🔐 **Multi-Organization Management**
- **Data Isolation**: `organization_id` filtering in API queries, backed by RLS in Supabase (verify your policies; see security notes)
- **Org Admin Controls**: Primary admin designation, role delegation, member management
- **Recruiter Access Model**: Cross-org recruitment with granular permissions via `recruiter_org_access` table

### 🧠 **AI-Powered Certificate Verification**
- **Gemini Vision Extraction**: Uploaded certificate images/PDFs are sent to Google Gemini, which returns title, institution, recipient, date and description. Extraction is not guaranteed accurate; a faculty member reviews every certificate
- **Note**: An earlier Tesseract.js pipeline is not part of the current code

### 🎓 **W3C Verifiable Credentials (VC)**
- **W3C VC-style**: Credentials follow the W3C VC Data Model 1.0 shape with a JWS proof; full conformance (JSON-LD proofs, DID resolution) has not been validated
- **JWS Signatures**: Signed with the issuer key from `VC_ISSUER_JWK` (RS256 by default); credentials are issued only for faculty-verified certificates
- **Revocation Support**: Revocation status is stored in the database and checked on verification
- **Public Verification API**: Rate-limited endpoints that verify a credential's signature and revocation status

### 💼 **Recruiter Portal**
- **Verified Talent Pool**: Browse students with cryptographically verified credentials
- **Search**: Filter students by institution, skills and verification status
- **Multi-Org Recruitment**: Access to multiple organization talent pools (permission-based, via `recruiter_org_access`)
- **Real-time**: Supabase realtime is used for approval-status updates on the faculty waiting page only

### 🛡️ **Enterprise Security**
- **Authentication**: Supabase Auth with JWT; email/password and Google OAuth
- **Authorization**: RBAC with 6 roles (super_admin, org_admin, admin, faculty, student, recruiter), enforced per API route
- **Row-Level Security**: Relies on Supabase RLS; the policy SQL is not in this repository
- **Middleware Protection**: Page-route guards and session refresh. `/api/*` is excluded from the middleware matcher and each route performs its own checks
- **Rate limiting**: In-memory, per-instance limiter on public/expensive endpoints (best effort on serverless)
- **Audit Logging**: Actions are written to `audit_logs`

### ⚡ **Performance Optimizations**
- **API Efficiency**: Server-side rendering where applicable
- **Image Optimization**: Next.js Image component, Sharp, WebP/AVIF formats

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
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server only, bypasses RLS

# Google Gemini (required for certificate extraction)
GEMINI_API_KEY=your-gemini-api-key

# Verifiable Credential issuer key (single-line JSON JWK; generate a fresh one per environment)
VC_ISSUER_JWK={...}
NEXT_PUBLIC_ISSUER_DID=did:web:your-domain.example

# Application
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```
A complete, commented template is in [`my-app/.env.example`](./my-app/.env.example). Never commit `.env.local`.

The database schema, RLS policies and storage buckets must be created in your own Supabase project; the SQL is **not** included in this repository. Create the first super admin with `node scripts/setup-superadmin.mjs`.

### **4. Start Development Server**
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)
---

## 🔐 Security Notes & Known Limitations

- **Treat early-history credentials as compromised.** Commits early in this repository's history (notably around `2e9bc97`) contained real credentials (a Gemini API key, the Supabase service-role key and the Verifiable Credential issuer private key). History was not rewritten, so anyone with a clone can read them. Rotate every credential ever used with this project (Supabase service-role/anon keys and JWT secret, Gemini API key, VC issuer key, SMTP password, webhook secret) and generate a new VC issuer key. Credentials signed with the old issuer key should be considered untrustworthy.
- **Secrets**: only `my-app/.env.example` (placeholders) is committed; `.env*` files are git-ignored. `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and must stay server-side.
- **RLS is not verifiable from this repo.** Schema, RLS policies and indexes are not versioned here, so figures quoted in older documents (for example "83 policies") are unverified. Review your Supabase policies independently. API routes also filter by organization and role as a second layer but should not be your only control.
- **Middleware does not cover `/api/*`.** Every API route performs its own authentication/authorization (`withAuth` / `withRole`); new routes must do the same.
- **Rate limiting is in-memory and per instance.** It slows abuse on public, email and OCR endpoints but is not a distributed limit; use an edge/WAF or Redis-backed limiter for real protection.
- **Diagnostic routes** (`/api/test-email`, `/api/debug/domains`, `/api/health/detailed`, `/test-email`) are disabled in production and require admin auth otherwise. `/api/auth/dev-upsert-user` only works in development. Consider deleting them before deploying.
- **AI extraction is advisory.** Gemini output can be wrong and certificates must be reviewed by faculty. Uploaded documents are sent to Google's Gemini API.
- **Verifiable Credentials**: signing uses JWS via JOSE with the configured issuer key. JSON-LD proof suites, DID document publishing and third-party conformance are not implemented or validated.
- **Uploaded files** are stored in the `certificates` Supabase Storage bucket and referenced by public URL; make sure the bucket policy matches your privacy requirements.
- **Dependencies**: run `npm audit` regularly.

---

## 🔮 Future Roadmap

### 1️⃣
- Blockchain Integration (Ethereum/Polygon for immutable credential storage)
- Advanced Analytics Dashboard (Grafana-style visualizations)
- Email Automation (partially implemented: approval/rejection notifications via SMTP)

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

