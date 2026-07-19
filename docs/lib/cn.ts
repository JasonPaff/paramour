import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** clsx + tailwind-merge: conditional classes with last-wins conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
