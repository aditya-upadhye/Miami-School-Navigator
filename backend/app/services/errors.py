from __future__ import annotations

from ..i18n import MESSAGES, current_lang, t


class ApiError(Exception):
    """A client-facing error with a stable code and a next step the family can take.

    `message` and `suggested_action` are the English text. Pass them explicitly, or leave them out to use the catalog entries
    `err.<key>.message` / `err.<key>.action` (`key` defaults to `code`) filled from `params`. The exception handler in `app/main.py` calls
    `localized()` so the response follows the language the request was made in (captured when the error is raised, so a body `lang` on
    /api/plan and /api/chat applies too). Spanish and Haitian Creole texts are AI-written and have not been reviewed by a native speaker.
    """

    def __init__(self, status: int, code: str, message: str | None = None, suggested_action: str | None = None, *,
                 params: dict | None = None, key: str | None = None):
        self.status, self.code, self.params, self.key = status, code, params or {}, key or code
        self.lang = current_lang()
        self.message = message if message is not None else self._text("message", "en") or code
        self.suggested_action = suggested_action if suggested_action is not None else self._text("action", "en")
        super().__init__(self.message)

    def _text(self, part: str, lang: str) -> str | None:
        k = f"err.{self.key}.{part}"
        return t(k, lang, **self.params) if k in MESSAGES else None

    def localized(self, lang: str | None = None) -> tuple[str, str | None]:
        """(message, suggested_action) in `lang` (default: the language captured at raise time); English when no translation exists."""
        lang = lang or self.lang
        if lang == "en":
            return self.message, self.suggested_action
        return self._text("message", lang) or self.message, self._text("action", lang) or self.suggested_action
