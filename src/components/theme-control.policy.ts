// Pure rules of ThemeControl, kept apart from React so they are unit-testable without a DOM.

export type ThemeValue = 'light' | 'dark' | 'system'

/** Albert PRO.9: exactly these three options, in this order. */
export const THEME_VALUES: readonly ThemeValue[] = ['light', 'dark', 'system']

export type ThemeControlVariant =
  | 'segmented-icons'
  | 'segmented-labels'
  | 'preview-cards'
  | 'select'
  | 'submenu'
  | 'radio-items'

export const THEME_CONTROL_VARIANTS: readonly ThemeControlVariant[] = [
  'segmented-icons',
  'segmented-labels',
  'preview-cards',
  'select',
  'submenu',
  'radio-items',
]

/** Variants that show the "System · following your device (Dark)" caption by default (guideline 8.3 / 8.4). */
export function hasDefaultCaption(variant: ThemeControlVariant): boolean {
  return variant === 'segmented-icons' || variant === 'preview-cards'
}

/** The mode the OS currently asks for; what "System" resolves to. */
export function resolveSystem(prefersDark: boolean): 'light' | 'dark' {
  return prefersDark ? 'dark' : 'light'
}

export function isThemeValue(v: unknown): v is ThemeValue {
  return THEME_VALUES.includes(v as ThemeValue)
}
