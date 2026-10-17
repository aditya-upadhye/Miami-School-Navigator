import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { DropdownMenu as Menu } from "radix-ui"
import { ChromeProvider } from "@/lib/i18n"
import { hasShellActions, ShellIdentityMenu, ShellIdentityMenuBody, type ShellActions } from "@/lib/shell-actions"

// The test env has no DOM, and Radix portals render nothing on the server: the menu's rows are rendered through the primitive's own
// (non-portalled) content, forced open, so the real rows, roles and slots are asserted. The trigger is the real component.
const persona = { name: "Albert Santalo", role: "broker", roleLabel: "Aircraft Broker", email: "albert@example.com" }
const bag: ShellActions = {
  profile: { href: "/account" },
  signOut: { href: "/sign-in" },
  about: { name: "Hangar 2", description: "Charter desk" },
  legal: [{ label: "Privacy", href: "/privacy" }, { label: "Terms", href: "/terms" }],
}

function body(over: Partial<React.ComponentProps<typeof ShellIdentityMenuBody>> = {}, dict?: Record<string, string>) {
  const actions = over.actions ?? bag
  const node = (
    <Menu.Root open modal={false}>
      <Menu.Trigger>open</Menu.Trigger>
      <Menu.Content forceMount>
        <ShellIdentityMenuBody persona={persona} actions={actions} has={hasShellActions(actions)} darkAvailable onHelp={() => {}} onAbout={() => {}} {...over} />
      </Menu.Content>
    </Menu.Root>
  )
  return renderToStaticMarkup(dict ? <ChromeProvider value={dict}>{node}</ChromeProvider> : node)
}
const texts = (html: string, role: string) => [...html.matchAll(new RegExp(`role="${role}"[^>]*>(.*?)</(?:a|div)>`, "g"))].map((m) => m[1]!.replace(/<[^>]+>/g, "").trim())

describe("ShellIdentityMenu trigger", () => {
  const html = renderToStaticMarkup(<ShellIdentityMenu persona={persona} actions={bag} data-fidelity-mask="" />)
  test("is a menu button with the initials of the persona's name", () => {
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain(">AS<")
    expect(html).toContain('aria-label="Account menu: Albert Santalo"')
    expect(html).toContain('type="button"')
  })
  test("carries the fidelity mask (gv2's IDENTITY_MASK is spread on it) only when given", () => {
    expect(html).toContain('data-fidelity-mask=""')
    expect(renderToStaticMarkup(<ShellIdentityMenu persona={persona} actions={bag} />)).not.toContain("data-fidelity-mask")
  })
  test("without a name there is no initials and the label has no name", () => {
    const anon = renderToStaticMarkup(<ShellIdentityMenu persona={null} actions={bag} />)
    expect(anon).toContain('aria-label="Account menu"')
    expect(anon).not.toContain(">AS<")
  })
  test("a persona with host-computed initials uses them", () => {
    expect(renderToStaticMarkup(<ShellIdentityMenu persona={{ name: "Albert Santalo", initials: "AX" }} />)).toContain(">AX<")
  })
})

describe("ShellIdentityMenuBody", () => {
  test("header: name, role label and e-mail in their slots, never the app name", () => {
    const h = body()
    expect(h).toMatch(/data-slot="persona-name"[^>]*>Albert Santalo</)
    expect(h).toMatch(/data-slot="persona-role"[^>]*>Aircraft Broker</)
    expect(h).toMatch(/data-slot="persona-email"[^>]*>albert@example\.com</)
    expect(h).not.toContain("Signed in")
    expect(body({ persona: { name: "Bea", role: "buyer" } })).toMatch(/data-slot="persona-role"[^>]*>buyer</)
    expect(body({ persona: { name: "Bea" } })).not.toContain("persona-email")
  })

  test("rows in order: My account, Theme, Help, About, Sign out (items are menuitems)", () => {
    const h = body()
    const labels = texts(h, "menuitem")
    expect(labels).toEqual(["My account", "Theme Light", "Help", "About Hangar 2", "Sign out", "Privacy", "Terms"])
    expect(h).toContain('href="/account"')
    expect(h).toContain('href="/sign-in"')
  })

  test("Theme shows the current value and only when dark mode exists", () => {
    expect(body()).toContain("Theme")
    expect(body({ darkAvailable: false })).not.toContain("Theme")
  })

  test("rows are gated by the bag and the flags", () => {
    const h = body({ actions: { signOut: { href: "/out" } }, has: { search: false, create: false, notifications: false, help: false, about: false, profile: false, signOut: true } })
    expect(texts(h, "menuitem")).toEqual(["Theme Light", "Sign out"])
    expect(h).not.toContain("My account")
    expect(h).not.toContain("identity-menu-footer")
    const noOut = body({ actions: { profile: { href: "/a" } } })
    expect(noOut).not.toContain("Sign out")
  })

  test("Sign out is neutral by default and destructive only through the one prop", () => {
    const tagOf = (h: string) => h.match(/<a [^>]*href="\/sign-in"[^>]*>/)?.[0] ?? ""
    expect(tagOf(body())).toContain('data-variant="default"')
    expect(tagOf(body())).not.toContain('data-variant="destructive"')
    expect(tagOf(body({ signOutVariant: "destructive" }))).toContain('data-variant="destructive"')
  })

  test("Sign out is the last row before the legal footer; the footer holds exactly actions.legal as links", () => {
    const h = body()
    const out = h.indexOf("Sign out")
    const footer = h.indexOf('data-slot="identity-menu-footer"')
    expect(out).toBeGreaterThan(0)
    expect(footer).toBeGreaterThan(out)
    const foot = h.slice(footer)
    expect(foot).toContain('href="/privacy"')
    expect(foot).toContain('href="/terms"')
    expect(h.slice(0, footer)).not.toContain("Privacy")
    expect(h).toContain('role="group"')
  })

  test("optional slots draw rows only when the bag carries them", () => {
    const h = body({ actions: { ...bag, billing: { href: "/billing" }, language: { href: "/lang", value: "English" }, preferences: { href: "/prefs" }, admin: { href: "/admin" } } })
    const labels = texts(h, "menuitem")
    expect(labels.slice(0, 5)).toEqual(["My account", "Preferences", "Billing", "Theme Light", "LanguageEnglish"])
    expect(labels).toContain("Admin")
    expect(body()).not.toContain("Billing")
    expect(body()).not.toContain("Language")
  })

  test("copy goes through the chrome dictionary (Spanish), keys it lacks stay English", () => {
    const h = body({}, { "kit.shell.myAccount": "Mi cuenta", "kit.shell.signOut": "Cerrar sesión", "kit.shell.aboutTitle": "Acerca de {name}" })
    expect(h).toContain("Mi cuenta")
    expect(h).toContain("Cerrar sesión")
    expect(h).toContain("Acerca de Hangar 2")
    expect(h).toContain("Help")
  })

  test("no literal colours in the rows (tokens only)", () => {
    expect(body()).not.toMatch(/(#[0-9a-fA-F]{3,8}\b|rgb\(|bg-\[|text-\[#)/)
  })
})
