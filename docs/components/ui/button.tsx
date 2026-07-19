import type { ComponentProps } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

/**
 * The docs site's one button primitive (plan-docs-milestone-5 decision 4):
 * hand-rolled on Tailwind + fumadocs theme tokens, variants via cva.
 */
export function Button({
  className,
  size,
  variant,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      className={cn(buttonVariants({ size, variant }), className)}
      type="button"
      {...props}
    />
  );
}

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring disabled:pointer-events-none disabled:opacity-50",
  {
    defaultVariants: { size: "sm", variant: "outline" },
    variants: {
      size: {
        icon: "size-7 text-sm",
        sm: "h-8 px-3 text-sm",
        xs: "h-6 px-2 text-xs",
      },
      variant: {
        ghost:
          "text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground",
        outline:
          "border border-fd-border bg-fd-secondary/50 text-fd-secondary-foreground hover:bg-fd-accent hover:text-fd-accent-foreground",
        primary:
          "bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/90",
      },
    },
  },
);
