from __future__ import annotations

from datetime import date

from ..i18n import current_lang, t
from ..schemas import DatesResponse, KeyDate
from .context import Navigator


def key_dates(nav: Navigator, kinds: set[str] | None = None, today: date | None = None, lang: str | None = None) -> list[KeyDate]:
    today = today or date.today()
    lang = lang or current_lang()
    out = []
    for d in nav.rules.get("dates", []):
        if kinds and not kinds & set(d["applies_to"]):
            continue
        when = date.fromisoformat(d["date"])
        label = (d.get("i18n", {}).get(lang) or {}).get("label") or d["label"]
        out.append(KeyDate(id=d["id"], label=label, date=d["date"], approximate=d["approximate"], days_until=(when - today).days,
                           applies_to=d["applies_to"], field=nav.rule_field(d["rule_id"], value=d["date"], lang=lang)))
    return sorted(out, key=lambda k: k.date)


def get_dates(nav: Navigator) -> DatesResponse:
    notes = []
    if any("unconfirmed" in (k.field.method or "") or "single_secondary" in (k.field.method or "") for k in key_dates(nav)):
        notes.append(t("dates.note"))
    return DatesResponse(dates=key_dates(nav), as_of=nav.rules.get("as_of"), notes=notes)
