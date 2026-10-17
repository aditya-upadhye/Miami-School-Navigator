import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
// @ts-expect-error plain JS module (JSDoc-typed), no declaration files on purpose
import { boundariesConfig } from "./config.js";

const REPO = resolve(import.meta.dir, "..", "..");
const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "archie-boundaries-"));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

/** Lint a fixture tree with ONLY the boundaries config; returns "<file>: <ruleId>" per violation. */
async function violations(files: Record<string, string>): Promise<string[]> {
  const root = makeTree(files);
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ["**/*.{ts,tsx,js,jsx}"], languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } } },
      ...boundariesConfig({ rootPath: root }),
    ],
  });
  const results = await eslint.lintFiles(["src/**/*.{ts,tsx,js,jsx}"]);
  return results
    .flatMap((r) => r.messages.map((m) => `${r.filePath.slice(root.length + 1)}: ${m.ruleId ?? `parse-error ${m.message}`}`))
    .sort();
}

const DOMAIN = { "src/domain/booking.ts": `export interface Booking { id: string }` };
const BAD = (file: string) => `${file}: boundaries/dependencies`;

describe("L37 hexagonal boundaries", () => {
  test("presentation -> infrastructure fails (alias and relative)", async () => {
    const v = await violations({
      ...DOMAIN,
      "src/infrastructure/memory/store.ts": `export const store = 1;`,
      "src/presentation/containers/a.container.tsx": `import { store } from "@/infrastructure/memory/store"; export const a = store;`,
      "src/presentation/containers/b.container.tsx": `import { store } from "../../infrastructure/memory/store"; export const b = store;`,
    });
    expect(v).toEqual([BAD("src/presentation/containers/a.container.tsx"), BAD("src/presentation/containers/b.container.tsx")]);
  });

  test("every presentation sub-zone is covered: views, layout, layouts, chrome, components/domain", async () => {
    const files: Record<string, string> = { "src/infrastructure/memory/store.ts": `export const store = 1;` };
    const zones = ["views/x.view.tsx", "layout/L.tsx", "layouts/L.tsx", "chrome/c.tsx", "components/domain/d.tsx", "containers/c.tsx"];
    for (const z of zones) files[`src/presentation/${z}`] = `import { store } from "@/infrastructure/memory/store"; export const z = store;`;
    const v = await violations(files);
    expect(v.sort()).toEqual(zones.map((z) => BAD(`src/presentation/${z}`)).sort());
  });

  test("presentation -> application, domain, ui-plane, i18n passes", async () => {
    const v = await violations({
      ...DOMAIN,
      "src/application/view-models/x.vm.ts": `import type { Booking } from "@/domain/booking"; export type X = Booking;`,
      "src/lib/utils.ts": `export const cn = 1;`,
      "src/components/ui/button.tsx": `export const Button = 1;`,
      "src/hooks/use-thing.ts": `export const useThing = 1;`,
      "src/i18n/config.ts": `export const i18n = 1;`,
      "src/presentation/navigation.ts": `export const routes = {};`,
      "src/presentation/views/x.view.tsx": `
        import { routes } from "@/presentation/navigation";
        import type { X } from "@/application/view-models/x.vm";
        import type { Booking } from "@/domain/booking";
        import { cn } from "@/lib/utils";
        import { Button } from "@/components/ui/button";
        import { useThing } from "@/hooks/use-thing";
        import { i18n } from "@/i18n/config";
        import React from "react";
        export const v = [routes, cn, Button, useThing, i18n, React] as unknown as [X, Booking];`,
    });
    expect(v).toEqual([]);
  });

  test("domain -> react fails; domain -> other layers fails; domain -> domain passes", async () => {
    const v = await violations({
      ...DOMAIN,
      "src/domain/ok.ts": `import type { Booking } from "./booking"; export type O = Booking;`,
      "src/domain/a.ts": `import React from "react"; export const a = React;`,
      "src/domain/b.ts": `import axios from "axios"; export const b = axios;`,
      "src/domain/c.ts": `import { x } from "@/application/x"; export const c = x;`,
      "src/domain/d.ts": `import { cn } from "@/lib/utils"; export const d = cn;`,
      "src/domain/e.ts": `import { gql } from "graphql-tag"; export const e = gql;`,
      "src/domain/f.ts": `import { z } from "@archie/js-sdk"; export const f = z;`,
      "src/application/x.ts": `export const x = 1;`,
      "src/lib/utils.ts": `export const cn = 1;`,
    });
    expect(v).toEqual(["a", "b", "c", "d", "e", "f"].map((n) => BAD(`src/domain/${n}.ts`)));
  });

  test("application -> domain passes; application -> presentation/infrastructure/app fails", async () => {
    const v = await violations({
      ...DOMAIN,
      "src/application/ok.ts": `import type { Booking } from "@/domain/booking"; export type O = Booking;`,
      "src/application/p.ts": `import { p } from "@/presentation/p"; export const a = p;`,
      "src/application/i.ts": `import { i } from "@/infrastructure/memory/m"; export const b = i;`,
      "src/application/r.ts": `import { r } from "@/app/root"; export const c = r;`,
      "src/presentation/p.ts": `export const p = 1;`,
      "src/infrastructure/memory/m.ts": `export const i = 1;`,
      "src/app/root.ts": `export const r = 1;`,
    });
    expect(v).toEqual(["i", "p", "r"].map((n) => BAD(`src/application/${n}.ts`)));
  });

  test("infrastructure -> domain passes; infrastructure -> application/presentation fails", async () => {
    const v = await violations({
      ...DOMAIN,
      "src/infrastructure/memory/ok.ts": `import type { Booking } from "@/domain/booking"; export type O = Booking;`,
      "src/infrastructure/memory/a.ts": `import { x } from "@/application/x"; export const a = x;`,
      "src/infrastructure/archie/p.ts": `import { p } from "@/presentation/p"; export const b = p;`,
      "src/application/x.ts": `export const x = 1;`,
      "src/presentation/p.ts": `export const p = 1;`,
    });
    expect(v).toEqual([BAD("src/infrastructure/archie/p.ts"), BAD("src/infrastructure/memory/a.ts")]);
  });

  test("infrastructure/archie -> @archie/react-sdk and @archie/js-sdk passes", async () => {
    const v = await violations({
      "src/infrastructure/archie/transport.ts": `import { useArchieClient, useQuery } from "@archie/react-sdk"; import { createClient } from "@archie/js-sdk"; export const t = [useArchieClient, useQuery, createClient];`,
    });
    expect(v).toEqual([]);
  });

  test("infrastructure/memory -> @archie/react-sdk fails", async () => {
    const v = await violations({
      "src/infrastructure/memory/store.ts": `import { useArchieClient } from "@archie/react-sdk"; export const s = useArchieClient;`,
    });
    expect(v).toEqual([BAD("src/infrastructure/memory/store.ts")]);
  });

  test("presentation -> @archie/* fails (SDK is not a view dependency)", async () => {
    const v = await violations({
      "src/presentation/containers/c.tsx": `import { useArchieClient } from "@archie/react-sdk"; export const c = useArchieClient;`,
    });
    expect(v).toEqual([BAD("src/presentation/containers/c.tsx")]);
  });

  describe("composition root (src/app): SDK by symbol", () => {
    test("AuthGuard and useArchieClient pass; `import type` from js-sdk passes", async () => {
      const v = await violations({
        "src/app/auth-guard.tsx": `export { AuthGuard } from "@archie/react-sdk";`,
        "src/app/composition-root.tsx": `import { useArchieClient, AuthGuard as AG } from "@archie/react-sdk"; import type { IGraphQLModule } from "@archie/js-sdk"; export const r = [useArchieClient, AG] as unknown as IGraphQLModule;`,
      });
      expect(v).toEqual([]);
    });

    test("any other SDK symbol fails", async () => {
      const v = await violations({
        "src/app/a.tsx": `import { useQuery } from "@archie/react-sdk"; export const a = useQuery;`,
        "src/app/b.tsx": `import { AuthGuard, useMutation } from "@archie/react-sdk"; export const b = [AuthGuard, useMutation];`,
        "src/app/c.tsx": `import { createClient } from "@archie/js-sdk"; export const c = createClient;`,
      });
      expect(v).toEqual([BAD("src/app/a.tsx"), BAD("src/app/b.tsx"), BAD("src/app/c.tsx")]);
    });

    test("forms that name no symbol cannot sneak the SDK in (namespace, default, export *, dynamic import)", async () => {
      const v = await violations({
        "src/app/ns.tsx": `import * as sdk from "@archie/react-sdk"; export const a = sdk;`,
        "src/app/def.tsx": `import sdk from "@archie/react-sdk"; export const a = sdk;`,
        "src/app/all.tsx": `export * from "@archie/react-sdk";`,
        "src/app/dyn.tsx": `export const a = import("@archie/react-sdk");`,
      });
      expect(v.sort()).toEqual(["all", "def", "dyn", "ns"].map((n) => BAD(`src/app/${n}.tsx`)));
    });

    test("app may import every layer", async () => {
      const v = await violations({
        ...DOMAIN,
        "src/application/x.ts": `export const x = 1;`,
        "src/presentation/p.ts": `export const p = 1;`,
        "src/infrastructure/memory/m.ts": `export const m = 1;`,
        "src/infrastructure/archie/a.ts": `export const a = 1;`,
        "src/app/root.tsx": `import "@/domain/booking"; import "@/application/x"; import "@/presentation/p"; import "@/infrastructure/memory/m"; import "@/infrastructure/archie/a"; export const r = 1;`,
      });
      expect(v).toEqual([]);
    });
  });

  test("ui-plane, i18n, legacy-gen, template-root and unknown folders can NOT import the SDK", async () => {
    const files: Record<string, string> = {};
    const sdk = `import { useArchieClient } from "@archie/react-sdk"; export const x = useArchieClient;`;
    const bad = ["src/lib/sdk.ts", "src/i18n/x.ts", "src/foo.ts", "src/features/bridge.ts", "src/lib/gen/role-nav.ts", "src/hooks/h.ts", "src/components/kit/k.tsx", "src/App.tsx"];
    for (const f of bad) files[f] = sdk;
    const v = await violations(files);
    expect(v).toEqual(bad.map(BAD).sort());
  });

  test("laundering: application importing a lib file that holds the SDK fails; presentation importing an unknown folder fails", async () => {
    const v = await violations({
      "src/lib/sdk.ts": `import { useArchieClient } from "@archie/react-sdk"; export const x = useArchieClient;`,
      "src/features/bridge.ts": `export const b = 1;`,
      "src/application/vm.ts": `import { x } from "@/lib/sdk"; export const v = x;`,
      "src/presentation/p.tsx": `import { b } from "@/features/bridge"; export const p = b;`,
      "src/domain/d.ts": `import { b } from "@/features/bridge"; export const d = b;`,
    });
    expect(v).toEqual([BAD("src/application/vm.ts"), BAD("src/domain/d.ts"), BAD("src/lib/sdk.ts"), BAD("src/presentation/p.tsx")]);
  });

  test("template planes never reach a layer; unknown folders and root files never reach infrastructure", async () => {
    const v = await violations({
      "src/infrastructure/memory/m.ts": `export const m = 1;`,
      "src/application/a.ts": `export const a = 1;`,
      "src/presentation/p.ts": `export const p = 1;`,
      "src/app/r.ts": `export const r = 1;`,
      "src/lib/a.ts": `import { m } from "@/infrastructure/memory/m"; export const x = m;`,
      "src/lib/b.ts": `import { a } from "@/application/a"; export const x = a;`,
      "src/lib/gen/c.ts": `import { p } from "@/presentation/p"; export const x = p;`,
      "src/i18n/d.ts": `import { r } from "@/app/r"; export const x = r;`,
      "src/features/e.ts": `import { m } from "@/infrastructure/memory/m"; export const x = m;`,
      "src/App.tsx": `import { m } from "@/infrastructure/memory/m"; export const x = m;`,
      // allowed: template files may use presentation / app, ui-plane may import ui-plane
      "src/routes.config.tsx": `import { p } from "@/presentation/p"; import { r } from "@/app/r"; export const x = [p, r];`,
      "src/lib/ok.ts": `import { a } from "@/lib/gen/ok2"; export const x = a;`,
      "src/lib/gen/ok2.ts": `export const a = 1;`,
    });
    expect(v).toEqual(["src/App.tsx", "src/features/e.ts", "src/i18n/d.ts", "src/lib/a.ts", "src/lib/b.ts", "src/lib/gen/c.ts"].map(BAD));
  });

  test("main.tsx mounts exactly createClient / ArchieProvider / ArchieDevToolProvider and nothing else", async () => {
    const ok = await violations({
      "src/main.tsx": `import { ArchieDevToolProvider } from "@archie/devtools/client"; import { createClient, ArchieProvider } from "@archie/react-sdk"; export const m = [ArchieDevToolProvider, createClient, ArchieProvider];`,
    });
    expect(ok).toEqual([]);
    const bad = await violations({
      "src/main.tsx": `import { createClient, useQuery } from "@archie/react-sdk"; import * as sdk from "@archie/js-sdk"; export const m = [createClient, useQuery, sdk];`,
    });
    expect(bad).toEqual([BAD("src/main.tsx"), BAD("src/main.tsx")]);
  });

  test("Kit-D classification: src/screens is presentation, components/kit + styles/kitd are ui-plane, lib/gen is legacy-gen", async () => {
    const v = await violations({
      "src/infrastructure/memory/m.ts": `export const m = 1;`,
      "src/application/view-models/x.vm.ts": `export type X = 1;`,
      "src/lib/gen/role-nav.ts": `export const n = 1;`,
      "src/components/kit/components/index.ts": `export const K = 1;`,
      "src/screens/ok.tsx": `import type { X } from "@/application/view-models/x.vm"; import { K } from "@/components/kit/components"; import { n } from "@/lib/gen/role-nav"; export const s = [K, n] as unknown as X;`,
      "src/screens/bad.tsx": `import { m } from "@/infrastructure/memory/m"; export const s = m;`,
      "src/screens/sdk.tsx": `import { useArchieClient } from "@archie/react-sdk"; export const s = useArchieClient;`,
    });
    expect(v).toEqual([BAD("src/screens/bad.tsx"), BAD("src/screens/sdk.tsx")]);
  });

  test("src/app: a re-export ALIAS cannot launder another SDK symbol as an allowed one", async () => {
    const v = await violations({
      "src/app/alias.tsx": `export { useQuery as AuthGuard } from "@archie/react-sdk";`,
      "src/app/swap.tsx": `export { AuthGuard as Other } from "@archie/react-sdk";`,
      "src/app/exact.tsx": `export { AuthGuard } from "@archie/react-sdk"; export { useArchieClient } from "@archie/react-sdk";`,
    });
    expect([...new Set(v.map((x) => x.split(":")[0]))]).toEqual(["src/app/alias.tsx", "src/app/swap.tsx"]);
  });

  test("a Kit-D emitted tree (screens, containers, chrome, layout, app-context, composition root, memory infra, lib/gen) passes as emitted", async () => {
    const v = await violations({
      "src/domain/shared.ts": `export type RepoError = { code: string };`,
      "src/domain/session.ts": `export type AuthenticatedIdentity = { id: string };`,
      "src/domain/entities/loan.ts": `export interface Loan { id: string }`,
      "src/domain/ports/loan.repository.ts": `import type { Loan } from "../entities/loan"; import type { RepoError } from "../shared"; export interface LoanRepository { list(): Promise<Loan[] | RepoError> }`,
      "src/domain/selectors/loan.selectors.ts": `import type { Loan } from "../entities/loan"; export const total = (l: Loan[]) => l.length;`,
      "src/application/session-scope.ts": `import type { AuthenticatedIdentity } from "../domain/session"; export const scope = (i: AuthenticatedIdentity) => i.id;`,
      "src/application/view-models/home.vm.ts": `import type { Loan } from "../../domain/entities/loan"; export interface HomeVM { loans: Loan[] }`,
      "src/components/kit/components/index.ts": `export const AppShell = 1;`,
      "src/lib/gen/shell-user.ts": `import type { AuthenticatedIdentity } from "@/domain/session"; export const u = (i: AuthenticatedIdentity) => i.id;`.replace('@/domain/session','@/lib/gen/types'),
      "src/lib/gen/types.ts": `export type AuthenticatedIdentity = { id: string };`,
      "src/screens/home.tsx": `import { useNavigate } from "react-router"; import type { HomeVM } from "../application/view-models/home.vm"; import { AppShell } from "@/components/kit/components"; import { u } from "@/lib/gen/shell-user"; export default function Home(p: HomeVM) { return [useNavigate, AppShell, u, p]; }`,
      "src/presentation/screen-state.tsx": `export const ScreenError = 1;`,
      "src/presentation/app-context.tsx": `import type { LoanRepository } from "../domain/ports/loan.repository"; import type { AuthenticatedIdentity } from "../domain/session"; export const ctx = [] as unknown as [LoanRepository, AuthenticatedIdentity];`,
      "src/presentation/chrome/home.chrome.tsx": `import { AppShell } from "@/components/kit/components"; export const ScreenChrome = AppShell;`,
      "src/presentation/layout/AppShellLayout.tsx": `import { AppShell } from "@/components/kit/components"; export const L = AppShell;`,
      "src/presentation/containers/home.container.tsx": `import Home from "../../screens/home"; import { total } from "../../domain/selectors/loan.selectors"; import type { HomeVM } from "../../application/view-models/home.vm"; import { ctx } from "../app-context"; import { ScreenError } from "../screen-state"; import { ScreenChrome } from "../chrome/home.chrome"; export default [Home, total, ctx, ScreenError, ScreenChrome] as unknown as HomeVM;`,
      "src/infrastructure/memory/loan.adapter.ts": `import type { LoanRepository } from "../../domain/ports/loan.repository"; export const create = (): LoanRepository => ({ list: async () => [] });`,
      "src/infrastructure/archie/loan.adapter.ts": `import { useArchieClient } from "@archie/react-sdk"; import type { LoanRepository } from "../../domain/ports/loan.repository"; export const A = [useArchieClient] as unknown as LoanRepository;`,
      "src/app/auth-guard.tsx": `export { AuthGuard } from "@archie/react-sdk";`,
      "src/app/composition-root.tsx": `import { useArchieClient } from "@archie/react-sdk"; import type { IGraphQLModule } from "@archie/js-sdk"; import { create } from "../infrastructure/memory/loan.adapter"; import { A } from "../infrastructure/archie/loan.adapter"; import { ctx } from "../presentation/app-context"; export const root = [useArchieClient, create, A, ctx] as unknown as IGraphQLModule;`,
      "src/routes.config.tsx": `import { AuthGuard } from "./app/auth-guard"; import Home from "./presentation/containers/home.container"; export const r = [AuthGuard, Home];`,
      "src/main.tsx": `import { createClient, ArchieProvider } from "@archie/react-sdk"; import { ArchieDevToolProvider } from "@archie/devtools/client"; export const m = [createClient, ArchieProvider, ArchieDevToolProvider];`,
    });
    expect(v).toEqual([]);
  });

  test("Layout.tsx and routes.config.tsx are `app` (L42 exceptions): may mount the composition root; other components may not", async () => {
    const v = await violations({
      "src/app/composition-root.tsx": `export const R = 1;`,
      "src/presentation/layout/AppShellLayout.tsx": `export const L = 1;`,
      "src/components/Layout.tsx": `import { R } from "../app/composition-root"; import { L } from "../presentation/layout/AppShellLayout"; export const Layout = [R, L];`,
      "src/routes.config.tsx": `import { L } from "./presentation/layout/AppShellLayout"; export const r = L;`,
      "src/components/Foo.tsx": `import { L } from "../presentation/layout/AppShellLayout"; export const F = L;`,
      "src/components/Bar.tsx": `import { R } from "../app/composition-root"; export const B = R;`,
    });
    expect(v).toEqual([BAD("src/components/Bar.tsx"), BAD("src/components/Foo.tsx")]);
    const sdk = await violations({
      "src/components/Layout.tsx": `import { useQuery } from "@archie/react-sdk"; export const x = useQuery;`,
    });
    expect(sdk).toEqual([BAD("src/components/Layout.tsx")]);
  });

  test("app-file (Layout.tsx, routes.config.tsx): js-sdk value import and devtools fail, js-sdk type import passes", async () => {
    const v = await violations({
      "src/components/Layout.tsx": `import { createClient } from "@archie/js-sdk"; export const x = createClient;`,
      "src/routes.config.tsx": `import { ArchieDevToolProvider } from "@archie/devtools/client"; export const y = ArchieDevToolProvider;`,
    });
    expect(v).toEqual([BAD("src/components/Layout.tsx"), BAD("src/routes.config.tsx")]);
    const ok = await violations({
      "src/components/Layout.tsx": `import type { IGraphQLModule } from "@archie/js-sdk"; export type X = IGraphQLModule;`,
    });
    expect(ok).toEqual([]);
  });

  test("app-files cannot be laundered: direct import and via the components barrel fail; App.tsx and main may import them", async () => {
    const layout = `export { z } from "@/infrastructure/archie/z"; export { AuthGuard } from "@archie/react-sdk";`;
    const v = await violations({
      "src/infrastructure/archie/z.ts": `export const z = 1;`,
      "src/components/Layout.tsx": layout,
      "src/components/index.ts": `export { Layout } from "./Layout";`, // a barrel re-export is a launder path too
      "src/presentation/containers/c.tsx": `import { z, AuthGuard } from "@/components/Layout"; export const c = [z, AuthGuard];`,
      "src/components/ui/k.tsx": `import { z } from "@/components/Layout"; export const k = z;`,
      "src/routes.config.tsx": `export const r = 1;`,
      "src/lib/n.ts": `import { r } from "@/routes.config"; export const n = r;`,
      "src/App.tsx": `import { Layout } from "./components/Layout"; import { r } from "./routes.config"; export const A = [Layout, r];`,
      "src/main.tsx": `import { A } from "./App"; import { Layout } from "./components/Layout"; export const m = [A, Layout];`,
    });
    expect(v).toEqual([
      BAD("src/components/index.ts"),
      BAD("src/components/ui/k.tsx"),
      BAD("src/lib/n.ts"),
      BAD("src/presentation/containers/c.tsx"),
    ]);
  });

  test("src/client is the survivor zone: it may import anything", async () => {
    const v = await violations({
      "src/infrastructure/archie/a.ts": `export const a = 1;`,
      "src/client/mine.ts": `import { useArchieClient } from "@archie/react-sdk"; import { a } from "@/infrastructure/archie/a"; export const m = [useArchieClient, a];`,
    });
    expect(v).toEqual([]);
  });
});

describe("the template as shipped", () => {
  test("its own tree lints with zero errors under the real eslint.config.js", async () => {
    const eslint = new ESLint({ cwd: REPO });
    const results = await eslint.lintFiles(["src/**/*.{ts,tsx}"]);
    const errors = results.flatMap((r) =>
      r.messages.filter((m) => m.severity === 2).map((m) => `${r.filePath}: ${m.ruleId}: ${m.message}`),
    );
    expect(errors).toEqual([]);
  }, 120_000);
});

describe("L37 also lints transplanted .jsx (the view law does not)", () => {
  const SDK_JSX = `import { useArchieClient } from "@archie/react-sdk"; export default function V() { return useArchieClient(); }`;

  test("a .view.jsx importing the SDK or infrastructure fails", async () => {
    const v = await violations({
      "src/infrastructure/memory/x.ts": `export const x = 1;`,
      "src/presentation/views/a.view.jsx": SDK_JSX,
      "src/presentation/views/b.view.jsx": `import { x } from "@/infrastructure/memory/x"; export default function V() { return <p>{x}</p>; }`,
    });
    expect(v).toEqual([BAD("src/presentation/views/a.view.jsx"), BAD("src/presentation/views/b.view.jsx")]);
  });

  test("presentation -> application passes from a .view.jsx; ui-plane passes from a .jsx domain component", async () => {
    const v = await violations({
      "src/application/view-models/x.bindings.ts": `export const bindings = {};`,
      "src/components/ui/button.tsx": `export const Button = 1;`,
      "src/presentation/views/x.view.jsx": `import { bindings } from "@/application/view-models/x.bindings"; export default function V() { return <p>{String(bindings)}</p>; }`,
      "src/presentation/components/domain/d.jsx": `import { Button } from "@/components/ui/button"; export const D = () => <Button />;`,
    });
    expect(v).toEqual([]);
  });

  test("the app composition root takes the SDK by symbol in .jsx too", async () => {
    const v = await violations({
      "src/app/ok.jsx": `import { AuthGuard } from "@archie/react-sdk"; export const A = AuthGuard;`,
      "src/app/bad.jsx": `import { useArchieClient, createClient } from "@archie/react-sdk"; export const B = [useArchieClient, createClient];`,
    });
    expect(v).toEqual([BAD("src/app/bad.jsx")]);
  });
});

describe("the laws config on its own (what `build` runs)", () => {
  test("passes on the shipped template, including its eslint-disable comments for generic rules", async () => {
    const eslint = new ESLint({ cwd: REPO, overrideConfigFile: join(REPO, "eslint.laws.config.js") });
    const results = await eslint.lintFiles(["src/**/*.{ts,tsx,js,jsx}"]);
    const errors = results.flatMap((r) => r.messages.filter((m) => m.severity === 2).map((m) => `${r.filePath}: ${m.ruleId}: ${m.message}`));
    expect(errors).toEqual([]);
  }, 120_000);
});

describe("lint runs in `build`; a seeded violation fails it", () => {
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as { scripts: Record<string, string> };

  test("the build script chains the LAWS lint first, then tsc, then vite; build:fast stays lint-free", () => {
    expect(pkg.scripts.build).toBe("eslint -c eslint.laws.config.js . && tsc -b && vite build");
    expect(pkg.scripts["lint:laws"]).toBe("eslint -c eslint.laws.config.js .");
    expect(pkg.scripts["build:fast"]).toBe("vite build");
    expect(pkg.scripts.lint).toBe("eslint .");
  });

  /** A copy of the template's laws config + a tiny hexagonal tree; runs the EXACT lint step of `build`. */
  function lintSeeded(view: string, extra: Record<string, string> = {}): { status: number | null; ruleIds: string[] } {
    const root = makeTree({
      "src/domain/entities/booking.ts": `export interface Booking { id: string; total: number }`,
      "src/application/view-models/bookings.vm.ts": `import type { Booking } from "@/domain/entities/booking";\nexport interface BookingsVM { bookings: readonly Booking[]; total: number }`,
      "src/presentation/views/bookings.view.tsx": view,
      "src/infrastructure/memory/store.ts": `export const x = 1;`,
      ...extra,
    });
    for (const f of ["eslint.laws.config.js", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json", "tsconfig.test.json", "tsconfig.rules.json", "package.json", "archie.view-law.json"]) {
      cpSync(join(REPO, f), join(root, f));
    }
    cpSync(join(REPO, "eslint-rules"), join(root, "eslint-rules"), { recursive: true });
    symlinkSync(join(REPO, "node_modules"), join(root, "node_modules"));
    expect(existsSync(join(root, "eslint.laws.config.js"))).toBe(true);
    const run = spawnSync(process.execPath, [join(REPO, "node_modules", "eslint", "bin", "eslint.js"), "-c", "eslint.laws.config.js", ".", "--format", "json"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const parsed = JSON.parse(run.stdout || "[]") as { messages: { ruleId: string | null; severity: number }[] }[];
    return { status: run.status, ruleIds: parsed.flatMap((f) => f.messages.filter((m) => m.severity === 2).map((m) => m.ruleId ?? "")) };
  }

  const HEAD = `import type { BookingsVM } from "@/application/view-models/bookings.vm";\n`;

  test("a view with useEffect makes the lint step exit non-zero", () => {
    const r = lintSeeded(`${HEAD}import { useEffect } from "react";\nexport function BookingsView(props: BookingsVM) {\n  useEffect(() => {}, []);\n  return <p>{props.total}</p>;\n}\n`);
    expect(r.status).not.toBe(0);
    expect(r.ruleIds).toContain("archie-view-law/no-use-effect");
  }, 120_000);

  test("a view filtering an entity array makes the lint step exit non-zero", () => {
    const r = lintSeeded(`${HEAD}export function BookingsView(props: BookingsVM) {\n  const big = props.bookings.filter((b) => b.total > 10);\n  return <p>{big.length}</p>;\n}\n`);
    expect(r.status).not.toBe(0);
    expect(r.ruleIds).toContain("archie-view-law/no-entity-derivation");
  }, 120_000);

  test("a presentation file importing infrastructure makes the lint step exit non-zero", () => {
    const r = lintSeeded(`${HEAD}import { x } from "@/infrastructure/memory/store";\nexport function BookingsView(props: BookingsVM) {\n  return <p>{props.total}{x}</p>;\n}\n`);
    expect(r.status).not.toBe(0);
    expect(r.ruleIds).toContain("boundaries/dependencies");
  }, 120_000);

  test("an inline disable of a law rule fails the laws lint; a generic react-hooks disable still works", () => {
    const base = `${HEAD}export function BookingsView(props: BookingsVM) {\n  return <p>{props.total}</p>;\n}\n`;
    const a = lintSeeded(base, {
      "src/lib/x.ts": `// eslint-disable-next-line boundaries/dependencies\nimport { x } from "@/infrastructure/memory/store";\nexport const y = x;\n`,
    });
    expect(a.status).not.toBe(0);
    expect(a.ruleIds).toContain("@eslint-community/eslint-comments/no-restricted-disable");
    const b = lintSeeded(`/* eslint-disable archie-view-law/no-any */\n${base}`);
    expect(b.status).not.toBe(0);
    const c = lintSeeded(base, {
      "src/lib/h.ts": `// eslint-disable-next-line react-hooks/exhaustive-deps\nexport const h = 1;\n`,
    });
    expect(c.ruleIds).toEqual([]);
    expect(c.status).toBe(0);
  }, 120_000);

  test("the view law stays out of .view.jsx (useEffect, .filter pass); an inline boundaries disable in .jsx fails", () => {
    const base = `${HEAD}export function BookingsView(props: BookingsVM) {\n  return <p>{props.total}</p>;\n}\n`;
    const loose = lintSeeded(base, {
      "src/presentation/views/t.view.jsx": `import { useEffect } from "react";\nexport default function T({ rows }) { useEffect(() => {}, []); return <p>{rows.filter((r) => r.a).length}</p>; }\n`,
    });
    expect(loose.ruleIds).toEqual([]);
    expect(loose.status).toBe(0);
    const disabled = lintSeeded(base, {
      "src/presentation/views/d.view.jsx": `// eslint-disable-next-line boundaries/dependencies\nimport { x } from "@/infrastructure/memory/store";\nexport default function D() { return <p>{x}</p>; }\n`,
    });
    expect(disabled.status).not.toBe(0);
    expect(disabled.ruleIds).toContain("@eslint-community/eslint-comments/no-restricted-disable");
  }, 120_000);

  test("control: a clean view exits 0", () => {
    const r = lintSeeded(`${HEAD}export function BookingsView(props: BookingsVM) {\n  return <ul>{props.bookings.map((b) => <li key={b.id}>{b.total}</li>)}</ul>;\n}\n`);
    expect(r.ruleIds).toEqual([]);
    expect(r.status).toBe(0);
  }, 120_000);

  test("a colocated test under views (outside the app tsconfig) neither crashes the lint nor is judged", () => {
    const r = lintSeeded(`${HEAD}export function BookingsView(props: BookingsVM) {\n  return <p>{props.total}</p>;\n}\n`, {
      "src/presentation/views/bookings.view.test.tsx": `import { useEffect } from "react";\nexport const t = (xs: { a: number }[]) => { useEffect(() => {}, []); return xs.filter((x) => x.a); };\n`,
    });
    expect(r.ruleIds).toEqual([]);
    expect(r.status).toBe(0);
  }, 120_000);
});
