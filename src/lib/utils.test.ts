import { test, expect } from "bun:test"
import { cn } from "./utils"
// The semantic radius / shadow classes of the theme contract must merge like the stock ones, or a caller's override would lose to them.
test("cn merges rounded-control|card|modal|badge and shadow-card|float with the stock radius / shadow classes", () => {
  expect(cn("rounded-control","rounded-[10px]")).toBe("rounded-[10px]")
  expect(cn("rounded-[10px]","rounded-control")).toBe("rounded-control")
  expect(cn("rounded-control","rounded-4xl")).toBe("rounded-4xl")
  expect(cn("rounded-t-card","rounded-t-none")).toBe("rounded-t-none")
  expect(cn("rounded-modal","rounded-none")).toBe("rounded-none")
  expect(cn("shadow-card","shadow-none")).toBe("shadow-none")
  expect(cn("shadow-float","shadow-md")).toBe("shadow-md")
  expect(cn("rounded-badge","rounded-full")).toBe("rounded-full")
  expect(cn("rounded-l-control","rounded-l-none rounded-r-control")).toBe("rounded-l-none rounded-r-control")
  expect(cn("h-(--control-md)","h-10")).toBe("h-10")
  expect(cn("shadow-card ring-1","ring-0")).toBe("shadow-card ring-0")
  expect(cn("rounded-card shadow-card","rounded-lg shadow-lg")).toBe("rounded-lg shadow-lg")
})
