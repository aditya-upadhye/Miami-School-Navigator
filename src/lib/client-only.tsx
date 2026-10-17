import { useEffect, useState, type ReactNode } from "react"

export interface ClientOnlyProps {
  fallback?: ReactNode
  children?: ReactNode | (() => ReactNode)
}

// Renders `children` only in the browser after mount; the server and the first
// client render show `fallback`, so a page can hold a map or a 3D scene and still
// be a static, hydratable HTML file.
export function ClientOnly({ fallback = null, children }: ClientOnlyProps) {
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- apg's mount flag: the first client render shows `fallback`, as the server does
  useEffect(() => { setMounted(true) }, [])
  return <>{mounted ? (typeof children === "function" ? children() : children) : fallback}</>
}
