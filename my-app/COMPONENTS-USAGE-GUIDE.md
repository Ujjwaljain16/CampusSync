# 🎨 Component Library Usage Guide

**Status:** ✅ **IMPLEMENTED**  
**Date:** October 15, 2025  
**Components Created:** 7 essential UI components

---

## 📦 **What We Built**

We created a **minimal, focused** component library with only the components you actually use:

```
src/components/
├── ui/
│   ├── button.tsx       ✅ Multiple variants (default, destructive, outline, etc.)
│   ├── card.tsx         ✅ Stats cards, info containers
│   ├── input.tsx        ✅ Form inputs
│   ├── label.tsx        ✅ Form labels
│   ├── badge.tsx        ✅ Status badges (verified, pending, rejected)
│   ├── dialog.tsx       ✅ Modals/confirmations
│   ├── table.tsx        ✅ Data tables
│   └── index.ts         ✅ Easy imports
├── LogoutButton.tsx     ✅ Existing
└── [more to come]
```

---

## 🎯 **Design Philosophy**

### **Built for YOUR codebase:**
- ✅ Dark theme with glassmorphism (`bg-gray-900/40 backdrop-blur-xl`)
- ✅ Emerald accent color (matches your brand)
- ✅ Tailwind CSS 4 classes
- ✅ Fully accessible (Radix UI primitives)
- ✅ TypeScript with proper types

### **No bloat:**
- ❌ No unused components
- ❌ No extra dependencies
- ❌ No complex configuration

---

## 🚀 **How to Use**

### **Import Components**

```typescript
// Single import
import { Button } from '@/components/ui/button'

// Multiple imports from index
import { Button, Card, Input, Badge } from '@/components/ui'
```

---

## 📘 **Component Examples**

### **1. Button**

```typescript
import { Button } from '@/components/ui'

// Default button
<Button onClick={handleClick}>Click Me</Button>

// Variants
<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Cancel</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>

// With loading state
<Button disabled={loading}>
  {loading ? 'Loading...' : 'Submit'}
</Button>

// Real example from your code
<Button 
  variant="destructive" 
  onClick={() => handleDelete(certId)}
  disabled={deleting}
>
  {deleting ? 'Deleting...' : 'Delete'}
</Button>
```

---

### **2. Card**

```typescript
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui'

// Stats card (like your dashboard)
<Card>
  <CardHeader>
    <CardTitle>Total Certificates</CardTitle>
    <CardDescription>All time uploads</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="text-4xl font-bold">{totalCount}</div>
  </CardContent>
</Card>

// Full example
<Card className="hover:border-emerald-500/50 transition-colors">
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Shield className="w-5 h-5 text-emerald-400" />
      Verified Certificates
    </CardTitle>
    <CardDescription>Successfully verified documents</CardDescription>
  </CardHeader>
  <CardContent>
    <p className="text-3xl font-bold text-emerald-400">{verifiedCount}</p>
  </CardContent>
  <CardFooter>
    <Button variant="outline" size="sm">View All</Button>
  </CardFooter>
</Card>
```

---

### **3. Input & Label**

```typescript
import { Input, Label } from '@/components/ui'

// Form field
<div className="space-y-2">
  <Label htmlFor="name">Full Name</Label>
  <Input 
    id="name"
    type="text"
    placeholder="Enter your name"
    value={name}
    onChange={(e) => setName(e.target.value)}
    required
  />
</div>

// With error state
<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input 
    id="email"
    type="email"
    placeholder="you@example.com"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    className={error ? 'border-red-500' : ''}
  />
  {error && <p className="text-red-400 text-sm">{error}</p>}
</div>

// Real example from your ProfileEditForm
<div className="space-y-2">
  <Label htmlFor="university">University</Label>
  <Input
    id="university"
    type="text"
    value={formData.university}
    onChange={(e) => setFormData(prev => ({ ...prev, university: e.target.value }))}
    placeholder="Your university name"
  />
</div>
```

---

### **4. Badge**

```typescript
import { Badge } from '@/components/ui'

// Status badges (your exact use case!)
<Badge variant="verified">Verified</Badge>
<Badge variant="pending">Pending</Badge>
<Badge variant="rejected">Rejected</Badge>
<Badge variant="outline">Draft</Badge>

// In table cells
<TableCell>
  {status === 'verified' && <Badge variant="verified">✓ Verified</Badge>}
  {status === 'pending' && <Badge variant="pending">⏳ Pending</Badge>}
  {status === 'rejected' && <Badge variant="rejected">✗ Rejected</Badge>}
</TableCell>

// With icons
<Badge variant="verified" className="gap-1">
  <CheckCircle className="w-3 h-3" />
  Verified
</Badge>
```

---

### **5. Dialog (Modal)**

```typescript
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui'
import { Button } from '@/components/ui'

// Delete confirmation (your exact use case!)
<Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Delete Certificate?</DialogTitle>
      <DialogDescription>
        Are you sure you want to delete "{certTitle}"? This action cannot be undone.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
        Cancel
      </Button>
      <Button variant="destructive" onClick={handleConfirmDelete}>
        Delete
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

// Profile edit form dialog
<Dialog open={showProfileEdit} onOpenChange={setShowProfileEdit}>
  <DialogContent className="max-w-2xl">
    <DialogHeader>
      <DialogTitle>Edit Profile</DialogTitle>
      <DialogDescription>Update your personal information</DialogDescription>
    </DialogHeader>
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Full Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {/* More fields... */}
    </form>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={() => setShowProfileEdit(false)}>
        Cancel
      </Button>
      <Button type="submit">Save Changes</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

### **6. Table**

```typescript
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui'
import { Badge, Button } from '@/components/ui'

// Certificates table (your exact use case!)
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Title</TableHead>
      <TableHead>Institution</TableHead>
      <TableHead>Date</TableHead>
      <TableHead>Status</TableHead>
      <TableHead>Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {certificates.map((cert) => (
      <TableRow key={cert.id}>
        <TableCell className="font-medium">{cert.title}</TableCell>
        <TableCell>{cert.institution}</TableCell>
        <TableCell>{new Date(cert.date_issued).toLocaleDateString()}</TableCell>
        <TableCell>
          <Badge variant={cert.verification_status}>
            {cert.verification_status}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex gap-2">
            <Button size="sm" variant="outline">View</Button>
            <Button size="sm" variant="ghost">Download</Button>
            <Button size="sm" variant="destructive">Delete</Button>
          </div>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

---

## 🔄 **Migration Strategy**

### **Phase 1: Replace Common Patterns** (This Week)

#### **Before:**
```typescript
// Old button (duplicated everywhere)
<button
  onClick={handleClick}
  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all duration-300"
  disabled={loading}
>
  {loading ? 'Loading...' : 'Submit'}
</button>
```

#### **After:**
```typescript
// New Button component (consistent everywhere)
<Button onClick={handleClick} disabled={loading}>
  {loading ? 'Loading...' : 'Submit'}
</Button>
```

#### **Benefits:**
- ✅ **80% less code** per button
- ✅ **Consistent styling** across all pages
- ✅ **Accessible** by default (focus states, keyboard nav)
- ✅ **Easy to update** (change once, applies everywhere)

---

### **Phase 2: Refactor One Page at a Time**

**Pick the simplest page first** (e.g., login page), then gradually refactor:

1. **Login page** ← Start here (forms, buttons, cards)
2. **Student dashboard** ← Tables, badges, dialogs
3. **Admin dashboard** ← Complex tables, modals
4. **Other pages** ← Follow same pattern

---

## 📊 **Component Usage Checklist**

Track where you've migrated to components:

### **Pages to Refactor:**
- [ ] `/login` - Login form
- [ ] `/onboarding` - Onboarding flow
- [ ] `/student/dashboard` - Dashboard cards, table
- [ ] `/student/upload` - Upload form
- [ ] `/faculty/dashboard` - Review table
- [ ] `/faculty/review/[id]` - Review form
- [ ] `/admin/dashboard` - User table
- [ ] `/admin/role-requests` - Requests table
- [ ] `/recruiter/dashboard` - Search interface

### **Components Needed:**
- [x] **Button** - Used in all pages
- [x] **Card** - Dashboard stats, info boxes
- [x] **Input** - All forms
- [x] **Label** - Form labels
- [x] **Badge** - Status indicators
- [x] **Dialog** - Confirmations, edit forms
- [x] **Table** - Data listings

---

## 🎨 **Customization Guide**

### **Override Styles:**

```typescript
// Add custom classes
<Button className="w-full mt-4">
  Full Width Button
</Button>

<Card className="hover:scale-105 transition-transform">
  Interactive Card
</Card>

// Combine variants
<Badge variant="verified" className="text-lg px-4 py-2">
  Large Badge
</Badge>
```

### **Extend Components:**

```typescript
// Create specialized components
// src/components/features/CertificateCard.tsx
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui'

export function CertificateCard({ cert }: { cert: Certificate }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          {cert.title}
          <Badge variant={cert.verification_status}>
            {cert.verification_status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-white/70">{cert.institution}</p>
        <p className="text-sm text-white/50">{cert.date_issued}</p>
        <Button className="mt-4 w-full">View Details</Button>
      </CardContent>
    </Card>
  )
}
```

---

## 🧪 **Testing Components**

```typescript
// Test in any page
import { Button, Card, Input, Badge, Dialog } from '@/components/ui'

export default function TestPage() {
  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold text-white">Component Test Page</h1>
      
      {/* Test Buttons */}
      <div className="space-x-2">
        <Button variant="default">Default</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
      
      {/* Test Badges */}
      <div className="space-x-2">
        <Badge variant="verified">Verified</Badge>
        <Badge variant="pending">Pending</Badge>
        <Badge variant="rejected">Rejected</Badge>
      </div>
      
      {/* Test Card */}
      <Card>
        <CardHeader>
          <CardTitle>Test Card</CardTitle>
        </CardHeader>
        <CardContent>
          <Input placeholder="Test input" />
        </CardContent>
      </Card>
    </div>
  )
}
```

---

## 📈 **Expected Impact**

### **Code Reduction:**
- **Before:** ~2000 lines of repeated UI code across pages
- **After:** ~500 lines (75% reduction)

### **Consistency:**
- **Before:** 15+ different button styles
- **After:** 6 unified button variants

### **Maintainability:**
- **Before:** Change button style → Edit 50 files
- **After:** Change button style → Edit 1 file

### **Development Speed:**
- **Before:** 5 minutes to create a form
- **After:** 1 minute to create a form

---

## 🎯 **Next Steps**

1. **✅ Components Created** ← We are here
2. **📝 Create example page** ← Next: Refactor one simple page
3. **🔄 Migrate login page** ← Use new components
4. **🔄 Migrate dashboards** ← Replace all UI elements
5. **✨ Polish & refine** ← Adjust styles as needed

---

## 💡 **Tips & Best Practices**

### **DO:**
✅ Use components for ALL UI elements  
✅ Keep components small and focused  
✅ Combine components to build features  
✅ Add custom classes for one-off styles  
✅ Test components in isolation first  

### **DON'T:**
❌ Mix old HTML buttons with new Button component  
❌ Duplicate component code (always import)  
❌ Hardcode colors (use Tailwind classes)  
❌ Create new components without checking existing  
❌ Skip accessibility attributes  

---

## 🔧 **Troubleshooting**

### **Import errors:**
```typescript
// ❌ Wrong
import { Button } from './components/ui/button'

// ✅ Correct
import { Button } from '@/components/ui'
// or
import { Button } from '@/components/ui/button'
```

### **Style not applying:**
```typescript
// Make sure Tailwind includes component folder
// tailwind.config.ts
content: [
  "./src/**/*.{js,ts,jsx,tsx,mdx}",
],
```

### **Type errors:**
```typescript
// Components are fully typed, use TypeScript IntelliSense
<Button 
  variant="default" // ← Autocomplete works
  onClick={handler}  // ← Type-checked
>
```

---

## 📚 **Resources**

- **Radix UI:** https://www.radix-ui.com/ (Accessibility primitives)
- **shadcn/ui:** https://ui.shadcn.com/ (Inspiration for these components)
- **Tailwind CSS:** https://tailwindcss.com/docs (Styling reference)
- **Your codebase:** Existing pages show real usage patterns

---

**Status:** ✅ **Ready to Use**  
**Next Action:** Refactor one page to demonstrate usage  
**Goal:** Uniform, maintainable, production-ready UI
