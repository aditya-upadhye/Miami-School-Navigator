import { describe, expect, test } from "bun:test"
import { join } from "node:path"

// ARCH-3018: a dialog opened from the identity menu (About, Help) must not leave the page stuck. Real DOM, real Radix, in a child process (see the fixture).
function observe(): Record<string, unknown> {
  const p = Bun.spawnSync([process.execPath, join(import.meta.dir, "shell-identity-menu.dom.fixture.tsx")], { stdout: "pipe", stderr: "pipe" })
  const line = p.stdout.toString().split("\n").find((l) => l.startsWith("RESULT "))
  if (p.exitCode !== 0 || !line) throw new Error(`fixture failed (${p.exitCode}): ${p.stderr.toString().slice(0, 800)} ${p.stdout.toString().slice(0, 400)}`)
  return JSON.parse(line.slice("RESULT ".length)) as Record<string, unknown>
}

describe("ShellIdentityMenu in a DOM", () => {
  const r = observe()
  test("the menu opens from the keyboard and its Language row is named \"Language: English\", the visible value hidden from the name", () => {
    expect(r.menuOpen).toBe(true)
    expect(r.languageName).toBe("Language: English")
    expect(r.languageValueHidden).toBe("English")
  })
  test("About: the menu closes, the dialog opens and takes the focus", () => {
    expect(r.menuClosed).toBe(true)
    expect(r.dialogOpen).toBe(true)
    expect(String(r.dialogText)).toContain("About Hangar 2")
    expect(r.focusInDialog).toBe(true)
  })
  test("closing the dialog leaves nothing stuck: body takes pointer events again and the focus is back on the avatar button", () => {
    expect(r.dialogClosed).toBe(true)
    expect(r.bodyPointerEvents).toBe("")
    expect(r.focusOnTrigger).toBe(true)
  })
})
