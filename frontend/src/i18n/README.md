# Translating the app (English, Spanish, Haitian Creole)

English is authoritative. Spanish (`es`) and Haitian Creole (`ht`) are **AI-written and not reviewed by a native speaker**. Say so in any
doc you touch; never imply they are reviewed.

## How it works

* `src/i18n/catalog/<area>.js` each export `{ en: {...}, es: {...}, ht: {...} }`. They are merged in `src/i18n/messages.js`. One file per area
  (`core` = nav + planner + status text, `landing`, `onboarding`, `explore`, `school`, `pathway`, `shared`). Keys are unique across files
  (a test fails otherwise) and prefixed with the area (`explore.filters.title`). All three languages must have identical keys and identical
  `{placeholders}` (tests enforce this).
* In a component or hook: `const { t, tp, date, monthDay, days, nf, lang } = useI18n();` (`src/i18n/index.js`).
  * `t('explore.title', { n: 3 })` fills `{n}`.
  * `tp('explore.schools', n)` picks `explore.schools.one` / `explore.schools.other` and passes `{n}`.
  * `date(iso)` formats an ISO date (`2027-01-15`) the local way; `nf(n)` formats a number.
* Plain functions that are not components can use `translate(getLang(), key, vars)` (`src/i18n/messages.js`, `src/i18n/current.js`).
  `src/api/fields.js` helpers (`text`, `miles`, `tuition`, `stateGrade`, `percent`, `KIND_LABEL`, `STAGE_LABEL`, ...) are already translated.
* Hooks that build strings and memoize them must list `lang` (or `t`) in the dependency array. Every page re-renders on a language change.
* The API client sends `X-Lang` on every request, so **the backend returns its own text (notes, "not available" explanations, reasons,
  questions to ask, compare labels, errors) already in the family's language.** Display those strings as they arrive; do not translate API
  strings in the frontend. You may map a known code or status to a key.
* Verification labels already exist: `t('verify.<level>.label')` and `t('verify.<level>.note')` for `confirmed_district_source`,
  `other_district_policies`, `single_secondary_source`, `unconfirmed_project_spec`; use `verificationInfo(field)` for the level.

## Rules

1. **English must stay byte-identical** to what it is today (browser tests match English text). Move the string into the `en` catalog unchanged.
2. **No visible English left in JSX or hooks**: headings, buttons, labels, placeholders, `aria-label`, `title`, `alt`, `<option>` text,
   tooltips, empty states, error text, loading text, pluralised text. Split sentences that mix JSX (links, `<strong>`) into separate keys so
   word order can change; never glue translated fragments together.
3. **Keep as written:** the brand "School Navigator" / "MIAMI-DADE", school and place names, addresses, acronyms and official programme names
   (M-DCPS, VPK, ESE, IEP, 504, STEM, IB, FLDOE, FES, FTC, PEP, Step Up For Students), and any value that comes from the API.
4. **Meaning must be exactly preserved**, including every number, date and caveat ("not confirmed", "estimate", "ask the school").
   Do not soften or strengthen a claim. Never invent facts.
5. Tone: plain language for families. Spanish uses *usted*. Haitian Creole uses standard Akademi Kreyòl spelling. Keep sentences short.

## Glossary (use these terms everywhere)

| English | Español | Kreyòl |
| --- | --- | --- |
| school | escuela | lekòl |
| elementary / middle / high school | primaria / intermedia / secundaria | primè / entèmedyè / segondè |
| public / charter / private | pública / chárter / privada | piblik / charter / prive |
| early learning | educación temprana | edikasyon bonè |
| child care | cuidado infantil | swen timoun |
| magnet (programme) | magnet | magnet |
| attendance zone / zoned school | zona de asistencia / escuela asignada por zona | zòn lekòl / lekòl ki asiyen pa zòn |
| district / county / state | distrito / condado / estado | distrik / konte / eta |
| tuition | matrícula | frè lekòl |
| enrollment (students) | estudiantes inscritos | elèv ki enskri |
| state grade (A-F) | calificación estatal (A-F) | nòt leta (A-F) |
| learning gains | avances de aprendizaje | pwogrè aprantisaj |
| match (score) | coincidencia | matche |
| compare | comparar | konpare |
| filters / reset | filtros / restablecer | filtre / reyinisyalize |
| travel distance | distancia de viaje | distans vwayaj |
| scholarship | beca | bous |
| not available | no disponible | pa disponib |
| ask the school | pregunte a la escuela | mande lekòl la |
| source / checked | fuente / verificado | sous / verifye |
| family / child(ren) | familia / hijos, niños | fanmi / timoun |
| Jarvis (the assistant) | Jarvis | Jarvis |

## Testing

`npx vitest run` checks key parity, placeholders, duplicate keys and that longer strings really differ. Browser checks scan each page in
each language for leftover English.
