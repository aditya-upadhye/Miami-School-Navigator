"use client"

import * as React from "react"
import { Direction } from "radix-ui"

type DirectionProviderProps = {
  dir?: React.ComponentProps<typeof Direction.DirectionProvider>["dir"]
  direction?: React.ComponentProps<typeof Direction.DirectionProvider>["dir"]
  children?: React.ReactNode
}

function DirectionProvider({
  dir,
  direction,
  children
}: DirectionProviderProps) {
  return (
    <Direction.DirectionProvider dir={direction ?? dir ?? "ltr"}>
      {children}
    </Direction.DirectionProvider>
  )
}

const useDirection = Direction.useDirection

export { DirectionProvider, useDirection }
export type { DirectionProviderProps }
