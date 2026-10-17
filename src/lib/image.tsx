import type { CSSProperties, HTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/utils"

// The one way a screen shows an image. With `src` it is the record's own
// photograph; without one it is an IMAGE INTENT — a hatched ground of the same
// shape with a one-line brief of the real image that belongs there, so a page
// never renders a broken <img> and a generator can fill the slot later.
// `tone`: "light" (default) | "dark" | "accent" sets the intent's ground.
// `children` render on top in both cases (a scrim, a caption, a mark).
export type PictureTone = "light" | "dark" | "accent"

const TONE: Record<PictureTone, string> = {
  light: "bg-surface-sunken text-text-muted [background-image:repeating-linear-gradient(135deg,transparent_0_9px,var(--color-border)_9px_10px)]",
  dark: "bg-foreground text-background [background-image:repeating-linear-gradient(135deg,transparent_0_9px,color-mix(in_oklch,var(--color-background)_14%,transparent)_9px_10px)]",
  accent: "bg-primary text-primary-foreground [background-image:repeating-linear-gradient(135deg,transparent_0_9px,color-mix(in_oklch,var(--color-primary-foreground)_12%,transparent)_9px_10px)]",
}

export interface PictureProps extends Omit<HTMLAttributes<HTMLElement>, "style"> {
  src?: string | null
  alt?: string
  intent?: string
  ratio?: number
  tone?: PictureTone
  className?: string
  imgClassName?: string
  style?: CSSProperties
  children?: ReactNode
}

export function Picture({ src, alt, intent, ratio = 16 / 9, tone = "light", className, imgClassName, children, style, ...rest }: PictureProps) {
  const brief = intent || alt || ""
  return (
    <figure
      data-slot="picture"
      data-intent={src ? undefined : "true"}
      className={cn("relative isolate w-full overflow-hidden", src ? "bg-surface-sunken" : TONE[tone] ?? TONE.light, className)}
      // apg spreads `...rest` AFTER style, so a caller's `style` replaces the aspect ratio; kept as is.
      style={style ?? { aspectRatio: String(ratio) }}
      {...rest}
    >
      {src ? (
        <img src={src} alt={alt || brief} loading="lazy" decoding="async" className={cn("absolute inset-0 h-full w-full object-cover", imgClassName)} />
      ) : brief ? (
        <figcaption className="absolute inset-x-0 bottom-0 z-10 truncate px-3 py-1.5 type-mono-id uppercase tracking-[0.06em] opacity-80" aria-label={`Image: ${brief}`}>
          {brief}
        </figcaption>
      ) : null}
      {children}
    </figure>
  )
}
