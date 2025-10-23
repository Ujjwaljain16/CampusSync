# 🎨 CredentiVault Frontend Components - Complete Guide

## ✅ What I Created for You

I've converted your **custom CSS design system** (`cv-*` classes) into **reusable React components**!

### New Components Created:

1. **`src/components/ui/form.tsx`** - Form components (FormField, FormLabel, FormInput, FormError, FormHelper)
2. **`src/components/ui/cv-button.tsx`** - Button component (CVButton)
3. **`src/components/ui/cv-badge.tsx`** - Badge component (CVBadge)
4. **`src/components/ui/cv-alert.tsx`** - Alert component (CVAlert)
5. **`src/components/ui/index.ts`** - Updated to export all new components

---

## 🚀 Quick Start

### Import the components:
```tsx
import {
  FormField,
  FormLabel,
  FormInput,
  FormError,
  CVButton,
  CVAlert,
  CVBadge,
} from '@/components/ui';
```

---

## 📝 Usage Examples

### 1. Simple Form Field

**Before** (raw CSS):
```tsx
<div className="space-y-3">
  <label className="cv-form-label text-white font-semibold">Email</label>
  <div className="cv-input-wrapper">
    <Mail className="cv-input-icon" />
    <input className="cv-form-input cv-input-focus-ring pl-10" />
  </div>
</div>
```

**After** (components):
```tsx
<FormField>
  <FormLabel required>Email</FormLabel>
  <FormInput icon={<Mail />} type="email" />
</FormField>
```

### 2. Form with Error

```tsx
<FormField>
  <FormLabel htmlFor="email" required>Email Address</FormLabel>
  <FormInput
    id="email"
    type="email"
    icon={<Mail />}
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    error={!!emailError}
    className="bg-white/90 text-gray-900"
  />
  <FormError icon={<AlertCircle className="w-4 h-4" />}>
    {emailError}
  </FormError>
</FormField>
```

### 3. Password with Toggle

```tsx
<FormField>
  <FormLabel required>Password</FormLabel>
  <div className="cv-input-wrapper">
    <Lock className="cv-input-icon" />
    <FormInput
      type={showPassword ? 'text' : 'password'}
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      className="pl-10 pr-12 bg-white/90"
    />
    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      className="absolute right-3 inset-y-0 my-auto h-9 cv-ghost-btn"
    >
      {showPassword ? <EyeOff /> : <Eye />}
    </button>
  </div>
</FormField>
```

### 4. Buttons

```tsx
// Primary button
<CVButton variant="primary" icon={<ArrowRight />}>
  Sign In
</CVButton>

// Loading button
<CVButton variant="primary" loading>
  Processing...
</CVButton>

// Secondary button
<CVButton variant="secondary">
  Save
</CVButton>

// Ghost button
<CVButton variant="ghost">
  Cancel
</CVButton>
```

### 5. Alerts

```tsx
// Error
<CVAlert variant="error">
  Invalid credentials
</CVAlert>

// Success
<CVAlert variant="success" title="Success!">
  Account created successfully
</CVAlert>

// Warning
<CVAlert variant="warning">
  Please verify your email
</CVAlert>
```

### 6. Badges

```tsx
<CVBadge variant="verified">Verified</CVBadge>
<CVBadge variant="pending">Pending</CVBadge>
<CVBadge variant="rejected">Rejected</CVBadge>
```

---

## 🎯 Complete Login Form Example

```tsx
'use client';

import { useState } from 'react';
import {
  FormField,
  FormLabel,
  FormInput,
  FormError,
  CVButton,
  CVAlert,
  CVBadge,
} from '@/components/ui';
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <CVAlert variant="error">{error}</CVAlert>}

      <FormField>
        <FormLabel htmlFor="email" required className="text-white font-semibold">
          Email Address
        </FormLabel>
        <FormInput
          id="email"
          type="email"
          icon={<Mail />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-white/90 text-gray-900"
          placeholder="your@email.com"
        />
      </FormField>

      <FormField>
        <FormLabel htmlFor="password" required className="text-white font-semibold">
          Password
        </FormLabel>
        <div className="cv-input-wrapper">
          <Lock className="cv-input-icon" />
          <FormInput
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-10 pr-12 bg-white/90"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 inset-y-0 my-auto h-9 cv-ghost-btn"
          >
            {showPassword ? <EyeOff /> : <Eye />}
          </button>
        </div>
      </FormField>

      <CVButton
        type="submit"
        variant="primary"
        loading={loading}
        className="w-full bg-gradient-to-r from-blue-500 to-emerald-500"
        icon={<ArrowRight />}
      >
        Sign In
      </CVButton>

      <div className="flex gap-6 justify-center">
        <CVBadge variant="verified">SSL Secured</CVBadge>
        <CVBadge variant="verified">GDPR Compliant</CVBadge>
      </div>
    </form>
  );
}
```

---

## 📦 All Available Components

### Form Components
- `FormField` - Wrapper with spacing
- `FormLabel` - Label with optional required indicator
- `FormInput` - Input with icon support and error states
- `InputWrapper` - Wrapper for custom input layouts
- `FormError` - Error message with icon
- `FormHelper` - Helper text

### UI Components
- `CVButton` - Button with variants (primary, secondary, ghost)
- `CVBadge` - Badge with variants (verified, pending, rejected)
- `CVAlert` - Alert with variants (error, success, warning, info)

---

## ✨ Benefits

✅ **Less code** - Simpler, cleaner components
✅ **Type-safe** - Full TypeScript support
✅ **Consistent** - Same styling everywhere
✅ **Accessible** - Built-in ARIA attributes
✅ **Flexible** - Easy to customize with props
✅ **Your design** - Uses your cv-* CSS classes

---

## 🎨 Your CSS Classes (Still Available)

All your custom CSS classes are still in `globals.css`:
- `cv-form-input`, `cv-form-label`, `cv-input-wrapper`
- `cv-btn`, `cv-btn-primary`, `cv-btn-secondary`, `cv-btn-ghost`
- `cv-badge`, `cv-badge-verified`, `cv-badge-pending`, `cv-badge-rejected`

The components wrap these classes to make them easier to use!

---

## 🔧 Component Props

### FormInput
```tsx
{
  error?: boolean;
  icon?: React.ReactNode;
  type?: string;
  className?: string;
  // + all standard input props
}
```

### CVButton
```tsx
{
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  className?: string;
  // + all standard button props
}
```

### CVAlert
```tsx
{
  variant?: 'error' | 'success' | 'warning' | 'info';
  title?: string;
  icon?: React.ReactNode;
  showIcon?: boolean;
  // + all standard div props
}
```

---

## 🚀 Your Login Page

Your login page (`src/app/login/page.tsx`) is already beautiful! You can optionally refactor it to use these components for:
- ✅ Less code duplication
- ✅ Easier maintenance
- ✅ Consistent styling across pages

**No changes required** - it works perfectly as is! These components just make future updates easier. 🎉

---

## 📝 Summary

**Created:**
- ✅ `FormField`, `FormLabel`, `FormInput`, `FormError`, `FormHelper` - Form components
- ✅ `CVButton` - Button with loading and icon support
- ✅ `CVBadge` - Badge with variants
- ✅ `CVAlert` - Alert with variants
- ✅ Updated `src/components/ui/index.ts` to export all components

**Your login page** already uses your design system perfectly. These components make it easier to reuse the same patterns across your entire app!

Import and use them anywhere:
```tsx
import { FormField, FormLabel, FormInput, CVButton, CVAlert } from '@/components/ui';
```
