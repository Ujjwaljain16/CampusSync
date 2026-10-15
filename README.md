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
CampusSync is a multi-tenant platform for universities and recruiters. Students upload certificates, Gemini Vision extracts the fields, faculty review and approve them, and each approved certificate is issued as a JWS-signed credential modelled on the W3C Verifiable Credentials data model (with a `did:web` issuer and a public key set at `/.well-known/jwks.json`) that anyone can verify. Organizations get their own student, faculty and admin dashboards; recruiters search verified talent in the organizations that granted them access.

**Status:** a working pilot. The authorization model, database schema and performance are documented, tested in CI and benchmarked (see the documents below).

### 🎯 Problem Solved

- **Certificate Fraud Prevention**: Faculty-approved certificates are issued as JWS-signed Verifiable Credentials (W3C VC Data Model style)
- **Manual Verification Bottleneck**: Google Gemini Vision extracts certificate fields automatically; faculty review and approve
- **Recruiter Trust Issues**: Rate-limited public endpoints (and a standalone verifier in [`verifier/`](./verifier)) to check a credential's signature and revocation status
- **Multi-Organization Complexity**: Every API route is scoped to the caller's organization, backed by Supabase Row-Level Security on user-session queries (see [DATABASE-SCHEMA.md](./my-app/docs/DATABASE-SCHEMA.md))


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
│  │ • HttpOnly cookies       • /api/* enforces its own authN/authZ   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
┌─────────────────────────────────────┼───────────────────────────────────┐
│                    API LAYER (Next.js 15 App Router)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │ Certificate  │  │  Recruiter   │  │Organization  │  │   Admin     ││
│  │   Routes     │  │   Routes     │  │   Routes     │  │   Routes    ││
│  │ (13 routes)  │  │ (14 routes)  │  │ (13 routes)  │  │ (17 routes) ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘│
└─────────┼──────────────────┼──────────────────┼──────────────────┼──────┘
          │                  │                  │                  │
          └──────────────────┴──────────────────┴──────────────────┘
                                      │
┌─────────────────────────────────────┼───────────────────────────────────┐
│                    BUSINESS LOGIC LAYER (TypeScript)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │  Gemini OCR  │  │ VC signing   │  │Org/role ctx  │  │ Rate limiter││
│  │   Vision)    │  │ (JWS via     │  │  resolution) │  │(memory + DB)││
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
│  │ audit_logs   │  │ verifiable_  │  │ role_requests│  │organization_││
│  │ (append-only)│  │ credentials  │  │              │  │   domains   ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘│
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ The original baseline schema is not in this repository; SQL      │ │
│  │ patches are versioned in my-app/supabase/migrations              │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────-─┘
                                      │
┌─────────────────────────────────────┼───────────────────────────────────┐
│                      EXTERNAL SERVICES LAYER                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │Google Gemini │  │ SMTP (email) │  │Supabase Auth │  │   Storage   ││
│  │ Vision (OCR) │  │ (nodemailer) │  │   (JWT)      │  │(signed URLs)││
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
- [Password Reset Flow](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/Password-reset.md) — the server-side reset flow and the Supabase redirect allow-list entry it needs
- [Security & Auth Flow](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/Security-Auth-flow.md) — auth flow diagrams and security considerations
- [Session cookies](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/SESSION-COOKIES.md) — HttpOnly server-managed sessions, polling instead of realtime, post-deploy smoke checklist
- [Private storage](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/PRIVATE-STORAGE.md) — signed-URL access to certificate files and the private-bucket migration
- [Rate limiting](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/RATE-LIMITING.md) — in-memory and Postgres-backed limiters, what is limited where, fail-open behaviour
- [Monitoring](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/MONITORING.md) — optional webhook alerts, the deep health probe, logs
- [Key rotation](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/KEY-ROTATION.md) — issuer key and Supabase key rotation runbook, including the credential re-sign tool
- [Architecture](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/ARCHITECTURE.md) — code-derived overview: directory map, request flow, auth model, certificate/credential lifecycle, tables, env vars, limitations
- [Database schema](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/DATABASE-SCHEMA.md) — the target data model, index design, RLS matrix, migration status and how the migrations are tested
- [Verifiable credentials](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/VERIFIABLE-CREDENTIALS.md) — did:web issuer, JWKS, key rotation, revocation status list (optional)
- [Selective disclosure](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/SELECTIVE-DISCLOSURE.md) and [Transparency log](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/TRANSPARENCY-LOG.md) — optional modules (off by default)
- [Database benchmarks](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/BENCHMARKS.md) — before/after query latency on real PostgreSQL at 1M rows, migration timings, reproduction steps
- [Audit closure report](https://github.com/Ujjwaljain16/CampusSync/blob/main/my-app/docs/AUDIT-CLOSURE.md) — what the security audit found and what is fixed
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
- **API**: Next.js 15 route handlers (100 route files, 134 HTTP handlers)
- **Authentication**: Supabase Auth; the session lives only in HttpOnly cookies written by the server (email/password through `POST /api/auth/login`, Google OAuth implemented); the browser has no Supabase client
- **Database**: PostgreSQL via Supabase
- **Security**: Supabase Row-Level Security; schema changes are versioned SQL in `my-app/supabase/migrations`
- **Data access**: `@supabase/supabase-js` client (no ORM)

### **AI & OCR**
- **AI Model**: Google Gemini Vision (model configurable via `GEMINI_MODEL`, default `gemini-2.0-flash`) for certificate field extraction
- **Extraction**: Gemini Vision
- **Image Processing**: Sharp (used by `next/image`)

### **Cryptography & Security**
- **VC Signing**: JWS via the JOSE library; the algorithm is the `alg` of the `VC_ISSUER_JWK` key you provide (EdDSA, ES256 or RS256 are accepted; the hosted deployment uses RS256)
- **Key Management**: The issuer key is supplied through the `VC_ISSUER_JWK` environment variable. Rotation is manual: put the old key's public JWK in `VC_ISSUER_PREVIOUS_PUBLIC_JWKS` so earlier credentials keep verifying, and optionally re-sign the stored credentials with the new key (`POST /api/admin/vcs/resign`, super admin; runbook in [KEY-ROTATION.md](./my-app/docs/KEY-ROTATION.md))
- **Issuer identity**: `did:web:<your host>`, with `/.well-known/did.json` and `/.well-known/jwks.json` published by the app

### **Storage & CDN**
- **File Storage**: Supabase Storage (`certificates` bucket); files are opened only through short-lived signed URLs issued after an authorization check
- **Image Optimization**: Next.js Image
- **PDF Generation**: jsPDF, PDF-lib

  
## 🧬 Notable Innovations

* 🔄 **Guarded by construction**: every API route performs its own authentication and authorization (shared `withAuth`/`withRole` wrappers and organization checks), and a route-inventory test (`my-app/tests/security/route-inventory.test.ts`) fails the build when a route has no guard and is not on an explicit public allow-list.
* 🧾 **Verifiable offline**: a standalone verifier ([`verifier/`](./verifier)) checks a credential's signature with only the issuer's public keys, without calling the CampusSync API or database.
* 📈 **Measured**: database changes are benchmarked against the original schema on PostgreSQL at about one million certificates ([BENCHMARKS.md](./my-app/docs/BENCHMARKS.md)).

---

## ✨ Key Features

### 🔐 **Multi-Organization Management**
- **Data Isolation**: organization-scoped checks in every API route, backed by RLS on user-session queries (RLS matrix in [DATABASE-SCHEMA.md](./my-app/docs/DATABASE-SCHEMA.md))
- **Org Admin Controls**: Primary admin designation, role delegation, member management
- **Recruiter Access Model**: Cross-org recruitment: one approved `user_roles` row per organization the recruiter may access

### 🧠 **AI-Powered Certificate Verification**
- **Gemini Vision Extraction**: uploaded certificate images and PDFs are sent to Google Gemini, which returns title, institution, recipient, date and description. A faculty member reviews every certificate before it is approved

### 🎓 **W3C Verifiable Credentials (VC)**
- **W3C VC data model**: credentials follow the VC Data Model 1.0 shape with a JWS proof (JSON-LD proof suites are not implemented)
- **JWS signatures**: signed with the issuer key from `VC_ISSUER_JWK`; credentials are issued only for faculty-verified certificates
- **Revocation Support**: Revocation status is stored on the credential row and checked on verification; an optional signed status list (`VC_STATUS_LIST_ENABLED`) is implemented but off by default
- **One active credential per certificate**: enforced by the database; issuing and revoking are done by the backend only
- **Public Verification API**: Rate-limited endpoints that verify a credential's signature and revocation status; the `/verify` page uses them. The standalone verifier in [`verifier/`](./verifier) checks a credential with only the issuer's public keys, without calling the CampusSync API or database

### 🧪 **Optional modules (feature-flagged, off by default)**
- **Selective disclosure** (SD-JWT style, `SD_JWT_ENABLED`): students share chosen fields of a credential. See [SELECTIVE-DISCLOSURE.md](./my-app/docs/SELECTIVE-DISCLOSURE.md)
- **Transparency log** (`TRANSPARENCY_LOG_ENABLED`): an append-only Merkle log of issued credentials with signed tree heads. See [TRANSPARENCY-LOG.md](./my-app/docs/TRANSPARENCY-LOG.md)
- **Revocation status list** (`VC_STATUS_LIST_ENABLED`): a signed bitstring list. See [VERIFIABLE-CREDENTIALS.md](./my-app/docs/VERIFIABLE-CREDENTIALS.md)

Each is behind a feature flag and has its own tables and tests.

### 💼 **Recruiter Portal**
- **Verified Talent Pool**: Browse students with cryptographically verified credentials, only in organizations where the recruiter has an approved access row
- **Search**: Filter students by institution, skills and verification status; contact details and GPA are shown only to students who opted in (`/student/privacy`)
- **Multi-Org Recruitment**: Access to multiple organization talent pools (permission-based, via per-organization `user_roles` rows)
- **Public portfolio**: a student can opt in to a public, verified-credentials-only portfolio at `/public/portfolio/<id>` (default private)
- **Approval status**: the waiting pages (`/waiting`, `/faculty/waiting`, `/recruiter/waiting`) poll the server (about every 10 seconds while visible); there is no realtime subscription in the browser

### 🛡️ **Security & Reliability**
- **Sessions**: Supabase Auth with email/password and Google OAuth; the session lives in **HttpOnly** cookies (SameSite=Lax, Secure) set by the server, so page script cannot read it ([SESSION-COOKIES.md](./my-app/docs/SESSION-COOKIES.md))
- **Authorization**: six roles (super_admin, org_admin, admin, faculty, student, recruiter) from a single approved-role source of truth, with a separate per-route organization check
- **Tenant isolation**: organization-scoped checks in every API route plus Postgres row-level security
- **Signed-URL file access**: the application opens certificate files only through 300-second signed URLs issued after an authorization check ([PRIVATE-STORAGE.md](./my-app/docs/PRIVATE-STORAGE.md))
- **Audit log**: written by the backend only, append-only, readable by the person who caused an entry and by organization admins
- **Rate limiting**: a Postgres-backed global limiter (failing open to the in-memory one) on login completion, signup, email checks, OCR, public verification, the public portfolio and selective-disclosure routes, with a per-instance limiter on the rest ([RATE-LIMITING.md](./my-app/docs/RATE-LIMITING.md))
- **Alerting**: an optional webhook for unexpected server errors (throttled and redacted) and a deep health probe for uptime monitors ([MONITORING.md](./my-app/docs/MONITORING.md))
- **Key rotation**: a super-admin tool re-signs stored credentials after an issuer key change ([KEY-ROTATION.md](./my-app/docs/KEY-ROTATION.md))

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
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key   # the project's publishable (anon) key
SUPABASE_SERVICE_ROLE_KEY=your-secret-key         # server only, bypasses RLS

# Google Gemini (required for certificate extraction)
GEMINI_API_KEY=your-gemini-api-key

# Verifiable Credential issuer key (single-line JSON JWK; generate a fresh one per environment)
VC_ISSUER_JWK={...}
NEXT_PUBLIC_ISSUER_DID=did:web:your-domain.example

# Application
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Optional: https incoming-webhook URL for error alerts (Slack, Discord, ...). Unset = no alerts. Treat it as a secret.
# ALERT_WEBHOOK_URL=
```
A complete, commented template is in [`my-app/.env.example`](./my-app/.env.example). Never commit `.env.local`.

The database and storage bucket must exist in your own Supabase project. The original baseline schema SQL is **not** in this repository: `my-app/supabase/migrations` holds the patches (hardening, the 2026-10-15 schema cleanup, and the 2026-10-16 private-bucket and rate-limit migrations) that are applied on top of it, in the order listed in [DATABASE-SCHEMA.md](./my-app/docs/DATABASE-SCHEMA.md), so a brand-new project cannot be built from the repo alone. Create the first super admin with `node --env-file=.env.local scripts/setup-superadmin.mjs` (see `my-app/scripts/README.md`).

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
npm run build       # production build (also run in CI)
npm run audit:prod  # dependency audit gate with reviewed, expiring exceptions

# migrations, tested against an in-process PostgreSQL model of the production schema
cd supabase/tests && npm ci && npm test
```
CI (`.github/workflows/ci.yml`) runs typecheck, lint, the app tests, a production build (`next build`), the migration checks, the dependency audit gate and gitleaks secret scanning; CodeQL runs in its own workflow.

For local sign-in use `npm run dev` (or https): the session cookies are `Secure` outside `next dev`, and some browsers (Safari) drop them on a production build served over plain `http://localhost`. In your Supabase project, add `<site>/api/auth/callback**` to the Authentication redirect allow-list (password reset and Google sign-in use it); see [Password-reset.md](./my-app/docs/Password-reset.md) and [SESSION-COOKIES.md](./my-app/docs/SESSION-COOKIES.md).

---

## 🔐 Security notes

- **Secrets**: only `my-app/.env.example` (placeholders) is committed; `.env*` files are git-ignored. `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and stays server-side. Report vulnerabilities and read the key-handling guidance in [SECURITY.md](./SECURITY.md).
- **Every API route guards itself**: the middleware covers pages, not `/api/*`; new routes must use the shared wrappers (the route-inventory test enforces it).
- **AI extraction is advisory**: Gemini output can be wrong, so faculty approve every certificate. Uploaded documents are sent to Google's Gemini API.
- **Credentials are W3C-style**: JWS-signed credentials modelled on the VC data model; JSON-LD proof suites and third-party conformance testing are not implemented.
- **Rate limits**: the global limiter fails open to the in-memory one if the database call fails; put an edge limit in front for stronger protection.
- **Testing**: unit and integration tests with in-memory fakes, migration checks on a model of the production schema, and a production build in CI. There are no browser end-to-end tests yet.
- **Optional modules** (selective disclosure, transparency log, status list) are off by default.
- **Dependencies**: an audit gate runs in CI; accepted advisories are listed with reasons and review dates in `my-app/audit-allowlist.json`.

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
- Portfolio Builder (an opt-in public portfolio with verified credentials exists; a richer builder does not)
- Dynamic QR codes and embeddable credential widgets
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

