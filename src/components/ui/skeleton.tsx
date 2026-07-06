import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-xl",
        className
      )}
      style={{ background: 'linear-gradient(90deg, #151A20 0%, #222A31 50%, #151A20 100%)', backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.6s ease-in-out infinite' }}
      {...props}
    />
  )
}

export { Skeleton }
