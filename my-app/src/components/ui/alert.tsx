import * as React from "react"
import { AlertCircle, CheckCircle, Info, XCircle, X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "warning" | "error" | "info"
  dismissible?: boolean
  onDismiss?: () => void
}

const variantStyles = {
  default: "bg-white/5 border-white/20 text-white",
  success: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  warning: "bg-yellow-500/10 border-yellow-500/30 text-yellow-300",
  error: "bg-red-500/10 border-red-500/30 text-red-300",
  info: "bg-blue-500/10 border-blue-500/30 text-blue-300",
}

const iconMap = {
  default: Info,
  success: CheckCircle,
  warning: AlertCircle,
  error: XCircle,
  info: Info,
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "default", dismissible = false, onDismiss, children, ...props }, ref) => {
    const Icon = iconMap[variant]
    
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          "relative w-full rounded-lg border backdrop-blur-sm p-4 transition-all",
          variantStyles[variant],
          className
        )}
        {...props}
      >
        <div className="flex items-start gap-3">
          <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1">{children}</div>
          {dismissible && (
            <button
              onClick={onDismiss}
              className="flex-shrink-0 rounded-md p-1 hover:bg-white/10 transition-colors"
              aria-label="Dismiss alert"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    )
  }
)
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm opacity-90", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
