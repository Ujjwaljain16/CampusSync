# 🚀 CampusSync Design System - Quick Reference Card

## 🎨 Colors (From Your Logo)

```tsx
// Primary Blue
bg-primary-500        // #3B82F6
text-primary-500
border-primary-500

// Secondary Green
bg-secondary-500      // #10B981
text-secondary-500
border-secondary-500

// Brand Gradient
className="bg-gradient-to-r from-blue-500 to-emerald-500"
className="bg-gradient-to-r from-primary-500 to-secondary-500"
```

---

## 📦 Component Imports

```tsx
// UI Components
import {
  Button, Card, Input, Label, Badge,
  Dialog, Table, Select, Alert, Tooltip,
  Avatar, Skeleton, Tabs
} from '@/components/ui';

// Layout
import {
  Header, Footer, PageHeader,
  Container, DashboardLayout
} from '@/components/layout';

// Icons (NO EMOJIS!)
import { Shield, User, Star, CheckCircle } from 'lucide-react';
```

---

## 🎯 Common Patterns

### Page Structure
```tsx
<Container size="lg">
  <PageHeader
    title="Page Title"
    description="Description"
    icon={<Shield className="w-8 h-8 text-blue-300" />}
    actions={<Button>Action</Button>}
  />
  
  {/* Content */}
</Container>
```

### Glass Card
```tsx
<Card className="bg-white/5 backdrop-blur-xl border-white/10 p-6">
  Content
</Card>
```

### Status Badge with Icon
```tsx
<Badge variant="success" className="flex items-center gap-1">
  <CheckCircle className="w-3 h-3" />
  Verified
</Badge>
```

### Button with Icon
```tsx
<Button className="bg-gradient-to-r from-blue-500 to-emerald-500">
  <Upload className="w-4 h-4" />
  Upload
</Button>
```

---

## 🎨 Icon Replacements

```tsx
// NO EMOJIS! Use these instead:
import {
  // Status
  CheckCircle,    // ✅
  XCircle,        // ❌
  Clock,          // ⏰
  AlertCircle,    // ⚠️
  
  // Actions
  Upload,         // ⬆️
  Download,       // ⬇️
  Eye,            // 👁️
  Trash2,         // 🗑️
  Edit,           // ✏️
  
  // Common
  Star,           // ⭐
  Award,          // 🏆
  Shield,         // 🛡️
  User,           // 👤
  GraduationCap,  // 🎓
} from 'lucide-react';
```

---

## 🎯 Variants

### Button
```tsx
variant="default"    // Primary blue
variant="destructive" // Red
variant="outline"    // Border only
variant="secondary"  // Gray
variant="ghost"      // Transparent
variant="link"       // Text link
```

### Badge
```tsx
variant="default"    // Gray
variant="success"    // Green
variant="warning"    // Yellow
variant="error"      // Red
variant="info"       // Blue
```

### Alert
```tsx
variant="default"    // Gray
variant="success"    // Green
variant="warning"    // Yellow
variant="error"      // Red
variant="info"       // Blue
```

---

## 📏 Sizes

### Container
```tsx
size="sm"   // max-w-3xl
size="md"   // max-w-5xl
size="lg"   // max-w-6xl (default)
size="xl"   // max-w-7xl
size="full" // max-w-full
```

### Button
```tsx
size="sm"      // Small
size="default" // Medium
size="lg"      // Large
size="icon"    // Square icon button
```

---

## 🎨 Glass Morphism

```tsx
// Standard glass effect
className="bg-white/5 backdrop-blur-xl border border-white/10"

// Hover effect
className="hover:bg-white/10 transition-colors"

// With gradient
className="bg-gradient-to-br from-blue-500/10 to-emerald-500/10 backdrop-blur-xl border-white/10"
```

---

## 🌈 Gradients

```tsx
// Text gradient
className="bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent"

// Background gradient
className="bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900"

// Button gradient
className="bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600"
```

---

## 📱 Responsive

```tsx
// Mobile first
className="text-base md:text-lg lg:text-xl"
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
className="px-4 sm:px-6 lg:px-8"
```

---

## ⚡ Quick Tips

1. **Always use icons, never emojis**
2. **Use design tokens (primary-500, secondary-500)**
3. **Glass morphism for cards** (`bg-white/5 backdrop-blur-xl`)
4. **Brand gradient for CTAs** (`from-blue-500 to-emerald-500`)
5. **Responsive first** (mobile → tablet → desktop)
6. **Consistent spacing** (use Tailwind's spacing scale)

---

## 🚫 Don't Do This

```tsx
// ❌ WRONG
<div>✅ Verified</div>
<button style={{ background: 'red' }}>Click</button>
<div className="bg-purple-900">Old color</div>

// ✅ CORRECT
<div><CheckCircle className="w-4 h-4 text-emerald-400" /> Verified</div>
<Button variant="destructive">Click</Button>
<div className="bg-gradient-to-r from-primary-500 to-secondary-500">New color</div>
```

---

**Print this out or keep it handy while coding! 📌**
