import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RuleTester } from "@typescript-eslint/rule-tester";
// @ts-expect-error plain JS plugin (JSDoc-typed), no declaration files on purpose
import { rules, loadFixtureIds, viewLawConfig, VIEW_IGNORES } from "../index.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
// Lazy: Bun throws on the property access `it.only` itself when CI=true.
RuleTester.itOnly = ((...args: Parameters<typeof it.only>) => it.only(...args)) as typeof it.only;

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "..", "__fixtures__", "project");
const TSX = join(FIXTURE, "file.tsx");
const TS = join(FIXTURE, "file.ts");

/** Syntax-only tester: rules that need no type information. */
const plain = new RuleTester({
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});
/** Type-aware tester: a tiny real project (tsconfig + domain entity + VM) on disk. */
const typed = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: { allowDefaultProject: ["*.ts", "*.tsx"], defaultProject: "tsconfig.json" },
      tsconfigRootDir: FIXTURE,
    },
  },
});

const ok = (code: string, extra: object = {}) => ({ code, filename: TSX, ...extra });
const bad = (code: string, errors: object[], extra: object = {}) => ({ code, filename: TSX, errors, ...extra });

// ---------------------------------------------------------------------------------- hooks
plain.run("no-use-effect", rules["no-use-effect"], {
  valid: [ok(`const [a] = useState(0);`), ok(`const a = useMemo(() => 1, []);`)],
  invalid: [
    bad(`useEffect(() => {}, []);`, [{ messageId: "banned" }]),
    bad(`React.useEffect(() => {}, []);`, [{ messageId: "banned" }]),
    bad(`useLayoutEffect(() => {});`, [{ messageId: "banned" }]),
  ],
});

plain.run("hook-not-allowed", rules["hook-not-allowed"], {
  valid: [
    ok(`useState(); useMemo(); useCallback(); useId(); useRef(); useTranslation(); useForm(); useFieldArray(); useAppNavigate(); useReactTable({});`),
    ok(`React.useReactTable({});`),
    ok(`React.useState(0);`),
    ok(`useEffect(() => {});`), // owned by no-use-effect, not reported twice
    ok(`const user = userFn(); useless();`), // lowercase after "use" is not a hook name
  ],
  invalid: [
    bad(`useContext(Ctx);`, [{ messageId: "banned" }]),
    bad(`useReducer(r, 0);`, [{ messageId: "banned" }]),
    bad(`useQuery({});`, [{ messageId: "banned" }]),
    bad(`React.useSyncExternalStore(a, b);`, [{ messageId: "banned" }]),
    bad(`useCustomThing();`, [{ messageId: "banned" }]),
  ],
});

// -------------------------------------------------------------------------------- imports
plain.run("router-import", rules["router-import"], {
  valid: [ok(`import React from "react";`), ok(`import { x } from "@/lib/routerless";`), ok(`import { y } from "@/lib/utils";`)],
  invalid: [
    bad(`import { Link } from "react-router";`, [{ messageId: "banned" }]),
    bad(`import { Link } from "react-router-dom";`, [{ messageId: "banned" }]),
    bad(`import { href } from "@/lib/router";`, [{ messageId: "banned" }]),
    bad(`import { href } from "@/lib/router/sub";`, [{ messageId: "banned" }]),
    bad(`export * from "react-router";`, [{ messageId: "banned" }]),
    bad(`export { a } from "react-router";`, [{ messageId: "banned" }]),
    bad(`const m = import("react-router");`, [{ messageId: "banned" }]),
    bad(`const m = require("@/lib/router");`, [{ messageId: "banned" }]),
    bad(`import type { Foo } from "react-router";`, [{ messageId: "banned" }]),
  ],
});

plain.run("data-import", rules["data-import"], {
  valid: [ok(`import { a } from "@/database";`), ok(`import { a } from "@/lib/utils";`)],
  invalid: [
    bad(`import { rows } from "@/data";`, [{ messageId: "banned" }]),
    bad(`import { rows } from "@/data/bookings";`, [{ messageId: "banned" }]),
  ],
});

plain.run("infra-import", rules["infra-import"], {
  valid: [ok(`import { a } from "@/archie";`), ok(`import { a } from "@/infrastructure-docs";`)],
  invalid: [
    bad(`import { a } from "@/infrastructure/archie/booking.adapter";`, [{ messageId: "banned" }]),
    bad(`import { useArchieClient } from "@archie/react-sdk";`, [{ messageId: "banned" }]),
    bad(`import { createClient } from "@archie/js-sdk";`, [{ messageId: "banned" }]),
    bad(`import { a } from "@infrastructure/x";`.replace("@infrastructure", "@/infrastructure"), [{ messageId: "banned" }]),
  ],
});

plain.run("disallowed-import", rules["disallowed-import"], {
  valid: [
    ok(`
      import a from "react";
      import b from "react/jsx-runtime";
      import c from "@/components/ui/button";
      import d from "@/lib/proto/x";
      import e from "@/lib/utils";
      import f from "@/presentation/components/domain/x";
      import g from "@/application/view-models/x";
      import h from "@/i18n";
      import i from "react-i18next";
      import j from "react-hook-form";
      import k from "lucide-react";
      import l from "motion/react";
    `),
    ok(`import { LineChart } from "recharts";`),
    ok(`import type { TooltipProps } from "recharts/types/index";`),
    ok(`import { z } from "zod";`),
    ok(`import { z } from "zod/v4";`),
    ok(`import { zodResolver } from "@hookform/resolvers/zod";`),
    ok(`import { useReactTable } from "@/vendor/tanstack-react-table";`),
    ok(`import { motion } from "@/vendor/motion";`),
    ok(`import { routes } from "@/presentation/navigation";`),
    ok(`import { fmt } from "@/lib/format";`),
    ok(`import { Map } from "@/lib/map";`),
    ok(`import { Schedule } from "@/lib/schedule";`),
    ok(`import { Board } from "@/lib/board";`),
    ok(`import { Queue } from "@/lib/queue";`),
    ok(`import { Timeline } from "@/lib/timeline";`),
    ok(`import { Stepper } from "@/lib/stepper";`),
    ok(`import { Scene } from "@/lib/scene";`),
    ok(`import { Image } from "@/lib/image";`),
    ok(`import { ClientOnly } from "@/lib/client-only";`),
    ok(`import { countChildren, takenOf } from "@/lib/selectors";`),
    ok(`import { Link } from "react-router";`), // a ban owned by router-import, never double-reported
    ok(`import { a } from "@archie/react-sdk";`),
  ],
  invalid: [
    bad(`import _ from "lodash";`, [{ messageId: "disallowed" }]),
    bad(`import type { Booking } from "@/domain/entities/booking";`, [{ messageId: "disallowed" }]),
    bad(`import { x } from "./local";`, [{ messageId: "disallowed" }]),
    bad(`import dom from "react-dom";`, [{ messageId: "disallowed" }]),
    bad(`export { x } from "@/lib/other";`, [{ messageId: "disallowed" }]),
    bad(`const m = require("lodash");`, [{ messageId: "disallowed" }]),
    bad(`import d from "recharts/../../src/data/x";`, [{ messageId: "disallowed" }]),
    bad(`import d from "zod/../react-router";`, [{ messageId: "disallowed" }]),
    bad(`import d from "react/../react-router-dom";`, [{ messageId: "disallowed" }]),
    bad(`import d from "@/vendor/motion/../../data/x";`, [{ messageId: "disallowed" }]),
    bad(`import d from "../../vendor/motion";`, [{ messageId: "disallowed" }]),
    bad(`import z from "zodiac";`, [{ messageId: "disallowed" }]),
    bad(`import z from "zod-extra";`, [{ messageId: "disallowed" }]),
    bad(`import r from "recharts-extra";`, [{ messageId: "disallowed" }]),
    bad(`import y from "@hookform/resolvers/yup";`, [{ messageId: "disallowed" }]),
    bad(`import y from "@hookform/resolvers";`, [{ messageId: "disallowed" }]),
    bad(`import y from "@hookform/resolvers/zod/extra";`, [{ messageId: "disallowed" }]),
    bad(`import x from "@/lib/other";`, [{ messageId: "disallowed" }]),
    bad(`import x from "@/lib/format/x";`, [{ messageId: "disallowed" }]),
    bad(`import x from "@/lib/format-extra";`, [{ messageId: "disallowed" }]),
    bad(`import x from "@/lib/../data/x";`, [{ messageId: "disallowed" }]),
    bad(`import x from "@/lib/map/x";`, [{ messageId: "disallowed" }]),
    bad(`import x from "@/lib";`, [{ messageId: "disallowed" }]),
    bad(`import v from "@/vendor/other";`, [{ messageId: "disallowed" }]),
    bad(`import v from "@/vendor";`, [{ messageId: "disallowed" }]),
    bad(`import v from "@/vendor/tanstack-react-table-extra";`, [{ messageId: "disallowed" }]),
    bad(`import v from "@/vendor/motion/extra";`, [{ messageId: "disallowed" }]),
    bad(`import n from "@/presentation/navigation/x";`, [{ messageId: "disallowed" }]),
    bad(`import n from "@/presentation/navigation-extra";`, [{ messageId: "disallowed" }]),
    bad(`import n from "@/presentation/containers/x";`, [{ messageId: "disallowed" }]),
    bad(`import n from "@/presentation";`, [{ messageId: "disallowed" }]),
    bad(`import n from "@/presentation/navigation/../containers/x";`, [{ messageId: "disallowed" }]),
  ],
});

plain.run("vm-value-import", rules["vm-value-import"], {
  valid: [
    ok(`import type { VM } from "@/application/view-models/x";`),
    ok(`import { type VM, type Other } from "@/application/view-models/x";`),
    ok(`import { x } from "@/lib/utils";`),
    ok(`export type { VM } from "@/application/view-models/x";`),
  ],
  invalid: [
    bad(`import { VM } from "@/application/view-models/x";`, [{ messageId: "value" }]),
    bad(`import { type VM, helper } from "@/application/view-models/x";`, [{ messageId: "value" }]),
    bad(`import vm from "@/application/view-models/x";`, [{ messageId: "value" }]),
    bad(`export * from "@/application/view-models/x";`, [{ messageId: "value" }]),
  ],
});

// ------------------------------------------------------------------------------ as / any / ts
plain.run("no-as-cast", rules["no-as-cast"], {
  valid: [
    ok(`const a = ["x"] as const;`),
    ok(`const o = { k: 1 } as const;`),
    ok(`const s: string = "x";`),
    ok(`const t = 1 satisfies number;`),
  ],
  invalid: [
    bad(`const a = x as string;`, [{ messageId: "asCast" }]),
    bad(`const a = x as unknown as Foo;`, [{ messageId: "asCast" }, { messageId: "asCast" }]),
    bad(`const a = <string>x;`, [{ messageId: "asCast" }], { filename: TS }),
  ],
});

plain.run("no-any", rules["no-any"], {
  valid: [ok(`const a: unknown = 1;`), ok(`const a: string[] = [];`)],
  invalid: [
    bad(`const a: any = 1;`, [{ messageId: "any" }]),
    bad(`function f(x: any[]) { return x; }`, [{ messageId: "any" }]),
    bad(`type T = Record<string, any>;`, [{ messageId: "any" }]),
  ],
});

plain.run("no-ts-comment", rules["no-ts-comment"], {
  valid: [
    ok(`// we avoid ts-ignore here\nconst a = 1;`),
    ok(`// ordinary comment\nconst a = 1;`),
    ok(`/* mentions @ts-expect-error mid sentence */ const a = 1;`.replace("/* mentions", "/* mentions")),
  ],
  invalid: [
    bad(`// @ts-ignore\nconst a: number = "x";`, [{ messageId: "tsComment", data: { kind: "ignore" } }]),
    bad(`// @ts-expect-error\nconst a: number = "x";`, [{ messageId: "tsComment", data: { kind: "expect-error" } }]),
    bad(`// @ts-nocheck\nconst a = 1;`, [{ messageId: "tsComment", data: { kind: "nocheck" } }]),
    bad(`/**\n * @ts-ignore\n */\nconst a = 1;`, [{ messageId: "tsComment" }]),
  ],
});

// ----------------------------------------------------------------- render (no type info needed)
plain.run("module-level-read", rules["module-level-read"], {
  valid: [
    ok(`function V() { return Booking[0]; }`, { options: [{ entityNames: ["Booking"] }] }),
    ok(`const x = Other[0];`, { options: [{ entityNames: ["Booking"] }] }),
    ok(`const x = Booking;`, { options: [{ entityNames: ["Booking"] }] }),
    ok(`import { Booking } from "@/x"; const t: Booking["id"] = "a";`, { options: [{ entityNames: ["Booking"] }] }),
    ok(`const x = Booking[0];`), // no entity names known: no-op
  ],
  invalid: [
    bad(`const first = Booking[0];`, [{ messageId: "read", data: { name: "Booking" } }], { options: [{ entityNames: ["Booking"] }] }),
    bad(`const k = Booking.status;`, [{ messageId: "read" }], { options: [{ entityNames: ["Booking"] }] }),
    bad(`export const n = Booking?.[0];`, [{ messageId: "read" }], { options: [{ entityNames: ["Booking"] }] }),
  ],
});

typed.run("module-level-read", rules["module-level-read"], {
  valid: [ok(`function V() { return Booking[0]; }`), ok(`const x = NOT_AN_ENTITY[0];`)],
  invalid: [
    bad(`const first = Booking[0];`, [{ messageId: "read" }]),
    bad(`const g = Guest[0];`, [{ messageId: "read" }]), // type alias counts too
  ],
});

const FIX = { options: [{ fixtureIds: ["b1", "booking-001", "42"] }] };
plain.run("fixture-id-literal", rules["fixture-id-literal"], {
  valid: [
    ok(`const a = "b1";`), // default options: empty fixtureIds, no-op
    ok(`const a = "other";`, FIX),
    ok(`import x from "b1";`, FIX), // import sources are not scanned
    ok(`const a = <p>booking-001</p>;`, FIX), // JSX text is prose
    ok(`const a = <option value="42">x</option>;`, FIX), // numeric id in a value-like attr
    ok(`const a = <input min={"42"} />;`, FIX),
    ok(`const a = "xbooking-001y";`, FIX), // not a token boundary
    ok(`const a = "booking-0012";`, FIX),
    ok(`const a = "ab1";`, FIX), // short ids match by equality only
  ],
  invalid: [
    bad(`const a = "b1";`, [{ messageId: "fixture", data: { value: "b1" } }], FIX),
    bad(`const a = "detail.html?id=booking-001";`, [{ messageId: "fixture" }], FIX), // containment, 5+ chars
    bad("const a = `/x/${y}/booking-001`;", [{ messageId: "fixture" }], FIX),
    bad(`const a = <a title="42">x</a>;`, [{ messageId: "fixture", data: { value: "42" } }], FIX), // not value-like
    bad(`const a = <a href={"b1"}>x</a>;`, [{ messageId: "fixture" }], FIX),
    bad(`const [id] = useState("b1");`, [{ messageId: "fixture" }], FIX),
  ],
});

plain.run("date-in-render", rules["date-in-render"], {
  valid: [
    ok(`const now = new Date();`), // module level: module-level rules own it
    ok(`function V() { return new Date(0); }`), // an argument: deterministic
    ok(`function V() { return new Date("2026-01-01"); }`),
    ok(`function V() { const handleSave = () => Date.now(); return null; }`),
    ok(`function V() { function onClose() { return new Date(); } return null; }`),
    ok(`function V() { const cb = useCallback(() => Date.now(), []); return null; }`),
    ok(`function V() { return <button onClick={() => new Date()} />; }`),
    ok(`function V() { return <button onClick={() => d.toLocaleString()} />; }`),
  ],
  invalid: [
    bad(`function V() { return new Date(); }`, [{ messageId: "date", data: { what: "new Date()" } }]),
    bad(`function V() { return Date.now(); }`, [{ messageId: "date", data: { what: "Date.now()" } }]),
    bad(`function V(p) { return p.at.toLocaleDateString(); }`, [{ messageId: "date" }]),
    bad(`const V = () => <p>{n.toLocaleString()}</p>;`, [{ messageId: "date" }]),
    bad(`function V() { const m = useMemo(() => new Date(), []); return m; }`, [{ messageId: "date" }]), // useMemo runs in render
    bad(`function V() { return rows.map(() => Date.now()); }`, [{ messageId: "date" }]),
    bad(`function V() { const render = () => Date.now(); return render(); }`, [{ messageId: "date" }]),
  ],
});

// --------------------------------------------------------- V3b (type-aware: real checker)
const view = (body: string) =>
  `import type { BookingsVM } from "@/application/view-models/bookings.vm";\nexport function V(props: BookingsVM) { ${body} return null; }`;
const okT = (body: string) => ({ code: view(body), filename: TSX });
const badT = (body: string, errors: object[]) => ({ code: view(body), filename: TSX, errors });

typed.run("no-entity-derivation", rules["no-entity-derivation"], {
  valid: [
    okT(`return <ul>{props.bookings.map((b) => <li key={b.id}>{b.status}</li>)}</ul>;`), // .map alone is rendering
    okT(`const n = props.names.filter((x) => x.length > 1);`), // string[] is not an entity array
    okT(`const r = props.rows.filter((x) => x.label);`), // VM-local type, not a domain entity
    okT(`const t = props.total;`),
    okT(`const m = props.names.map((x) => x).reduce((a, b) => a + b, "");`), // fold, but not over an entity
    okT(`const m = Math.max(...props.names.map((x) => x.length));`),
    okT(`const x = props.bookings.map((b) => b.id);`),
    okT(`const x = props.bookings.slice(0, 3);`),
  ],
  invalid: [
    badT(`const a = props.bookings.filter((b) => b.total > 0);`, [{ messageId: "derive" }]), // readonly Booking[]
    badT(`const a = props.list.reduce((s, b) => s + b.total, 0);`, [{ messageId: "derive" }]), // Booking[]
    badT(`const a = props.ro.sort((x, y) => x.total - y.total);`, [{ messageId: "derive" }]), // ReadonlyArray<Booking>
    badT(`const a = props.maybe?.find((b) => b.id === "x");`, [{ messageId: "derive" }]), // nullable
    badT(`const a = props.maybe!.some((b) => b.total);`.replace("!.", "?."), [{ messageId: "derive" }]),
    badT(`const a = props.guests.every((g) => g.name);`, [{ messageId: "derive" }]), // type alias entity
    badT(`const a = props.wrapped.filter((b) => b.id);`, [{ messageId: "derive" }]), // readonly Readonly<Booking>[]
    badT(`const a = props.picked.filter((b) => b.id);`, [{ messageId: "derive" }]), // Pick<Booking, "id">[]
    badT(`const a = props.bookings.flatMap((b) => [b]);`, [{ messageId: "derive" }]),
    badT(`const a = props.bookings.toSorted();`, [{ messageId: "derive" }]),
    badT(`const a = props.bookings.toReversed();`, [{ messageId: "derive" }]),
    badT(`const a = props.bookings.findLast((b) => b.id);`, [{ messageId: "derive" }]),
    badT(`const a = props.bookings.findIndex((b) => b.id);`, [{ messageId: "derive" }]),
    badT(`const a = props.bookings.findLastIndex((b) => b.id);`, [{ messageId: "derive" }]),
    badT(`const a = props.bookings.includes(props.bookings[0]);`, [{ messageId: "derive" }]),
    badT(`props.bookings.forEach((b) => b);`, [{ messageId: "derive" }]),
    // chained through a local binding: still decided on the type
    badT(`const rows = props.bookings; const a = rows.filter((b) => b.id);`, [{ messageId: "derive" }]),
    // map-folds
    badT(`const a = props.bookings.map((b) => b.total).reduce((s, n) => s + n, 0);`, [{ messageId: "fold" }]),
    badT(`const a = props.bookings.map((b) => b.total).reduceRight((s, n) => s + n, 0);`, [{ messageId: "fold" }]),
    badT(`const a = Math.max(...props.bookings.map((b) => b.total));`, [{ messageId: "fold" }]),
    badT(`const a = Math.min(props.bookings.map((b) => b.total));`, [{ messageId: "fold" }]),
  ],
});

typed.run("no-entity-derivation", rules["no-entity-derivation"], {
  valid: [
    { ...okT(`const a = props.bookings.filter((b) => b.id);`), options: [{ entityNames: ["Guest"] }] },
  ],
  invalid: [
    { ...badT(`const a = props.guests.filter((g) => g.id);`, [{ messageId: "derive" }]), options: [{ entityNames: ["Guest"] }] },
  ],
});

typed.run("for-loop-over-entity", rules["for-loop-over-entity"], {
  valid: [
    okT(`for (const n of props.names) { n; }`),
    okT(`for (let i = 0; i < props.names.length; i++) { i; }`),
    okT(`for (const r of props.rows) { r; }`),
    okT(`for (let i = 0; i < 3; i++) { i; }`),
  ],
  invalid: [
    badT(`for (const b of props.bookings) { b; }`, [{ messageId: "forOf", data: { entity: "Booking" } }]),
    badT(`for (const b of props.list) { b; }`, [{ messageId: "forOf" }]),
    badT(`for (let i = 0; i < props.bookings.length; i++) { i; }`, [{ messageId: "forBound", data: { entity: "Booking" } }]),
    badT(`for (let i = 0; i < props.ro.length; i++) { i; }`, [{ messageId: "forBound" }]),
  ],
});

typed.run("entity-count", rules["entity-count"], {
  valid: [
    okT(`const n = props.names.length;`),
    okT(`const n = props.rows.length;`),
    okT(`const n = props.total;`),
    okT(`const a = !props.maybe?.length;`), // emptiness through an optional chain belongs to the other rule
    // emptiness uses belong to entity-count-empty-check
    okT(`const a = props.bookings.length === 0;`),
    okT(`if (!props.bookings.length) { return null; }`),
    // the derivation is the finding, not the count
    okT(`const n = props.names.filter((x) => x).length;`),
    // a bounded `for` is the for-loop finding
    okT(`for (let i = 0; i < props.names.length; i++) { i; }`),
  ],
  invalid: [
    badT(`const n = props.bookings.length;`, [{ messageId: "count", data: { entity: "Booking" } }]),
    badT(`const a = props.list.length + 1;`, [{ messageId: "count" }]),
    badT(`const a = props.bookings.length > 5;`, [{ messageId: "count" }]), // compared to a non-zero number
    badT(`const a = props.bookings.length === 1;`, [{ messageId: "count" }]),
    badT(`const a = props.ro.length >= 0;`, [{ messageId: "count" }]),
    badT(`const a = props.maybe?.length;`, [{ messageId: "count" }]),
    badT(`const a = <p>{props.bookings.length}</p>;`, [{ messageId: "count" }]),
    badT(`const a = props.bookings.map((b) => b).length;`, [{ messageId: "count" }]), // .map is not a deriving method
    badT(`const a = 0 < props.bookings.length + 0;`, [{ messageId: "count" }]),
  ],
});

typed.run("entity-count-empty-check", rules["entity-count-empty-check"], {
  valid: [
    okT(`const n = props.bookings.length;`), // a plain count belongs to entity-count
    okT(`const n = props.maybe?.length;`),
    okT(`const a = props.bookings.length > 5;`),
    okT(`const a = props.names.length === 0;`), // not an entity array
    okT(`const a = props.bookings.filter((b) => b.id).length === 0;`), // the derivation is the finding
  ],
  invalid: [
    badT(`const a = props.bookings.length === 0;`, [{ messageId: "count", data: { entity: "Booking" } }]),
    badT(`const a = props.bookings.length == 0;`, [{ messageId: "count" }]),
    badT(`const a = props.bookings.length !== 0;`, [{ messageId: "count" }]),
    badT(`const a = props.bookings.length != 0;`, [{ messageId: "count" }]),
    badT(`const a = props.bookings.length > 0;`, [{ messageId: "count" }]),
    badT(`const a = props.bookings.length >= 1;`, [{ messageId: "count" }]),
    badT(`const a = props.bookings.length < 1;`, [{ messageId: "count" }]),
    badT(`const a = 0 === props.bookings.length;`, [{ messageId: "count" }]), // either operand order
    badT(`const a = 0 < props.bookings.length;`, [{ messageId: "count" }]),
    badT(`const a = 1 <= props.bookings.length;`, [{ messageId: "count" }]),
    badT(`const a = 1 > props.bookings.length;`, [{ messageId: "count" }]),
    badT(`const a = !props.bookings.length;`, [{ messageId: "count" }]),
    badT(`const a = !props.maybe?.length;`, [{ messageId: "count" }]), // optional chain: still an emptiness test
    badT(`const a = props.maybe?.length === 0;`, [{ messageId: "count" }]),
    badT(`if (props.maybe?.length) { return null; }`, [{ messageId: "count" }]),
    badT(`if (props.bookings.length) { return null; }`, [{ messageId: "count" }]), // direct boolean
    badT(`while (props.list.length) { break; }`, [{ messageId: "count" }]),
    badT(`const a = props.list.length ? 1 : 2;`, [{ messageId: "count" }]),
    badT(`const a = props.list.length && "x";`, [{ messageId: "count" }]),
    badT(`const a = props.list.length || "x";`, [{ messageId: "count" }]),
    badT(`const a = props.ro.length > 0 ? 1 : 2;`, [{ messageId: "count" }]),
  ],
});

// -------------------------------------------------- no program / no entities (silent-disable guards)
plain.run("no-entity-derivation", rules["no-entity-derivation"], {
  // a file outside any TS project (e.g. a colocated test): the typed rules are no-ops, never a crash
  valid: [ok(`const a = props.bookings.filter((b) => b.id);`, { options: [{ entityNames: ["Booking"] }] })],
  invalid: [],
});
plain.run("for-loop-over-entity", rules["for-loop-over-entity"], {
  valid: [ok(`for (const b of props.bookings) { b; }`)],
  invalid: [],
});
plain.run("entity-count", rules["entity-count"], { valid: [ok(`const n = props.bookings.length;`)], invalid: [] });
plain.run("entity-count-empty-check", rules["entity-count-empty-check"], {
  valid: [ok(`const n = !props.bookings.length;`)],
  invalid: [],
});

const typedEmpty = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: join(dirname(fileURLToPath(import.meta.url)), "..", "__fixtures__", "empty-project"),
    },
  },
});
const EMPTY = join(dirname(fileURLToPath(import.meta.url)), "..", "__fixtures__", "empty-project", "src", "view.tsx");
typedEmpty.run("no-entities-found", rules["no-entities-found"], {
  valid: [
    { code: `export const a = 1;`, filename: EMPTY }, // no VM import: nothing to warn about
    { code: `import type { X } from "@/application/view-models/x";`, filename: EMPTY, options: [{ entityNames: ["Booking"] }] },
  ],
  invalid: [
    // a VM is imported but src/domain/entities is absent: ONE warning, never silence
    { code: `import type { X } from "@/application/view-models/x";\nimport type { Y } from "@/application/view-models/y";`, filename: EMPTY, errors: [{ messageId: "none" }] },
  ],
});
typed.run("no-entities-found", rules["no-entities-found"], {
  valid: [okT(`return null;`)], // entities exist in the fixture project
  invalid: [],
});

// ------------------------------------------------------------------------- fixtureIds file loader
describe("fixtureIds file (archie-view-law.fixtures.json)", () => {
  const dir = mkdtempSync(join(tmpdir(), "view-law-fx-"));
  const write = (name: string, body: string) => {
    writeFileSync(join(dir, name), body);
    return join(dir, name);
  };
  it("reads a bare array and an object form; ignores non-strings", () => {
    expect(loadFixtureIds(write("a.json", `["b1","b2"]`))).toEqual(["b1", "b2"]);
    expect(loadFixtureIds(write("b.json", `{"fixtureIds":["x1", 3]}`))).toEqual(["x1"]);
  });
  it("is undefined when the file is missing or malformed (the rule stays a no-op)", () => {
    expect(loadFixtureIds(join(dir, "nope.json"))).toBeUndefined();
    expect(loadFixtureIds(write("c.json", `{oops`))).toBeUndefined();
  });
  it("viewLawConfig feeds the ids to fixture-id-literal and keeps the view ignores", () => {
    const cfg = viewLawConfig({ fixturesFile: write("d.json", `["booking-001"]`) });
    expect(cfg.rules["archie-view-law/fixture-id-literal"]).toEqual(["error", { fixtureIds: ["booking-001"] }]);
    expect(cfg.ignores).toEqual([...VIEW_IGNORES]);
    expect(viewLawConfig({ fixtureIds: ["z"], fixturesFile: write("e.json", `["q"]`) }).rules["archie-view-law/fixture-id-literal"]).toEqual(["error", { fixtureIds: ["z"] }]);
    rmSync(dir, { recursive: true, force: true });
  });
});
