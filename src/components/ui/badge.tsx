import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  [
    "group/badge inline-flex h-[26px] w-fit shrink-0 items-center justify-center gap-1.5",
    "overflow-hidden rounded-full border border-transparent px-2.5",
    "text-[11px] font-semibold whitespace-nowrap",
    "transition-all duration-150",
    "focus-visible:ring-[3px] focus-visible:ring-canary/20 focus-visible:border-canary",
    "[&>svg]:pointer-events-none [&>svg]:size-3!",
  ].join(" "),
  {
    variants: {
      variant: {
        /* Canary / primary */
        default:
          "bg-[rgba(198,244,50,0.12)] text-canary border-[rgba(198,244,50,0.28)]",
        /* Neutral */
        secondary:
          "bg-[rgba(216,222,227,0.08)] text-geyser border-[rgba(216,222,227,0.14)]",
        /* Danger */
        destructive:
          "bg-[rgba(255,107,107,0.12)] text-danger border-[rgba(255,107,107,0.22)]",
        /* Outline ghost */
        outline:
          "border-[rgba(216,222,227,0.16)] text-geyser",
        /* Ghost muted */
        ghost:
          "text-slate hover:bg-[rgba(216,222,227,0.06)] hover:text-geyser",
        /* Link */
        link: "text-geyser underline-offset-4 hover:text-canary hover:underline",
        /* Status variants */
        success:
          "bg-[rgba(128,237,153,0.12)] text-success border-[rgba(128,237,153,0.22)]",
        warning:
          "bg-[rgba(255,209,102,0.12)] text-warning border-[rgba(255,209,102,0.22)]",
        info:
          "bg-[rgba(125,211,252,0.12)] text-info border-[rgba(125,211,252,0.22)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
