// Type-level fixture, typechecked by `tsc -b`. Pins `lib` >= ES2022: prototype views call `.at()` (TS2550 on ES2020).
export const last: number | undefined = [1, 2].at(-1)
