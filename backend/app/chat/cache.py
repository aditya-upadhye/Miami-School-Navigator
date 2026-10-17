"""In-memory cache of finished chat answers, so a repeated question is returned at once instead of waiting for the model again.

Kept in memory only (never written to disk): a key and an answer can contain a family's address, and the service stores no addresses.
The cache empties when the server restarts. The key covers everything that shapes an answer: language, map mode, the conversation,
what the family told us, today's date (deadlines are relative to it) and the school database file, so rebuilt data is never served stale.
"""
from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from collections import OrderedDict
from datetime import date

from ..schemas import ChatRequest, ChatResponse

_lock = threading.Lock()
_store: OrderedDict[str, tuple[float, ChatResponse]] = OrderedDict()


def _data_version(nav) -> str:
    try:
        st = nav.settings.db_path.stat()
        return f"{st.st_mtime_ns}:{st.st_size}"
    except OSError:
        return "none"


# A short reply or one that points back ("yes", "the second one", "why?") only makes sense with the conversation before it.
_POINTS_BACK = re.compile(r"\b(yes|yeah|yep|no|nope|ok|okay|sure|please|that|those|them|it|this|these|first|second|third|last|same|more|also|why|how about|what about|s[ií]|claro|eso|esos|primero|segundo|iy[eè]|wi|non)\b", re.I)


def standalone(text: str) -> bool:
    return len(text.split()) > 4 and not _POINTS_BACK.search(text)


def make_key(nav, req: ChatRequest, lang: str) -> str:
    """A self-contained question is keyed by itself (so asking it again in a new conversation is still a hit); a follow-up by the whole conversation."""
    norm = [(m.role, " ".join(m.content.casefold().split())) for m in req.messages[-30:]]
    convo = norm[-1:] if standalone(req.messages[-1].content) else norm
    raw = json.dumps([lang, req.map_available, req.map_next, convo, req.profile.model_dump(exclude_none=True), req.map_filters, date.today().isoformat(), _data_version(nav)],
                     ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def get(key: str, ttl: float) -> ChatResponse | None:
    with _lock:
        hit = _store.get(key)
        if not hit:
            return None
        if time.monotonic() - hit[0] > ttl:
            del _store[key]
            return None
        _store.move_to_end(key)
        return hit[1].model_copy(deep=True, update={"cached": True})


def put(key: str, resp: ChatResponse, max_entries: int) -> None:
    if resp.degraded:  # the model was down: the next try may well succeed, so never keep the fallback
        return
    with _lock:
        _store[key] = (time.monotonic(), resp.model_copy(deep=True))
        _store.move_to_end(key)
        while len(_store) > max_entries:
            _store.popitem(last=False)


def clear() -> None:
    with _lock:
        _store.clear()
