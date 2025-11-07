# 🚀 CampusSync Developer Guide


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