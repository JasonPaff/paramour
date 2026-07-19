"use client";

import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Labeled control wrapper — the label is part of the accessible name. */
export function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-fd-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 rounded-md border border-fd-border bg-fd-background px-2 text-sm text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fd-ring",
        className,
      )}
      {...props}
    />
  );
}

export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-8 w-full rounded-md border border-fd-border bg-fd-background px-2 font-mono text-sm text-fd-foreground placeholder:text-fd-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fd-ring",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Editor for a list of wire-form strings — one text input per element. Used
 * for `p.array` values on the encode pane and for an array key's `.catch()`
 * fallback: both are honestly lists of per-key wire values.
 */
export function WireListInput({
  label,
  onChange,
  values,
}: {
  label: string;
  onChange: (values: string[]) => void;
  values: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      {values.map((value, index) => (
        <div className="flex items-center gap-1" key={index}>
          <TextInput
            aria-label={`${label} value ${String(index + 1)}`}
            onChange={(event) => {
              onChange(values.toSpliced(index, 1, event.target.value));
            }}
            value={value}
          />
          <Button
            aria-label={`Remove ${label} value ${String(index + 1)}`}
            onClick={() => {
              onChange(values.toSpliced(index, 1));
            }}
            size="icon"
            variant="ghost"
          >
            ✕
          </Button>
        </div>
      ))}
      <Button
        className="self-start"
        onClick={() => {
          onChange([...values, ""]);
        }}
        size="xs"
        variant="ghost"
      >
        + add value
      </Button>
    </div>
  );
}
