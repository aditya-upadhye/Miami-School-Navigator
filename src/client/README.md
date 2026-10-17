# `src/client/` — the survivor zone

This folder is **yours**. It holds the client's own code (hand-written components, hooks, pages,
helpers, integrations) and **regeneration never overwrites it**.

## Why it survives

Every time Archie regenerates the app it writes a seal, `.archie/conversion.gen.json`, naming each
path the conversion produced together with a hash of its bytes. Paths the seal names are the
platform's: they are rewritten (or deleted) on the next conversion. Anything the seal does **not**
name is the client's, and is carried over untouched. Nothing in the template or in a conversion ever
puts a file under `src/client/`, so nothing under it is ever named in the seal — which is what makes
it a safe place for work that must outlive a regeneration. (Editing a file the seal *does* name makes
the next conversion refuse to run; see `AGENTS.md`, "The repo has two zones".)

## No lint restrictions

Two lint laws guard the generated tree, and **both stop at this folder's edge**:

- the hexagonal boundaries (`eslint-rules/boundaries/config.js`, law L37): `src/client/**` is
  classified as the `client` element and the rule set places no restriction on what it imports —
  the SDK, any layer, any package;
- the view law (`eslint-rules/archie-view-law`, L38/V3b): it only applies to
  `src/presentation/views/**`.

That freedom is the point of the zone, and it has one consequence worth knowing: the *generated*
layers are still bound, so `src/domain/**` can never import from here (a pure domain imports nothing
outside itself), and generated views must not be given a reason to depend on it. Wire client code in
from the composition root (`src/app/**`) or from your own routes instead.

## Conventions

- Keep to the `@/` alias (`@/client/...`), same as the rest of the app.
- A file you add elsewhere is also yours as long as the seal does not name it; this folder is simply
  the place where "it is mine" is obvious at a glance.
