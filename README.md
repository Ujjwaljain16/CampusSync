# 🏛️ CampusSync

**Next-Generation SaaS for Automated Certificate Management, Verification & Verifiable Credentials**

CampusSync is a **modern, secure, and scalable SaaS platform** built for institutions, universities, and recruiters.  
It automates the entire lifecycle of certificates — from upload and AI verification to issuing **W3C-compliant Verifiable Credentials (VCs)**.

---

## 🚀 Features Overview

### 🔐 Authentication & Authorization
- **Supabase Auth** with JWT & OAuth support.
- **Role-Based Access Control (RBAC)** for Admin, Faculty, Student, and Recruiter.
- Enforced via **Next.js Middleware** and **Row-Level Security (RLS)**.
- SSR-friendly session and cookie management.

### 🧠 Automated Certificate Verification
- **OCR Extraction:** Tesseract.js + Google Gemini AI for high-accuracy text extraction.
- **Metadata Validation:** Ensures title, institution, recipient, and date consistency.
- **AI Confidence Scoring:** Combines OCR quality, template match, and logo similarity.
- **Duplicate Detection:** Checks text and hash similarity.
- **Audit Logging:** Every verification logged for transparency and traceability.

### 🎓 Verifiable Credentials (VC)
- **W3C-compliant issuance** using Ed25519 & JOSE libraries.
- Custom **issuance policies** (types, fields, validity, approvals).
- Cryptographically **signed & verifiable** credentials.
- Built-in **revocation and cooldown** support.
- **Recruiter APIs** for instant credential verification.

### 💼 Recruiter Portal
- **Verified Portfolios:** Students showcase authentic credentials.
- **Smart Search & Filters:** Find candidates by skill, course, or verified status.
- **Public Verification API:** Real-time validation of credentials.

### 🪶 Security & Compliance
- **Supabase Auth + Middleware protection**.
- **RLS-enforced** access control on all tables.
- **End-to-end audit logging** for every user action.
- **Cryptographically signed** and tamper-proof credentials.

### ⚡ Performance
- 70+ **indexed database queries** for speed.
- **Serverless architecture** with Next.js API routes.
- **Image optimization** for faster uploads and verification.
- Background job queue for heavy OCR/AI workloads.

---

## 🧭 Architecture Overview

```plaintext
src/
├── app/                  # Next.js App Router pages + 160+ API routes
├── components/           # Modular, reusable UI components
├── lib/                  # Core business logic (OCR, VC, Verification Engine)
├── types/                # Centralized TypeScript type definitions
├── middleware.ts         # Auth & route protection
├── scripts/              # Admin/automation scripts
├── supabase-migrations/  # SQL migrations, RLS, audit schema
└── database/             # SQL scripts, indexes, and triggers
```

**Tech Stack**

* **Frontend:** React 19, Tailwind CSS 4
* **Backend:** Next.js 15 (App Router)
* **Database:** Supabase (PostgreSQL)
* **Auth:** Supabase Auth + JWT
* **AI Services:** Gemini AI + Tesseract.js
* **VC Signing:** Ed25519 + JOSE
* **Deployment:** Vercel / Supabase Edge Functions

---

## ⚙️ Setup & Installation

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/ujjwaljain16/campusSync.git
cd campusSync
```

### 2️⃣ Install Dependencies

```bash
npm install
```

### 3️⃣ Configure Environment Variables

Create a `.env.local` file and add:

```env
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
JWT_SECRET=<your-jwt-secret>
```

### 4️⃣ Start the Development Server

```bash
npm run dev
```

Access at **http://localhost:3000** and complete admin setup.

---

## 🧱 Core Modules

| Module | Description |
|--------|-------------|
| **middleware.ts** | Global authentication, route protection, SSR session handling |
| **verificationEngine.ts** | AI-powered certificate verification (OCR, QR, Logo, Template) |
| **vcIssuer.ts** | W3C VC issuance, signing, validation, and audit logging |
| **api/** | 80+ serverless endpoints for certificate, recruiter, and admin flows |
| **lib/** | Business logic for OCR, verification, and AI confidence |
| **scripts/** | Admin utilities (keygen, seeding, cleanup) |
| **supabase-migrations/** | Schema, RLS, and audit definitions |

---

## 🔄 Workflow Summary

1. **Certificate Upload:**
   User uploads certificate → Text extracted (OCR + Gemini AI)

2. **Verification:**
   Verification is done by faculty manually for now 

3. **Confidence Scoring:**
   Weighted AI confidence determines approval or manual review.

4. **VC Issuance:**
   Approved certificates converted to cryptographically signed VCs.

5. **Recruiter Validation:**
   Recruiters instantly verify authenticity via public APIs.

6. **Audit Logging:**
   Every action tracked for compliance and traceability.

---

## 🧠 Key Problems Solved

* 🔏 **Prevents Credential Fraud:** Cryptographically signed VCs.
* ⚡ **Instant Recruiter Validation:** Real-time, API-based checks.
* 🧩 **Highly Extensible:** Add new credential types or verification rules easily.
* 🛡️ **Enterprise Security:** Supabase RLS + JWT + full audit trail.

---

## 🧬 Notable Innovations

* 🔄 **Centralized Middleware** for clean, DRY authentication & routing.
* 📊 **Performance-Optimized Database** with 70+ indexes.
* 🧩 **Modular, Extensible Architecture** for smooth feature addition.


---

## 🔮 Future Enhancements

### 1️⃣ Automated Verification Pipeline (Full Automation)
**Current State:** Verification engine is robust, but low-confidence cases require manual review.

**Planned Enhancements:**
* End-to-end automation for most certificate types with auto-approval for trusted issuers
* Advanced AI/ML integration for fraud detection, anomaly detection, and document forgery identification
* Real-time notifications via webhooks, email, and in-app alerts for verification status updates
* Batch processing capabilities for high-volume certificate verification

### 2️⃣ Multi-Organization (Multi-Tenancy)
**Current State:** Role-based access is implemented, but full multi-tenant architecture needs expansion.
**Planned Enhancements:**
* Complete data isolation per organization with custom branding and domains
* Organization-specific issuer DIDs and cryptographic keys
* Org-level admin dashboards with comprehensive analytics
* Cross-organization credential verification with granular privacy controls

### 3️⃣ Advanced Email Routing & Notifications
**Planned Enhancements:**
* Automated email notifications for all major events (verification, issuance, approval, revocation)
* Customizable email templates per organization and role
* Bulk email capabilities for onboarding, reminders, and status updates
* Email preference management and unsubscribe workflows
* Rich HTML templates with organization branding

### 4️⃣ Enhanced Security & Mitigation
**Current State:** Strong RLS and audit logging foundation in place.
**Planned Enhancements:**
* Automated detection and mitigation of suspicious activity (rate limiting, IP blacklisting, anomaly alerts)
* More granular audit logs with advanced filtering and export features
* Automated compliance checks (GDPR, FERPA, CCPA, etc.)
* Real-time security dashboards and threat intelligence
* Two-factor authentication (2FA) and biometric authentication support

### 5️⃣ Portfolio Sharing & Public Profiles
**Planned Enhancements:**
* Fully customizable public portfolio pages with privacy controls
* Shareable links, dynamic QR codes, and embeddable credential widgets
* Portfolio analytics (views, downloads, recruiter engagement metrics)
* Social media integration and LinkedIn credential sharing
* Professional resume builder with verified credentials

### 6️⃣ API & Integration Ecosystem
**Current State:** Comprehensive API endpoints available, room for expanded integrations.
**Planned Enhancements:**
* OAuth2/OpenID Connect for seamless third-party integrations
* Pre-built integrations with Zapier, Slack, Microsoft Teams, and popular LMS platforms
* Granular API keys with role-based permissions and usage analytics
* GraphQL API alongside REST for flexible data querying
* SDK libraries for Python, JavaScript, Java, and other languages
* Developer portal with interactive API documentation

### 7️⃣ Advanced Admin & Analytics Dashboards
**Current State:** Role-based dashboards with basic analytics.
**Planned Enhancements:**
* Comprehensive analytics for credential issuance, verification rates, and user engagement
* Predictive analytics and trend forecasting
* Exportable reports in multiple formats (PDF, Excel, CSV)
* Scheduled analytics reports via email
* Custom dashboard builder with drag-and-drop widgets
* Real-time data visualization and KPI tracking
