# Grok research prompt: Miami-Dade school details for a parent-facing comparison tool

> Paste this whole file into Grok with web browsing / Deep Search on. Reply format is strict JSON, so the answer can be loaded straight into the app.

## ROLE

You are a meticulous education-data researcher filling in a school comparison tool for families in Miami-Dade, Florida. Each cell in the app shows a value, **where it came from, and a date**, so every value needs a real source URL you opened. A blank cell is acceptable. A wrong cell is not: never guess, never infer from a school's name, never copy one school's values to another, never fill a gap with a "typical" value.

This batch has **{{N}} schools**. The table at the bottom lists each one with a column **NEEDS**: research only those fields (the school's other data is already loaded and verified from FLDOE and the county).

## HOW TO WORK (this matters: the last pass gave up too early)

Do not stop at a school's home page. For **every school**, in this order:

1. **District-wide and state sources first. One document often answers many schools at once.**
   - M-DCPS magnet catalog and search: https://yourchoicemiami.org/program-search (and the current catalog PDF linked there). Gives magnet status and themes for every M-DCPS magnet.
   - M-DCPS school page: `https://www3.dadeschools.net/SchoolInformation/school/<number>/details` (use the number in the table; try `www.` if `www3.` fails). Read **every section**: hours, uniform, programs/services, contact. The page is JavaScript-rendered; if you only get an empty shell, say so in the note and move on.
   - M-DCPS before/after-school care: search dadeschools.net for "Before and After School Care", "Extended Day", "Community Education after school", and the fee schedule. Look for a **list of participating schools** and the district fee.
   - M-DCPS Exceptional Student Education (ESE) pages: lists of ESE centers, autism/ASD clusters, inclusion and self-contained programs by school.
   - IB: the IB organisation's "Find an IB World School" (ibo.org) filtered to Miami-Dade. Cambridge AICE and Montessori (AMS/AMI) school directories where relevant.
   - Private schools: the FLDOE Private School Directory (fldoe.org, school-choice / private school directory) for enrollment, grades, accreditation and scholarship participation, and Step Up For Students' participating-school search (stepupforstudents.org) for FES-EO / FES-UA / FTC / PEP participation.
2. **The school's own website.** Open the home page, then find and open the pages most likely to hold what is NEEDED: About, Academics/Programs, Student Services, **ESE / Special Education / Exceptional Student Education**, **Before & After Care / Extended Day / Aftercare**, Admissions/Enrollment, Calendar, **Bell Schedule / School Hours**, Parent/Student Handbook (PDF). Use the site's own search box or a web search like `site:<school-domain> "after care"` when the menu does not show it.
3. **A web search** for the school name plus the field ("<school> after care fees", "<school> bell schedule 2026-27") as a last step.

**School hours are published for every school** (bell schedule, handbook, school page, or enrollment page). Look until you find them. Record grade bands separately if they differ (e.g. "PK-1: 8:20am-1:50pm; 2-5: 8:35am-3:05pm; Wed early release 1:50pm").

Only after trying the sources above may you return `null` for a field, and then the note must list the exact URLs you tried (at least two). "No page opened" is not an acceptable note: open it.

## WHAT TO RESEARCH (only the fields in each school's NEEDS cell)

| NEEDS key | What to return | Rules |
|---|---|---|
| `website` | The school's **own official site**, full `https://` URL | Not Facebook, GreatSchools, Niche, or a directory listing. |
| `school_hours` | String, e.g. `"8:00am-3:00pm (K-5); early release Wed 2:00pm"` | Put under `optional.school_hours`. Current school year (2026-27, else 2025-26) and say which in `year`. |
| `aftercare` | `{ "before_care": bool\|null, "after_care": bool\|null, "hours": str\|null, "cost": str\|null, "provider": str\|null }` | `true` only if documented for **this** school. `cost` = the published price in the school's words (`"$65/week"`, `"$320/month"`) or `"varies, contact school"` if it exists but no price is published. `provider` = who runs it (school-run, M-DCPS Community Education, YMCA, Boys & Girls Club, etc.). If the district page lists this school as having a care program, that counts. |
| `ese` | `{ "offers_ese": bool, "details": str }` | `true` when the school or district documents any of: an ESE/special-education department, teachers or staff, inclusion or self-contained classes, resource room, autism/ASD program, speech/OT/PT services, IEP/504 support (for private schools: services for students with learning differences, or accepting McKay/FES-UA/Gardiner students with IEPs). `details` = what exactly, in one sentence. `false` only if the school states it does not serve students with disabilities. Gifted programs are **not** ESE: put those in `specialties` as `"Gifted"`. |
| `specialties` | List from: `"STEM"`, `"Arts"`, `"Bilingual"`, `"IB"`, `"Montessori"`, `"International"`, `"Cambridge"`, `"AP Capstone"`, `"Career/Technical"`, `"Gifted"`, `"Early Learning"`, `"Sports"`, `"Religious"`, `"Dual Enrollment"` | Only what the school or an official registry documents. `Bilingual` = dual-language / two-way immersion, not just "Spanish class". `IB` = authorised IB programme (say PYP/MYP/DP in the detail). `STEM` = a STEM/STEAM/robotics/engineering **programme or academy**, not one club. Put a one-line evidence note per tag in a top-level `specialties_detail` object. |
| `is_magnet`, `magnet_themes` | `true/false`; list of theme names exactly as the M-DCPS catalog words them | Public M-DCPS schools only. `false` is valid when the current catalog/search does not list the school (say which you checked). |
| `tuition` | Number: annual tuition in USD for **elementary grades (K-5, or the lowest elementary grade offered)**, current published rate | Private schools only. Put the range, registration fees and any sibling discount in the `note`. If tuition is genuinely not published ("contact admissions"), `null` and say so. |
| `scholarships` | List from: `"FES Educational Options"`, `"FES Unique Abilities"`, `"Florida Tax Credit (FTC)"`, `"PEP Hybrid"`, `"McKay"`, `"Gardiner"` | Private schools only. Participation per the FLDOE directory, Step Up For Students, or the school. `[]` only if a source says the school does not participate. |
| `enrollment` | Integer, total students, with `year` | Private schools: FLDOE directory or the school. |
| `application_method` | String, e.g. `"Rolling admissions; application, family interview, entrance assessment"` | Private schools: put under `optional.application_method`. |

Also, **if you happen to see them** while on the school's pages, add under `optional`: `uniform_required` (true/false), `student_teacher_ratio` (number), `transportation` (`"M-DCPS bus"` / `"school bus available (fee)"` / `"none"`). Do not spend extra time on these.

## OUTPUT FORMAT (strict)

One **JSON array in a single ```json code block**, **one school object per line, compact (no pretty-printing)** so the answer is not truncated. No commentary inside the block. Only these keys per school: `id` (exactly as in the table), `name_verified`, `identity_note` (null unless there is an identity problem: school closed, renamed, different address, merged), `researched_on` (`YYYY-MM-DD`), the NEEDS fields, and `optional`. Never output keys for fields that were not in NEEDS.

Every data value is a **cited value**:

```json
{"id":"pub-1441","name_verified":"Paul Laurence Dunbar K-8 Center","identity_note":null,"researched_on":"2026-10-17","aftercare":{"value":{"before_care":true,"after_care":true,"hours":"7:00-8:15am, 3:05-6:00pm","cost":"$55/week","provider":"M-DCPS Community Education"},"year":"2026-27","source_type":"official","source_url":"https://...","as_of":"2026-10-17","confidence":"high","note":null},"ese":{"value":{"offers_ese":true,"details":"Inclusion classes and a self-contained ASD classroom listed on the school's Student Services page"},"year":null,"source_type":"school","source_url":"https://...","as_of":"2026-10-17","confidence":"high","note":null},"specialties":{"value":["STEM"],"year":null,"source_type":"school","source_url":"https://...","as_of":"2026-10-17","confidence":"medium","note":null},"specialties_detail":{"STEM":"STEM lab and robotics academy on the Programs page"},"optional":{"school_hours":{"value":"7:45am-2:15pm","year":"2026-27","source_type":"school","source_url":"https://...","as_of":"2026-10-17","confidence":"high","note":null}}}
```

- `value`: exactly the format in the table. `null` when not verified.
- `source_type`: `"official"` (FLDOE, M-DCPS, county, IB, state registry), `"school"` (the school's or operator's own website or handbook), `"third_party"` (GreatSchools, Niche, news; only if nothing official or school-owned exists), or `null` when `value` is null.
- `source_url`: the **exact page or PDF** where you saw the value. Never a homepage you did not read the value on. Never a URL you did not open.
- `as_of`: when the data is current to (`YYYY-MM-DD`, or `2026-27`).
- `confidence`: `"high"` (read directly on a primary source for this campus), `"medium"` (older, indirect, or the campus match is slightly uncertain), `"low"` (conflicting or third-party only). Never inflate.
- `note`: for a `null` value, `"not_found: tried <url1>, <url2>, ..."`. For conflicts, give both values and sources and say which you used.

## HARD RULES

1. **No fabrication.** 20 honest nulls beat 1 invented value.
2. **Verify the campus**: match name + street address + grades to the table. If a school is closed, renamed, or at another address, say so in `identity_note` and research nothing else for it.
3. **One school at a time.** Schools sharing a campus or operator (Mater, SLAM, BridgePrep, Somerset, Success Academy, etc.) get their own research.
4. **Public numbers are 0-100** as numbers, not strings. Phone numbers and public websites only; no personal emails, no private individuals.
5. **Stay in your lane**: no rankings, no marketing copy, no extra fields.
6. If you run out of room, return the schools you completed and list the remaining ids in plain text below the block. **Never abbreviate with "..." or "etc." inside the JSON.**

## AFTER THE JSON BLOCK

A plain-text **Gaps report**: one line per `null` in a NEEDS field: `id - field - URLs tried`. Then one line: how many schools you fully completed.
