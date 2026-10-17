/**
 * Status tones from the design system (tables-and-lists guideline 7). The colors live in
 * `--status-*` tokens (theme-contract.css), so both modes and every theme stay consistent.
 *   ok = done, info = in progress, pending = waiting (on anyone), warn = at risk / needs attention,
 *   danger = failed or blocked, neutral = draft, not started, archived.
 */
export type StatusTone = 'ok' | 'info' | 'pending' | 'warn' | 'danger' | 'neutral'

export const STATUS_TONES: readonly StatusTone[] = ['ok', 'info', 'pending', 'warn', 'danger', 'neutral']

