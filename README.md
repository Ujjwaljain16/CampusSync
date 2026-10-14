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
│  │ (13 routes)  │  │ (16 routes)  │  │ (13 routes)  │  │ (16 routes) ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘│
└─────────┼──────────────────┼──────────────────┼──────────────────┼──────┘
          │                  │                  │                  │
          └──────────────────┴──────────────────┴──────────────────┘
                                      │
┌─────────────────────────────────────┼───────────────────────────────────┐
│                    BUSINESS LOGIC LAYER (TypeScript)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │  Gemini OCR  │  │ VC signing   │  │Org/role ctx  │  │ Rate limiter││
│  │   Vision)    │  │ (JWS via     │  │  resolution) │  │ (in-memory) ││
│  │              │  │    JOSE)     │  │              │  │             ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘│
└─────────┼──────────────────┼──────────────────┼──────────────────┼──────┘
          │                  │                  │                  │
          └──────────────────┴──────────────────┴──────────────────┘
                                      │
┌─────────────────────────────────────┼───────────────────────────────────┐
│                   DATABASE LAYER (PostgreSQL + Supabase)                │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │  ROW-LEVEL SECURITY (RLS) POLICIES                                 ││
│  │  Enabled on certificates, profiles, role_requests, user_roles,   ││
│  │  verifiable_credentials (policies live in Supabase, see notes)   ││
│  └────────────────────────────────────────────────────────────────────┘│
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │ certificates │  │  profiles    │  │organizations │  │ user_roles  ││
│  │              │  │              │  │              │  │             ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘│
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │recruiter_org │  │ verifiable_  │  │ role_requests│  │super_admin  ││
│  │   _access    │  │ credentials  │  │              │  │   _audit    ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘│
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ Original schema/RLS SQL is not in this repository; only draft    │ │
│  │ migrations are in my-app/supabase/migrations (review first)      │ │
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
- [Architecture](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/ARCHITECTURE.md) — code-derived overview: directory map, request flow, auth model, certificate/credential lifecycle, tables, env vars, limitations
- [Security policy](./SECURITY.md) — reporting, key rotation and the credential-exposure notice

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
- **Framework**: Next.js 15.5 (App Router, Server Components; mutations go through API route handlers)
- **UI Library**: React 19.1
- **Styling**: Tailwind CSS 4
- **Components**: Radix UI (accessible primitives)
- **Type Safety**: TypeScript 5

### **Backend**
- **Runtime**: Node.js >= 20.9 (CI uses the version in `my-app/.nvmrc`)
- **API**: Next.js 15 route handlers (100 route files, about 138 HTTP handlers)
- **Authentication**: Supabase Auth + JWT (session cookies; Google OAuth implemented)
- **Database**: PostgreSQL via Supabase
- **Security**: Supabase Row-Level Security (policies managed in Supabase, not versioned in this repo)
- **Data access**: `@supabase/supabase-js` client (no ORM)

### **AI & OCR**
- **AI Model**: Google Gemini Vision (model configurable via `GEMINI_MODEL`, default `gemini-2.0-flash`) for certificate field extraction
- **OCR Engine**: Gemini Vision only. Tesseract.js is **not** used by the current code
- **Image Processing**: Sharp (used by `next/image`)

### **Cryptography & Security**
- **VC Signing**: JWS via the JOSE library; the algorithm is set by the `alg` of the `VC_ISSUER_JWK` key you provide (RS256/RSA-2048 in the key tooling), not Ed25519
- **Key Management**: The issuer key is supplied through the `VC_ISSUER_JWK` environment variable; rotation is manual

### **Storage & CDN**
- **File Storage**: Supabase Storage
- **Image Optimization**: Next.js Image
- **PDF Generation**: jsPDF, PDF-lib

  
## 🧬 Notable Innovations

* 🔄 **Middleware** for page-route authentication and routing; API routes use shared `withAuth`/`withRole` wrappers (not every route does; see `my-app/tests/security/route-inventory.test.ts`).

  
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
- **Real-time**: Supabase realtime is used for approval-status updates on the waiting pages (`/waiting`, `/faculty/waiting`, `/recruiter/waiting`) and in the faculty approval manager component

### 🛡️ **Enterprise Security**
- **Authentication**: Supabase Auth with JWT; email/password and Google OAuth
- **Authorization**: RBAC with 6 roles (super_admin, org_admin, admin, faculty, student, recruiter), enforced per API route; role checks are global and organization scoping is a separate per-route step
- **Row-Level Security**: Relies on Supabase RLS; the policy SQL is not in this repository
- **Middleware Protection**: Page-route guards and session refresh. `/api/*` is excluded from the middleware matcher and each route performs its own checks
- **Rate limiting**: In-memory, per-instance limiter on public/expensive endpoints (best effort on serverless)
- **Audit Logging**: Actions are written to `audit_logs`

---
## 🚀 Getting Started

### **Prerequisites**
```bash
Node.js >= 20.9 (22 recommended; see my-app/.nvmrc)
npm >= 10.x
A Supabase project (Postgres, Auth, Storage)
```

### **1. Clone Repository**
```bash
git clone https://github.com/ujjwaljain16/campusSync.git
cd campusSync/my-app
```

### **2. Install Dependencies**
```bash
npm ci
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

The database schema, RLS policies and storage buckets must be created in your own Supabase project; the SQL is **not** included in this repository. Create the first super admin with `node --env-file=.env.local scripts/setup-superadmin.mjs` (see `my-app/scripts/README.md`).

### **4. Start Development Server**
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

### **5. Checks**
```bash
npm run typecheck   # tsc --noEmit
npm run lint
npm test            # vitest, all tests under tests/
npm run test:coverage
```
These run in CI (`.github/workflows/ci.yml`) together with `npm audit`, gitleaks secret scanning and CodeQL.

---

## 🔐 Security Notes & Known Limitations

_Summary of known limitations: in-memory rate limiting, schema/RLS SQL not in the repo, no monitoring, global role checks, public storage bucket._

- **Treat early-history credentials as compromised.** Commits early in this repository's history (notably around `2e9bc97`) contained real credentials (a Gemini API key, the Supabase service-role key and the Verifiable Credential issuer private key). History was not rewritten, so anyone with a clone can read them. Rotate every credential ever used with this project (Supabase service-role/anon keys and JWT secret, Gemini API key, VC issuer key, SMTP password, webhook secret) and generate a new VC issuer key. Credentials signed with the old issuer key should be considered untrustworthy.
- **Secrets**: only `my-app/.env.example` (placeholders) is committed; `.env*` files are git-ignored. `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and must stay server-side.
- **RLS is not verifiable from this repo.** Schema, RLS policies and indexes are not versioned here, so figures quoted in older documents (for example "83 policies") are unverified. Review your Supabase policies independently. API routes also filter by organization and role as a second layer but should not be your only control.
- **Middleware does not cover `/api/*`.** Every API route performs its own authentication/authorization (`withAuth` / `withRole`); new routes must do the same.
- **Rate limiting is in-memory and per instance.** It slows abuse on public, email and OCR endpoints but is not a distributed limit; use an edge/WAF or Redis-backed limiter for real protection.
- **Diagnostic routes** (`/api/test-email`, `/api/debug/domains`, `/api/health/detailed`, `/test-email`) are disabled in production or require admin auth. `/api/auth/dev-upsert-user` only works in development. `/api/diagnose` and `/api/auth/check-env` are unauthenticated and report configuration booleans; consider deleting all of these before deploying.
- **AI extraction is advisory.** Gemini output can be wrong and certificates must be reviewed by faculty. Uploaded documents are sent to Google's Gemini API.
- **Verifiable Credentials**: signing uses JWS via JOSE with the configured issuer key. JSON-LD proof suites, DID document publishing and third-party conformance are not implemented or validated.
- **Uploaded files** are stored in the `certificates` Supabase Storage bucket and referenced by public URL. In production this bucket is currently **public**: anyone with a file URL can read it. A private-bucket plan is drafted in `my-app/supabase/migrations/20261014_core_storage_policies_note.sql`.
- **Dependencies**: `npm audit` runs in CI and Dependabot opens weekly update PRs.
- **No monitoring or alerting.** Errors go to the console/host logs; the in-memory error monitor has no external sink.
- **Database hardening is in draft.** `my-app/supabase/migrations/` contains draft migrations derived from the production database as observed on 2026-10-14. They are not applied automatically; review them against the live schema first.
- **`revocation_list` does not exist** in production; credential revocation is stored on `verifiable_credentials`.
- **Session cookies are not HttpOnly** (`@supabase/ssr` browser client).
- See also [SECURITY.md](./SECURITY.md) for reporting and key rotation.

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

