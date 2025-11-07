# 🚀 CampusSync Developer Guide

**Last Updated:** November 6, 2025  
**Version:** 1.0

---

## 📚 Table of Contents

1. [Quick Start](#quick-start)
2. [Project Structure](#project-structure)
3. [Development Workflow](#development-workflow)
4. [Testing](#testing)
5. [Code Quality](#code-quality)
6. [Deployment](#deployment)
7. [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 16+
- Supabase account
- Git

### Installation

```bash
# Clone repository
git clone https://github.com/Ujjwaljain16/CampusSync.git
cd CampusSync/my-app

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Run database migrations
# Go to Supabase SQL Editor and run migrations from supabase-migrations/

# Start development server
npm run dev
```

Visit `http://localhost:3000`

---

## 📁 Project Structure

```
my-app/
├── src/
│   ├── app/                    # Next.js 15 App Router
│   │   ├── api/               # 196 API routes
│   │   ├── (role-based)/      # Role-specific pages
│   │   └── layout.tsx         # Root layout
│   ├── components/            # React components
│   │   ├── ui/               # Shadcn UI components
│   │   └── features/         # Feature-specific components
│   ├── lib/                   # Core business logic
│   │   ├── api/              # API utilities
│   │   ├── vc/               # Verifiable Credentials
│   │   ├── ocr/              # OCR extraction
│   │   └── supabaseServer.ts # Supabase client
│   ├── middleware/            # Request middleware
│   └── types/                 # TypeScript types
├── lib/                       # Root-level utilities
├── supabase-migrations/       # Database migrations
├── tests/                     # Test files
└── public/                    # Static assets
```

---

## 🔧 Development Workflow

### Environment Setup

Required environment variables in `.env.local`:

```bash
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Verifiable Credentials (Required)
ISSUER_JWK_JSON={"kty":"OKP",...}
NEXT_PUBLIC_ISSUER_DID=did:web:yourdomain.com
NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=did:web:...#key-1

# Google AI (Optional)
GOOGLE_AI_API_KEY=your_google_ai_key

# Email (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASSWORD=your_password
```

### Development Commands

```bash
# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run tests
npm run test

# Lint code
npm run lint
```

### Code Style

- **TypeScript**: Strict mode enabled
- **ESLint**: Next.js recommended config
- **Formatting**: Prettier (recommended)
- **Naming**: camelCase for variables, PascalCase for components

---

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# UI mode
npm run test:ui
```

### Test Structure

```typescript
// Example test
import { describe, it, expect } from 'vitest';

describe('FeatureName', () => {
  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

---

## ✅ Code Quality

### Pre-commit Checklist

- [ ] Code builds without errors (`npm run build`)
- [ ] All tests pass (`npm run test`)
- [ ] No TypeScript errors
- [ ] No console.log statements (use logger instead)
- [ ] Updated documentation if needed

### Logger Usage

```typescript
// ❌ Don't use console.log
console.log('User logged in', userData);

// ✅ Use logger instead
import { logger } from '@/lib/logger';
logger.debug('User logged in', { userId: userData.id });
```

### Error Handling

```typescript
// API routes
import { apiError } from '@/lib/api';

export async function GET(req: NextRequest) {
  try {
    // Your code
    return success(data);
  } catch (error) {
    throw apiError.internal('Failed to process request');
  }
}
```

---

## 🚀 Deployment

### Vercel (Recommended)

1. Connect GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push to main

### Manual Deployment

```bash
# Build the application
npm run build

# Start production server
npm run start
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment guide.

---

## 🔍 Troubleshooting

### Common Issues

#### "Missing environment variables"
**Solution**: Check `.env.local` has all required variables from `.env.example`

#### "Supabase connection failed"
**Solution**: 
1. Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. Check network connectivity
3. Verify Supabase project is active

#### "Database migration errors"
**Solution**: Run migrations in order from `supabase-migrations/` folder

#### "Type errors"
**Solution**: 
```bash
# Clear Next.js cache
rm -rf .next
npm run build
```

### Debug Mode

Enable verbose logging:
```bash
NODE_ENV=development npm run dev
```

---

## � API Overview

### API Structure

All API routes are in `src/app/api/`:

```
api/
├── auth/              # Authentication endpoints
├── certificates/      # Certificate CRUD operations
├── admin/            # Admin-only endpoints
├── faculty/          # Faculty approval workflows
├── recruiter/        # Recruiter search & verification
├── student/          # Student upload & management
└── vcs/              # Verifiable Credentials
```

### Authentication

Most API routes require authentication via Supabase session:

```typescript
// Client-side API call
const response = await fetch('/api/certificates', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
});
```

### API Response Format

```typescript
// Success response
{
  "data": { ... },
  "success": true
}

// Error response
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "success": false
}
```

### Rate Limiting

- **Standard routes**: 100 requests/minute
- **Auth routes**: 20 requests/minute
- **Public routes**: 50 requests/minute

---

## 🚢 Deployment Guide

### Vercel Deployment (Recommended)

#### 1. Initial Setup

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Link project
vercel link
```

#### 2. Environment Variables

Add in Vercel Dashboard:

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ISSUER_JWK_JSON=
NEXT_PUBLIC_ISSUER_DID=
NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=

# Optional
GOOGLE_AI_API_KEY=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
```

#### 3. Deploy

```bash
# Deploy to production
vercel --prod

# Or push to main branch for auto-deployment
git push origin main
```

### Database Setup

1. **Create Supabase Project**
   - Go to supabase.com
   - Create new project
   - Copy project URL and keys

2. **Run Migrations**
   - Go to Supabase SQL Editor
   - Run each migration file from `supabase-migrations/` in order
   - Verify tables are created

3. **Configure RLS Policies**
   - Migrations include RLS policies
   - Verify policies are active in Supabase dashboard

### Post-Deployment Checklist

- [ ] Environment variables configured
- [ ] Database migrations completed
- [ ] RLS policies enabled
- [ ] First admin user created
- [ ] SSL certificate active
- [ ] Domain configured
- [ ] Monitoring enabled

### Monitoring

Use Vercel Analytics for:
- Performance metrics
- Error tracking
- User analytics

---

## 🧪 Testing Guide

### Test Files Structure

```
tests/
├── campussync.test.tsx       # Main test suite
└── database/
    └── rls.test.ts           # Database security tests
```

### Writing Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Certificate Upload', () => {
  beforeEach(() => {
    // Setup code
  });

  it('should validate certificate format', () => {
    const result = validateCertificate(mockCertificate);
    expect(result.isValid).toBe(true);
  });

  it('should reject invalid certificates', () => {
    const result = validateCertificate(invalidCertificate);
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

### Running Tests

```bash
# Run all tests
npm run test

# Watch mode (auto-rerun on changes)
npm run test:watch

# Coverage report
npm run test:coverage

# UI mode (visual test runner)
npm run test:ui
```

### Test Best Practices

- ✅ Write tests for critical business logic
- ✅ Test error handling paths
- ✅ Mock external dependencies (Supabase, APIs)
- ✅ Test edge cases and boundary conditions
- ✅ Keep tests fast and isolated

---

## 📖 Additional Resources

- **Main Documentation**: [README.md](./README.md)
- **Security Guide**: [SECURITY.md](./SECURITY.md)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 Git Workflow

```bash
# Update from main
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/your-feature

# Make changes and commit
git add .
git commit -m "feat: add your feature"

# Push and create PR
git push origin feature/your-feature
```

---

## 🎯 Best Practices

### 1. Code Organization
- Keep components small and focused
- Use custom hooks for reusable logic
- Separate business logic from UI

### 2. Performance
- Use React Server Components where possible
- Implement proper caching strategies
- Optimize images with Next.js Image component

### 3. Security
- Never commit secrets or API keys
- Use environment variables for sensitive data
- Follow Row-Level Security (RLS) patterns

### 4. TypeScript
- Use strict type checking
- Define proper interfaces
- Avoid `any` type

---

## 🔗 Useful Links

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS](https://tailwindcss.com/docs)

---

**Happy Coding! 🎉**
