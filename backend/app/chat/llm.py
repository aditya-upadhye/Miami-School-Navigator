"""Provider-neutral LLM adapter for any OpenAI-compatible `/chat/completions` endpoint with tool calling.

Works with Gemma 4 / Gemini through Google's OpenAI-compatible endpoint (the default), and with Groq, OpenRouter, Together,
Ollama, vLLM, LM Studio or OpenAI itself: change environment variables, not code (see .env.example and README).

    LLM_PROVIDER   gemini (default) | groq | openrouter | together | ollama | vllm | openai | custom
    LLM_BASE_URL   override the provider preset's base URL
    LLM_MODEL      model id (default for gemini: gemma-4-26b-a4b-it; other providers need it set)
    LLM_API_KEY    key (falls back to the provider's usual variable, e.g. GEMINI_API_KEY, GROQ_API_KEY); not needed for local servers
    LLM_TEMPERATURE  default 0.1 (the spec asks for low temperature); set it empty to leave the model default
    LLM_MAX_TOKENS, LLM_TIMEOUT
    LLM_RPM        client-side cap on requests per minute (e.g. 40); 0 = unlimited. Avoids bursting past a provider's limit.
    LLM_TPM        client-side cap on tokens per minute (input + output; e.g. 14000 for Google's 16K free Gemma tier); 0 = unlimited.
                   Token limits, not request limits, are what a multi-call chat turn hits first.
    LLM_SYSTEM_MODE  auto (default) | system | fold. `fold` puts the instructions inside the first user message, for models
                     that reject a system role. `auto` tries `system` and falls back to `fold`.
    LLM_EXTRA_BODY   JSON merged into every request body, for provider-specific options (e.g. {"reasoning_effort": "low"})

The adapter is deliberately tolerant: it adapts to a 400 that rejects the system role, `temperature`, or `tool_choice`, remembers
the adaptation, and retries; it waits out a provider's 429 retry delay; it normalizes tool calls (string or object arguments,
missing ids) and strips <think>/<thought> blocks.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

log = logging.getLogger("chat")

# ---------------------------------------------------------------------------------------------------------- presets
PRESETS: dict[str, dict[str, Any]] = {
    # Tested 2026-10-15: gemma-4-26b-a4b-it answered in ~2s with native tool calls. gemma-4-31b-it was listed but did not respond
    # within 110s on a free-tier key.
    "gemini": {"base_url": "https://generativelanguage.googleapis.com/v1beta/openai", "key_env": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
               "model": "gemma-4-26b-a4b-it", "needs_key": True,
               # Gemma 4 always "thinks" and can spend a small token cap on that and return nothing (2-80 s). Short card notes use this non-thinking model.
               "fast_model": "gemini-flash-lite-latest"},
    # Measured 2026-10-17: the same two-call chat turn took 21s on gemma-4-26b (Google free tier), 1.7s on cerebras qwen-3.8-27b.
    "cerebras": {"base_url": "https://api.cerebras.ai/v1", "key_env": ["CEREBRAS_API_KEY"], "model": "qwen-3.8-27b", "needs_key": True},
    "nvidia": {"base_url": "https://integrate.api.nvidia.com/v1", "key_env": ["NVIDIA_API_KEY"], "model": None, "needs_key": True},
    "groq": {"base_url": "https://api.groq.com/openai/v1", "key_env": ["GROQ_API_KEY"], "model": None, "needs_key": True},
    "openrouter": {"base_url": "https://openrouter.ai/api/v1", "key_env": ["OPENROUTER_API_KEY"], "model": None, "needs_key": True},
    "together": {"base_url": "https://api.together.xyz/v1", "key_env": ["TOGETHER_API_KEY"], "model": None, "needs_key": True},
    "openai": {"base_url": "https://api.openai.com/v1", "key_env": ["OPENAI_API_KEY"], "model": None, "needs_key": True},
    "ollama": {"base_url": "http://localhost:11434/v1", "key_env": [], "model": None, "needs_key": False},
    "vllm": {"base_url": "http://localhost:8000/v1", "key_env": [], "model": None, "needs_key": False},
    "custom": {"base_url": None, "key_env": [], "model": None, "needs_key": False},
}


class LlmUnavailable(RuntimeError):
    """Not configured, the provider failed, or the answer was unusable; the caller falls back to structured results."""


@dataclass
class LlmConfig:
    provider: str = "gemini"
    base_url: str | None = None
    model: str | None = None
    api_key: str | None = None
    temperature: float | None = 0.1
    max_tokens: int = 4096
    timeout: float = 90.0
    system_mode: str = "auto"
    rpm: int = 0
    tpm: int = 0
    extra_body: dict = field(default_factory=dict)

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "LlmConfig":
        if env is None:
            from ..config import load_env_file

            load_env_file()  # backend/.env, never overriding variables already set in the shell
        e = os.environ if env is None else env
        provider = (e.get("LLM_PROVIDER") or "gemini").strip().lower()
        preset = PRESETS.get(provider, PRESETS["custom"])
        key = e.get("LLM_API_KEY") or next((e[k] for k in preset["key_env"] if e.get(k)), None)
        temp_raw = e.get("LLM_TEMPERATURE", "0.1")
        try:
            extra = json.loads(e["LLM_EXTRA_BODY"]) if e.get("LLM_EXTRA_BODY") else {}
        except json.JSONDecodeError:
            extra = {"__invalid__": e["LLM_EXTRA_BODY"]}
        return cls(provider=provider, base_url=(e.get("LLM_BASE_URL") or preset["base_url"] or "").rstrip("/") or None,
                   model=e.get("LLM_MODEL") or preset["model"], api_key=key,
                   temperature=float(temp_raw) if temp_raw.strip() else None,
                   max_tokens=int(e.get("LLM_MAX_TOKENS", 4096)), timeout=float(e.get("LLM_TIMEOUT", 90)),
                   system_mode=(e.get("LLM_SYSTEM_MODE") or "auto").lower(), rpm=int(e.get("LLM_RPM") or 0), tpm=int(e.get("LLM_TPM") or 0), extra_body=extra)

    def problems(self) -> list[str]:
        out = []
        preset = PRESETS.get(self.provider)
        if preset is None:
            out.append(f"unknown LLM_PROVIDER '{self.provider}' (use one of: {', '.join(PRESETS)})")
        if not self.base_url:
            out.append("LLM_BASE_URL is not set")
        if not self.model:
            out.append(f"LLM_MODEL is not set (required for provider '{self.provider}')")
        if (preset or {}).get("needs_key") and not self.api_key:
            names = " or ".join(["LLM_API_KEY"] + (preset or {}).get("key_env", []))
            out.append(f"no API key: set {names}")
        if self.system_mode not in {"auto", "system", "fold"}:
            out.append("LLM_SYSTEM_MODE must be auto, system or fold")
        if "__invalid__" in self.extra_body:
            out.append("LLM_EXTRA_BODY is not valid JSON")
        return out

    def describe(self) -> dict:
        """Safe to show anywhere: never includes the key."""
        return {"provider": self.provider, "model": self.model, "base_url": self.base_url, "configured": not self.problems(),
                "problems": self.problems()}


# ------------------------------------------------------------------------------------------------------------ turns
@dataclass
class LlmTurn:
    text: str = ""
    tool_calls: list[dict] = field(default_factory=list)  # {"id", "name", "input": dict, "invalid": str | None}
    finish_reason: str = "stop"
    assistant_message: dict = field(default_factory=dict)  # neutral message to append to the conversation
    usage: dict = field(default_factory=dict)


def make_turn(text: str = "", tool_calls: list[dict] | None = None, finish_reason: str | None = None, usage: dict | None = None) -> LlmTurn:
    calls = [{"id": c.get("id") or f"call_{i}", "name": c["name"], "input": c.get("input") or {}, "invalid": c.get("invalid")}
             for i, c in enumerate(tool_calls or [])]
    msg: dict[str, Any] = {"role": "assistant", "content": text or None}
    if calls:
        msg["tool_calls"] = [{"id": c["id"], "type": "function", "function": {"name": c["name"], "arguments": json.dumps(c["input"], ensure_ascii=False)}}
                             for c in calls]
    return LlmTurn(text=text, tool_calls=calls, finish_reason=finish_reason or ("tool_calls" if calls else "stop"), assistant_message=msg, usage=usage or {})


class Llm(Protocol):
    def create(self, *, system: str, messages: list[dict], tools: list[dict], force_no_tools: bool = False) -> LlmTurn: ...


_THINK = re.compile(r"<(think|thinking|thought)>.*?</\1>", re.S | re.I)


_LEAK_BLOCK = re.compile(r"<tool_call>.*?(?:</tool_call>|$)", re.S | re.I)
_LEAK_FN = re.compile(r"function=([A-Za-z_][\w]*)>?(.*?)(?=</function>|</tool_call>|function=|$)", re.S)
_LEAK_PARAM = re.compile(r"<parameter=([A-Za-z_][\w]*)>\s*(.*?)\s*</parameter>", re.S)


def extract_leaked_calls(text: str) -> tuple[str, list[dict]]:
    """Some models write a tool call as plain text (`<tool_call>function=search_schools><parameter=ages>[7]</parameter>...`) instead of using
    the tool-call channel. Turn that into real calls and remove it from the answer, so the family never sees it and the search still runs."""
    calls: list[dict] = []
    for block in _LEAK_BLOCK.findall(text or ""):
        body = block[len("<tool_call>"):]
        try:  # the JSON flavour: {"name": "...", "arguments": {...}}
            obj = json.loads(re.sub(r"</?tool_call>", "", body).strip())
            if isinstance(obj, dict) and obj.get("name"):
                calls.append({"id": f"leak_{len(calls)}", "name": obj["name"], "input": obj.get("arguments") or obj.get("parameters") or {}, "invalid": None})
                continue
        except ValueError:
            pass
        for name, rest in _LEAK_FN.findall(body):
            args = {}
            for k, v in _LEAK_PARAM.findall(rest):
                try:
                    args[k] = json.loads(v)
                except ValueError:
                    args[k] = v
            calls.append({"id": f"leak_{len(calls)}", "name": name, "input": args, "invalid": None})
    return _LEAK_BLOCK.sub("", text or "").strip(), calls


def strip_reasoning(text: str) -> str:
    return _THINK.sub("", text or "").strip()


def to_openai_tools(tools: list[dict]) -> list[dict]:
    out = []
    for t in tools:
        schema = json.loads(json.dumps(t["input_schema"]))  # deep copy
        if not schema.get("required"):
            schema.pop("required", None)  # some providers reject an empty `required` list
        out.append({"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": schema}})
    return out


# -------------------------------------------------------------------------------------------------------- adapter
class OpenAICompatLlm:
    def __init__(self, cfg: LlmConfig, client: httpx.Client | None = None, sleep=time.sleep):
        problems = cfg.problems()
        if problems:
            raise LlmUnavailable("; ".join(problems))
        self.cfg = cfg
        self.client = client or httpx.Client(timeout=cfg.timeout)
        self._sleep = sleep
        self._fold = cfg.system_mode == "fold"
        self._send_temperature = cfg.temperature is not None
        self._min_gap = 60.0 / cfg.rpm if cfg.rpm > 0 else 0.0
        self._last_call = 0.0
        self._clock = time.monotonic
        self._window: list[tuple[float, int]] = []  # (time, tokens) of recent requests, for the tokens-per-minute cap

    # ---- request building ----
    def _messages(self, system: str, messages: list[dict]) -> list[dict]:
        if not self._fold:
            return [{"role": "system", "content": system}, *messages]
        out = [dict(m) for m in messages]
        header = f"[INSTRUCTIONS - follow these for the whole conversation]\n{system}\n[END INSTRUCTIONS]\n\n"
        for m in out:
            if m["role"] == "user":
                m["content"] = header + (m["content"] or "")
                break
        else:
            out.insert(0, {"role": "user", "content": header})
        return out

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.cfg.api_key:
            h["Authorization"] = f"Bearer {self.cfg.api_key}"
        return h

    @staticmethod
    def _retry_delay(resp: httpx.Response, attempt: int) -> float:
        """Seconds to wait before retrying: the provider's own hint on a 429 (capped at 30s), otherwise a short backoff."""
        backoff = 1.5 * (attempt + 1)
        if resp.status_code != 429:
            return backoff
        hint = resp.headers.get("retry-after", "").strip()
        seconds = 0.0
        if re.fullmatch(r"\d+(\.\d+)?", hint):
            seconds = float(hint)
        else:
            m = re.search(r'retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s|retry in (\d+(?:\.\d+)?)s', resp.text[:2000], re.I)
            if m:
                seconds = float(next(g for g in m.groups() if g))
        return min(max(seconds + 1.0, backoff), 30.0)

    def _wait_for_token_budget(self, body: dict) -> int:
        """Sleep until sending `body` would stay under LLM_TPM; returns the estimated input tokens (chars/3.5, a safe over-estimate)."""
        estimate = int(len(json.dumps(body, ensure_ascii=False)) / 3.5)
        if not self.cfg.tpm:
            return estimate
        while True:
            now = self._clock()
            self._window = [(t, n) for t, n in self._window if now - t < 60]
            used = sum(n for _, n in self._window)
            if used + estimate <= self.cfg.tpm or not self._window:  # a request bigger than the whole budget cannot wait its way in
                return estimate
            oldest = self._window[0][0]
            self._sleep(max(oldest + 60 - now, 0.5) + 0.2)

    def _post(self, body: dict) -> httpx.Response:
        url = f"{self.cfg.base_url}/chat/completions"
        last = "no response"
        estimate = self._wait_for_token_budget(body)
        for attempt in range(3):
            if self._min_gap:  # spread requests so a burst of tool-call rounds stays under the provider's per-minute limit
                wait = self._last_call + self._min_gap - self._clock()
                if wait > 0:
                    self._sleep(wait)
                self._last_call = self._clock()
            self._window.append((self._clock(), estimate))  # provisional; replaced by the real usage once the response arrives
            try:
                resp = self.client.post(url, json=body, headers=self._headers())
            except httpx.TimeoutException as exc:
                raise LlmUnavailable(f"timed out after {self.cfg.timeout:g}s") from exc
            except httpx.HTTPError as exc:
                raise LlmUnavailable(f"cannot reach {self.cfg.base_url}: {type(exc).__name__}") from exc
            if resp.status_code in (429, 500, 502, 503, 504):
                last = f"HTTP {resp.status_code}"
                if attempt < 2:
                    self._sleep(self._retry_delay(resp, attempt))
                    continue
                if resp.status_code == 429:
                    q = re.search(r"(Per(?:Day|Minute|Hour)[A-Za-z]*)", resp.text)  # Google names the quota that was exceeded
                    which = f" [{q.group(1)}]" if q else ""
                    raise LlmUnavailable(f"rate limit or quota exceeded (HTTP 429){which}: slow down, upgrade the plan, or switch LLM_MODEL/LLM_PROVIDER")
            return resp
        raise LlmUnavailable(f"provider kept failing ({last})")

    def create(self, *, system: str, messages: list[dict], tools: list[dict], force_no_tools: bool = False) -> LlmTurn:
        body: dict[str, Any] = {"model": self.cfg.model, "max_tokens": self.cfg.max_tokens, **self.cfg.extra_body}
        if tools:
            body["tools"] = to_openai_tools(tools)
            if force_no_tools:
                body["tool_choice"] = "none"
        for _ in range(4):  # initial try + up to three adaptations
            body["messages"] = self._messages(system, messages)
            if self._send_temperature:
                body["temperature"] = self.cfg.temperature
            else:
                body.pop("temperature", None)
            resp = self._post(body)
            if resp.status_code == 200:
                turn = self._parse(resp.json())
                real = (turn.usage.get("input_tokens") or 0) + (turn.usage.get("output_tokens") or 0)
                if real and self._window:
                    self._window[-1] = (self._window[-1][0], real)
                return turn
            detail = resp.text[:300]
            low = detail.lower()
            if resp.status_code == 400 and any(w in low for w in ("authorization", "api key", "api_key", "apikey", "credential")):
                raise LlmUnavailable("authentication failed: check LLM_API_KEY")  # Google returns 400, not 401, for a missing/invalid key
            if resp.status_code == 400:
                if not self._fold and self.cfg.system_mode == "auto" and ("system" in low or "developer" in low or "instruction" in low):
                    self._fold = True  # this model/endpoint has no system role: fold the instructions into the first user message
                    continue
                if self._send_temperature and "temperature" in low:
                    self._send_temperature = False
                    continue
                if "tool_choice" in body and ("tool_choice" in low or "tool choice" in low or "tools" in low):
                    body.pop("tool_choice", None)
                    if force_no_tools:  # no way to say "no tools": drop them (the conversation history is still valid text)
                        body.pop("tools", None)
                    continue
            if resp.status_code in (401, 403):
                raise LlmUnavailable("authentication failed: check LLM_API_KEY")
            if resp.status_code == 404:
                raise LlmUnavailable(f"model or endpoint not found: check LLM_MODEL ('{self.cfg.model}') and LLM_BASE_URL")
            raise LlmUnavailable(f"HTTP {resp.status_code}: {detail}")
        raise LlmUnavailable("provider rejected the request after adapting")

    # ---- response parsing ----
    def _parse(self, data: dict) -> LlmTurn:
        try:
            choice = data["choices"][0]
            msg = choice.get("message") or {}
        except (KeyError, IndexError, TypeError) as exc:
            raise LlmUnavailable("unexpected response shape from provider") from exc
        calls = []
        for i, tc in enumerate(msg.get("tool_calls") or []):
            fn = tc.get("function") or {}
            raw = fn.get("arguments")
            invalid = None
            if isinstance(raw, dict):
                args = raw
            else:
                try:
                    args = json.loads(raw) if raw and str(raw).strip() else {}
                    if not isinstance(args, dict):
                        raise ValueError
                except (ValueError, TypeError):
                    args, invalid = {}, str(raw)[:200]
            calls.append({"id": tc.get("id") or f"call_{i}", "name": fn.get("name", ""), "input": args, "invalid": invalid})
        usage = data.get("usage") or {}
        text = strip_reasoning(msg.get("content") or "")
        if "<tool_call>" in text.lower():
            text, leaked = extract_leaked_calls(text)
            if not calls:
                calls = leaked
        return make_turn(text, calls,
                         "length" if choice.get("finish_reason") == "length" else None,
                         {"input_tokens": usage.get("prompt_tokens"), "output_tokens": usage.get("completion_tokens")})


class FallbackLlm:
    """Tries the main model, then each backup in order when one is down, rate limited or over its daily cap (LLM_BACKUPS)."""

    def __init__(self, models: list[tuple[Llm, int]], clock=time.time) -> None:
        self.models, self._clock = models, clock
        self._day, self._used = "", [0] * len(models)

    def create(self, **kw) -> LlmTurn:
        day = time.strftime("%Y-%m-%d", time.localtime(self._clock()))
        if day != self._day:
            self._day, self._used = day, [0] * len(self.models)
        last: Exception | None = None
        for i, (llm, cap) in enumerate(self.models):
            if cap and self._used[i] >= cap:
                continue
            try:
                turn = llm.create(**kw)
            except LlmUnavailable as exc:
                last = exc
                log.warning("model %d unavailable (%s), trying the next one", i, exc)
                continue
            self._used[i] += 1
            return turn
        raise last or LlmUnavailable("every configured model is over its daily cap")


_shared: dict[str, Llm] = {}


def _backup_cfgs(env) -> list[tuple[LlmConfig, int]]:
    """LLM_BACKUPS="provider:model@daily_calls,provider:model": each backup uses its own provider's key and URL."""
    out = []
    for item in (env.get("LLM_BACKUPS") or "").split(","):
        item = item.strip()
        if not item:
            continue
        spec, _, cap = item.partition("@")
        provider, _, model = spec.partition(":")
        e = {k: v for k, v in env.items() if k not in ("LLM_API_KEY", "LLM_BASE_URL", "LLM_RPM", "LLM_TPM", "LLM_BACKUPS")}
        e["LLM_PROVIDER"] = provider.strip().lower()
        if model.strip():
            e["LLM_MODEL"] = model.strip()
        else:
            e.pop("LLM_MODEL", None)
        out.append((LlmConfig.from_env(e), int(cap) if cap.strip().isdigit() else 0))
    return out


def default_llm(cfg: LlmConfig | None = None, client: httpx.Client | None = None) -> Llm:
    if cfg is not None or client is not None:
        return OpenAICompatLlm(cfg or LlmConfig.from_env(), client)
    # One shared instance per configuration: it keeps the HTTP connection open (no new TLS handshake for every chat turn) and the rate-limit state.
    cfg = LlmConfig.from_env()
    key = repr((cfg, os.environ.get("LLM_BACKUPS")))
    if key not in _shared:
        _shared.clear()
        primary = OpenAICompatLlm(cfg)
        backups = []
        for bcfg, cap in _backup_cfgs(os.environ):
            try:
                backups.append((OpenAICompatLlm(bcfg), cap))
            except LlmUnavailable as exc:
                log.warning("backup model skipped: %s", exc)
        _shared[key] = FallbackLlm([(primary, 0), *backups]) if backups else primary
    return _shared[key]
