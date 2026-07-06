import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap",
    "border border-transparent bg-clip-padding text-sm font-semibold",
    "transition-all duration-200 ease-out outline-none select-none",
    "focus-visible:ring-4 focus-visible:ring-canary/14 focus-visible:border-canary/60",
    "active:not-aria-[haspopup]:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/20",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        /* Primary — canary CTA */
        default:
          "bg-canary text-bunker font-bold hover:bg-canary-hover hover:-translate-y-px active:bg-canary-active active:translate-y-0",
        /* Outline */
        outline:
          "border-geyser/20 bg-transparent text-geyser hover:bg-surface hover:border-geyser/30 aria-expanded:bg-surface",
        /* Secondary / surface */
        secondary:
          "bg-surface text-geyser border-[rgba(216,222,227,0.10)] hover:bg-surface-elevated hover:border-[rgba(216,222,227,0.18)] aria-expanded:bg-surface-elevated",
        /* Ghost */
        ghost:
          "text-slate hover:bg-surface hover:text-geyser aria-expanded:bg-surface aria-expanded:text-geyser",
        /* Destructive */
        destructive:
          "bg-[rgba(255,107,107,0.12)] text-danger border-[rgba(255,107,107,0.22)] hover:bg-[rgba(255,107,107,0.20)] focus-visible:ring-danger/20",
        /* Link */
        link: "text-geyser underline-offset-4 hover:text-canary hover:underline",
      },
      size: {
        default: "h-11 gap-2 rounded-xl px-[18px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-lg px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 rounded-xl px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 rounded-xl px-5 text-base",
        icon:    "size-11 rounded-xl",
        "icon-xs": "size-7 rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9 rounded-xl [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-12 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
