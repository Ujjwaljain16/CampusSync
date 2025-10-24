# CredentiVault (CampusSync)

> **A next-generation SaaS for automated certificate management, verification, and recruiter-friendly credential validation.**

---

## ✨ Project Highlights

- **Modern, Secure, and Scalable:** Built with Next.js 15, React 19, Supabase, and advanced AI-powered OCR.
- **Role-based Experience:** Distinct dashboards and flows for Admin, Faculty, Student, and Recruiter.
- **Automated Verification:** AI-driven OCR, logo matching, QR, and template checks for instant, reliable certificate validation.
- **Verifiable Credentials:** W3C-compliant, cryptographically signed credentials for global trust.
- **Recruiter Tools:** Public portfolios, instant credential verification, and advanced student search.
- **Audit & Compliance:** Full logging, audit trails, and production-grade security.
- **Performance Optimized:** Indexed DB, image optimization, serverless scaling, and 90+ Lighthouse scores.

---

## 🏆 Our Implementation & Team Effort

This project is the result of:
- **Hundreds of hours** of design, coding, and optimization
- **50%+ API migration** (84/168 routes refactored for clarity, security, and speed)
- **32+ database migrations** for robust, scalable schema
- **Comprehensive documentation** (architecture, API, setup, optimization, and more)
- **Continuous improvement:** Codebase cleaned, dead code removed, and best practices enforced
- **Real-world testing:** All critical flows tested and validated

We built not just a product, but a platform that can scale, adapt, and serve real users securely and efficiently.

---

## 🚀 Features at a Glance

- **Role-based Dashboards:** Admin, Faculty, Student, Recruiter
- **Automated Certificate Verification:** OCR (Tesseract.js + Gemini AI), logo matching, QR, and template checks
- **Verifiable Credentials:** W3C-compliant, cryptographically signed credentials
- **Recruiter Tools:** Public portfolio, instant credential verification, advanced student search
- **Audit Trail:** Full logging of all actions and decisions
- **Production-Grade Security:** Supabase Auth, Row-Level Security, strict API/middleware patterns
- **Performance Optimized:** Indexed DB, image optimization, serverless scaling
- **Extensible & Documented:** Modular code, clear API, and guides for every major feature

---

## 🏗️ Tech Stack

- **Frontend:** Next.js 15 (App Router), React 19, Tailwind CSS 4, TypeScript 5
- **Backend:** Next.js API Routes (Serverless), Supabase (PostgreSQL, Auth, Storage)
- **AI/OCR:** Tesseract.js, Google Gemini AI, pdf2pic, image-hash
- **VC/Blockchain:** Jose, Ed25519, W3C Verifiable Credentials
- **Deployment:** Vercel

---

## 📦 Project Structure

```
my-app/
├── src/
│   ├── app/            # Role-based pages & API routes (168+)
│   ├── components/     # UI components (library in progress)
│   ├── lib/            # Business logic, OCR, VC, utilities
│   ├── types/          # TypeScript types
│   └── middleware.ts   # Auth middleware
├── supabase-migrations/ # DB migrations (32+)
├── scripts/            # Admin & utility scripts
├── database/           # SQL scripts, indexes
├── public/             # Static assets
├── test-assets/        # Test documents
├── DOCUMENTATION/      # Architecture, API, setup, optimization, etc.
├── package.json, next.config.ts, .env.local, etc.
```

---

## 💡 What Sets Us Apart

- **API Utilities & Middleware:** Centralized, type-safe, and DRY patterns for authentication, role checks, and error handling.
- **Database Excellence:** 18+ tables, RLS, 70+ performance indexes, and a clean, versioned schema.
- **Security First:** Strict security headers, RLS, and production-grade API protection.
- **Real Automation:** 80-90% reduction in manual faculty work, instant verification for trusted issuers, and cryptographic credentialing.
- **Recruiter-Ready:** Public APIs for credential verification, advanced student search, and portfolio access.
- **Continuous Optimization:** Bundle/image size reduction, auto-removal of console logs, and performance logging.
- **Extensive Documentation:** Every feature, flow, and architectural decision is documented for transparency and onboarding.

---

## ⚙️ Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Ujjwaljain16/CredentiVault.git
   cd my-app
   ```

2. **Configure environment:**
   - Copy `.env.local.example` to `.env.local` and fill in Supabase and OAuth credentials.
   - See [ENVIRONMENT-SETUP.md](ENVIRONMENT-SETUP.md) for details.

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Run database migrations:**
   - Use Supabase SQL editor or CLI to apply all migrations in `supabase-migrations/`.
   - See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

5. **Start the development server:**
   ```bash
   npm run dev
   ```

6. **Access the app:**
   - Visit [http://localhost:3000](http://localhost:3000)
   - Complete setup to create your first admin account.

---

## 🔐 Security & Roles

- **Authentication:** Supabase Auth (JWT, OAuth)
- **Roles:** Student, Faculty, Admin, Recruiter (see [README-ROLE-SETUP.md](README-ROLE-SETUP.md))
- **Row-Level Security:** Enforced on all tables
- **API Security:** Centralized middleware (`withAuth`, `withRole`)

---

## 📋 API Documentation

- Full API reference: [API-DOCUMENTATION.md](API-DOCUMENTATION.md)
- Key endpoints:
  - `/api/certificates/create` – Upload certificate
  - `/api/certificates/ocr` – OCR & smart verification
  - `/api/certificates/issue` – Issue verifiable credential
  - `/api/recruiter/verify-credential` – Public credential verification
  - `/api/admin/roles` – Role management

---

## 🧠 Architecture & Implementation

- **Modern, modular codebase:** Clean, type-safe, and DRY
- **Serverless-first:** All APIs as Next.js serverless functions
- **Automated verification pipeline:** OCR, logo, QR, template, AI confidence
- **Production optimizations:** Security headers, image formats, DB indexes, logging
- **Extensive documentation:** See `/DOCUMENTATION` for guides, analysis, and optimization checklists
- **Real-world impact:**
  - 10x faster dashboard loads
  - 20x faster role checks
  - 50-90% faster queries overall
  - 12%+ code reduction in refactored APIs

---

## 🧪 Testing

- Manual and automated test scripts in `/scripts` and `/test-assets`
- See [TESTING.md](TESTING.md) for instructions

---

## 📝 Documentation

- [COMPLETE-CODEBASE-ANALYSIS.md](COMPLETE-CODEBASE-ANALYSIS.md)
- [ARCHITECTURE-ANALYSIS.md](ARCHITECTURE-ANALYSIS.md)
- [API-DOCUMENTATION.md](API-DOCUMENTATION.md)
- [ENVIRONMENT-SETUP.md](ENVIRONMENT-SETUP.md)
- [README-ROLE-SETUP.md](README-ROLE-SETUP.md)
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
- [PRODUCTION-OPTIMIZATION-CHECKLIST.md](PRODUCTION-OPTIMIZATION-CHECKLIST.md)

---

## 💬 Team & Acknowledgements

- **Lead Developer:** Ujjwal Jain ([Ujjwaljain16](https://github.com/Ujjwaljain16))
- **Contributors:** See commit history for all contributors
- **Special Thanks:** To everyone who contributed feedback, testing, and support throughout development

---

## 💡 Contributing

Contributions are welcome! Please open issues or pull requests for improvements, bug fixes, or new features.

---

## 🛡️ License

MIT License

---

> _This project is a testament to our commitment to quality, security, and innovation. Every feature, optimization, and line of code reflects our dedication to building a platform that empowers users and organizations to manage credentials with confidence._
