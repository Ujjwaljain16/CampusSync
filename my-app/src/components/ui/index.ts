/**
 * CampusSync UI Components Library
 * Modern, consistent, and accessible components
 * Usage: import { Button, Card, Alert } from '@/components/ui'
 */

// CredentiVault Custom Components (cv-* design system)
export {
  FormField,
  FormLabel,
  FormInput,
  InputWrapper,
  FormError,
  FormHelper,
  type FormFieldProps,
  type FormLabelProps,
  type FormInputProps,
  type InputWrapperProps,
  type FormErrorProps,
  type FormHelperProps,
} from './form'

export {
  CVButton,
  type CVButtonProps,
} from './cv-button'

export {
  CVBadge,
  type CVBadgeProps,
} from './cv-badge'

export {
  CVAlert,
  type CVAlertProps,
} from './cv-alert'

// Buttons & Interactive
export { Button, buttonVariants, type ButtonProps } from './button'

// Layout & Containers
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from './card'

// Forms
export { Input } from './input'
export { Label } from './label'
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from './select'

// Feedback
export { Badge, badgeVariants, type BadgeProps } from './badge'
export { Alert, AlertTitle, AlertDescription } from './alert'
export { Skeleton } from './skeleton'

// Overlays
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './dialog'
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './tooltip'

// Data Display
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from './table'

// Navigation
export { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'

// User
export { Avatar, AvatarImage, AvatarFallback } from './avatar'
