/**
 * CampusSync UI Components Library (cv-* design system)
 * Usage: import { CVButton, CVAlert, FormField } from '@/components/ui'
 */

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
  CVAlert,
  type CVAlertProps,
} from './cv-alert'

// Toast Notifications
export {
  ToastProvider,
  useToast,
  toast,
  type ToastProps,
  type ToastVariant,
} from './toast'
