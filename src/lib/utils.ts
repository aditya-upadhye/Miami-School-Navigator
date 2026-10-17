import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The theme contract adds semantic radius / shadow names (`rounded-control|card|modal|badge`, `shadow-card|float`). tailwind-merge
// does not know them, so without this a caller's `rounded-[10px]` or `shadow-none` would NOT replace the component's own
// `rounded-control` / `shadow-card` (both stay, and Tailwind's alphabetical output order lets the semantic one win over `rounded-3xl`,
// `rounded-4xl` and `rounded-[…]`).
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ['control', 'card', 'modal', 'badge'],
      shadow: ['card', 'float'],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
