import * as React from "react"
import { cn } from "@/lib/utils"

const Skeleton = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "animate-pulse rounded-lg bg-white/5 backdrop-blur-sm",
        className
      )}
      {...props}
    />
  )
})
Skeleton.displayName = "Skeleton"

export { Skeleton }
