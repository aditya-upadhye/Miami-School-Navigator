"""The OpenAI-compatible adapter against a mocked provider (no network, no key)."""
import json

import httpx
import pytest

from app.chat import agent
from app.chat.llm import LlmConfig, LlmUnavailable, OpenAICompatLlm, PRESETS, strip_reasoning, to_openai_tools
from app.chat.tools import TOOLS
from app.schemas import ChatMessage, ChatProfile, ChatRequest, Child
from tests.conftest import WYNWOOD


def cfg(**kw):
    base = dict(provider="custom", base_url="https://llm.test/v1", model="m", api_key="k")
    base.update(kw)
    return LlmConfig(**base)


class Provider:
    """Records requests and replies from a script of (status, json) pairs (the last repeats)."""

    def __init__(self, replies):
        self.replies, self.requests = list(replies), []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append({"url": str(request.url), "headers": dict(request.headers), "body": json.loads(request.content)})
        status, payload = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        return httpx.Response(status, json=payload) if not isinstance(payload, str) else httpx.Response(status, text=payload)

    def llm(self, c=None, **kw) -> OpenAICompatLlm:
        return OpenAICompatLlm(c or cfg(**kw), httpx.Client(transport=httpx.MockTransport(self)), sleep=lambda s: None)


def ok(content="hi", tool_calls=None, finish="stop"):
    msg = {"role": "assistant", "content": content}
    if tool_calls is not None:
        msg["tool_calls"] = tool_calls
    return 200, {"choices": [{"message": msg, "finish_reason": finish}], "usage": {"prompt_tokens": 5, "completion_tokens": 3}}


def call(name, args, id="c1"):
    return {"id": id, "type": "function", "function": {"name": name, "arguments": args if isinstance(args, str) else json.dumps(args)}}


MSGS = [{"role": "user", "content": "hello"}]


# ------------------------------------------------------------------ configuration
def test_default_is_gemma_on_gemini_openai_endpoint():
    c = LlmConfig.from_env({"GEMINI_API_KEY": "abc"})
    assert (c.provider, c.model, c.temperature, c.api_key) == ("gemini", "gemma-4-26b-a4b-it", 0.1, "abc")
    assert c.base_url == "https://generativelanguage.googleapis.com/v1beta/openai" and not c.problems()


def test_switch_providers_by_environment_only():
    groq = LlmConfig.from_env({"LLM_PROVIDER": "groq", "GROQ_API_KEY": "g", "LLM_MODEL": "some-model"})
    assert groq.base_url == "https://api.groq.com/openai/v1" and groq.api_key == "g" and not groq.problems()
    flash = LlmConfig.from_env({"GEMINI_API_KEY": "abc", "LLM_MODEL": "gemini-flash-latest"})
    assert flash.model == "gemini-flash-latest" and flash.provider == "gemini"
    local = LlmConfig.from_env({"LLM_PROVIDER": "ollama", "LLM_MODEL": "gemma4"})
    assert local.base_url == "http://localhost:11434/v1" and local.api_key is None and not local.problems()  # no key needed
    custom = LlmConfig.from_env({"LLM_PROVIDER": "custom", "LLM_BASE_URL": "https://x.example/v1/", "LLM_MODEL": "m", "LLM_API_KEY": "k"})
    assert custom.base_url == "https://x.example/v1" and not custom.problems()
    assert set(PRESETS) >= {"gemini", "groq", "openrouter", "together", "ollama", "vllm", "openai", "custom"}


def test_generic_key_wins_and_problems_are_explicit():
    c = LlmConfig.from_env({"LLM_API_KEY": "generic", "GEMINI_API_KEY": "specific"})
    assert c.api_key == "generic"
    assert any("no API key" in p for p in LlmConfig.from_env({}).problems())
    assert any("LLM_MODEL" in p for p in LlmConfig.from_env({"LLM_PROVIDER": "groq", "GROQ_API_KEY": "g"}).problems())
    assert any("unknown LLM_PROVIDER" in p for p in LlmConfig.from_env({"LLM_PROVIDER": "nope"}).problems())
    assert any("not valid JSON" in p for p in LlmConfig.from_env({"GEMINI_API_KEY": "k", "LLM_EXTRA_BODY": "{oops"}).problems())
    assert LlmConfig.from_env({"GEMINI_API_KEY": "k", "LLM_TEMPERATURE": ""}).temperature is None


def test_describe_never_leaks_the_key():
    d = LlmConfig.from_env({"GEMINI_API_KEY": "super-secret"}).describe()
    assert "super-secret" not in json.dumps(d) and d["configured"] is True


def test_unconfigured_adapter_raises_unavailable():
    with pytest.raises(LlmUnavailable, match="no API key"):
        OpenAICompatLlm(LlmConfig.from_env({}))


# ------------------------------------------------------------------ request shape
def test_request_shape():
    p = Provider([ok("hello back")])
    t = p.llm(extra_body={"reasoning_effort": "low"}, temperature=0.1).create(system="SYS", messages=MSGS, tools=TOOLS)
    r = p.requests[0]
    assert r["url"] == "https://llm.test/v1/chat/completions" and r["headers"]["authorization"] == "Bearer k"
    b = r["body"]
    assert b["model"] == "m" and b["temperature"] == 0.1 and b["reasoning_effort"] == "low" and b["max_tokens"] == 4096
    assert b["messages"][0] == {"role": "system", "content": "SYS"} and b["messages"][1] == MSGS[0]
    names = [x["function"]["name"] for x in b["tools"]]
    assert names == [t["name"] for t in TOOLS] and all(x["type"] == "function" for x in b["tools"])
    dates = next(x for x in b["tools"] if x["function"]["name"] == "get_dates")["function"]["parameters"]
    assert "required" not in dates  # empty `required` lists are dropped for stricter providers
    assert t.text == "hello back" and t.usage == {"input_tokens": 5, "output_tokens": 3}


def test_local_server_sends_no_auth_header():
    p = Provider([ok()])
    p.llm(cfg(provider="ollama", api_key=None)).create(system="s", messages=MSGS, tools=[])
    assert "authorization" not in p.requests[0]["headers"] and "tools" not in p.requests[0]["body"]


def test_force_no_tools_sets_tool_choice_none():
    p = Provider([ok()])
    p.llm().create(system="s", messages=MSGS, tools=TOOLS, force_no_tools=True)
    assert p.requests[0]["body"]["tool_choice"] == "none"


def test_fold_system_mode_puts_instructions_in_first_user_message():
    p = Provider([ok()])
    p.llm(system_mode="fold").create(system="BE HELPFUL", messages=[{"role": "user", "content": "q1"}, {"role": "assistant", "content": "a"}, {"role": "user", "content": "q2"}], tools=[])
    msgs = p.requests[0]["body"]["messages"]
    assert not any(m["role"] == "system" for m in msgs)
    assert "BE HELPFUL" in msgs[0]["content"] and msgs[0]["content"].endswith("q1") and msgs[2]["content"] == "q2"


# ------------------------------------------------------------------ adaptation to provider quirks
def test_auto_falls_back_to_fold_when_system_role_rejected_and_remembers():
    p = Provider([(400, "Developer instruction is not enabled for this model"), ok("fine")])
    llm = p.llm()
    assert llm.create(system="SYS", messages=MSGS, tools=[]).text == "fine"
    assert any(m["role"] == "system" for m in p.requests[0]["body"]["messages"])
    assert not any(m["role"] == "system" for m in p.requests[1]["body"]["messages"])
    llm.create(system="SYS", messages=MSGS, tools=[])  # remembered: goes straight to fold
    assert len(p.requests) == 3 and not any(m["role"] == "system" for m in p.requests[2]["body"]["messages"])


def test_explicit_system_mode_does_not_silently_fold():
    p = Provider([(400, "system role not supported")])
    with pytest.raises(LlmUnavailable, match="HTTP 400"):
        p.llm(system_mode="system").create(system="SYS", messages=MSGS, tools=[])


def test_drops_temperature_when_rejected():
    p = Provider([(400, "Unsupported parameter: 'temperature'"), ok("ok")])
    llm = p.llm()
    assert llm.create(system="s", messages=MSGS, tools=[]).text == "ok"
    assert "temperature" in p.requests[0]["body"] and "temperature" not in p.requests[1]["body"]


def test_drops_tool_choice_and_tools_when_none_is_unsupported():
    p = Provider([(400, "tool_choice is not supported"), ok("answer")])
    p.llm().create(system="s", messages=MSGS, tools=TOOLS, force_no_tools=True)
    assert "tool_choice" in p.requests[0]["body"] and "tool_choice" not in p.requests[1]["body"] and "tools" not in p.requests[1]["body"]


def test_google_style_400_for_bad_key_is_reported_as_auth():
    body = '{"error": {"code": 400, "message": "Missing or invalid Authorization header.", "status": "INVALID_ARGUMENT"}}'
    with pytest.raises(LlmUnavailable, match="authentication failed"):
        Provider([(400, body)]).llm().create(system="s", messages=MSGS, tools=[])


@pytest.mark.parametrize("status,needle", [(401, "authentication"), (403, "authentication"), (404, "LLM_MODEL"), (400, "HTTP 400")])
def test_error_mapping(status, needle):
    with pytest.raises(LlmUnavailable, match=needle):
        Provider([(status, "nope")]).llm().create(system="s", messages=MSGS, tools=[])


def test_retries_rate_limits_then_succeeds():
    p = Provider([(429, "slow down"), (503, "busy"), ok("finally")])
    assert p.llm().create(system="s", messages=MSGS, tools=[]).text == "finally" and len(p.requests) == 3


def test_gives_up_after_repeated_server_errors():
    with pytest.raises(LlmUnavailable):
        Provider([(500, "boom")]).llm().create(system="s", messages=MSGS, tools=[])


def test_network_errors_become_unavailable():
    def boom(req):
        raise httpx.ConnectError("refused")

    with pytest.raises(LlmUnavailable, match="cannot reach"):
        OpenAICompatLlm(cfg(), httpx.Client(transport=httpx.MockTransport(boom))).create(system="s", messages=MSGS, tools=[])

    def slow(req):
        raise httpx.ReadTimeout("slow")

    with pytest.raises(LlmUnavailable, match="timed out"):
        OpenAICompatLlm(cfg(), httpx.Client(transport=httpx.MockTransport(slow))).create(system="s", messages=MSGS, tools=[])


# ------------------------------------------------------------------ response parsing
def test_parses_tool_calls_with_string_and_object_arguments_and_missing_ids():
    p = Provider([ok(None, [call("get_dates", "{}"), {"type": "function", "function": {"name": "geocode", "arguments": {"q": "33127"}}}])])
    t = p.llm().create(system="s", messages=MSGS, tools=TOOLS)
    assert [(c["name"], c["input"]) for c in t.tool_calls] == [("get_dates", {}), ("geocode", {"q": "33127"})]
    assert t.tool_calls[1]["id"] == "call_1" and t.finish_reason == "tool_calls"
    # the assistant message to echo back is normalized: ids filled in, arguments as JSON strings
    echoed = t.assistant_message["tool_calls"]
    assert echoed[1]["id"] == "call_1" and json.loads(echoed[1]["function"]["arguments"]) == {"q": "33127"}


def test_invalid_json_arguments_are_flagged_not_crashed():
    t = Provider([ok("", [call("get_dates", "{not json")])]).llm().create(system="s", messages=MSGS, tools=TOOLS)
    assert t.tool_calls[0]["invalid"] == "{not json" and t.tool_calls[0]["input"] == {}


def test_tool_calls_win_even_if_finish_reason_says_stop():
    t = Provider([ok("", [call("get_dates", {})], finish="stop")]).llm().create(system="s", messages=MSGS, tools=TOOLS)
    assert t.tool_calls and t.finish_reason == "tool_calls"


def test_length_finish_reason_is_kept():
    assert Provider([ok("cut off", None, "length")]).llm().create(system="s", messages=MSGS, tools=[]).finish_reason == "length"


def test_strips_reasoning_blocks():
    assert strip_reasoning("<think>secret plan</think>The answer.") == "The answer."
    assert strip_reasoning("<thinking>x\ny</thinking>Done") == "Done"
    t = Provider([ok("<think>hmm</think>Hola")]).llm().create(system="s", messages=MSGS, tools=[])
    assert t.text == "Hola"


def test_garbage_response_is_unavailable_not_a_crash():
    with pytest.raises(LlmUnavailable, match="unexpected response"):
        Provider([(200, {"unexpected": True})]).llm().create(system="s", messages=MSGS, tools=[])


def test_tool_schema_conversion_is_lossless_and_does_not_mutate():
    before = json.dumps(TOOLS, sort_keys=True)
    out = to_openai_tools(TOOLS)
    assert json.dumps(TOOLS, sort_keys=True) == before
    s = next(t for t in out if t["function"]["name"] == "search_schools")["function"]["parameters"]
    assert s["properties"]["ages"]["items"] == {"type": "integer"} and "q" in s["properties"]


# ------------------------------------------------------------------ the whole agent over a mocked provider
def test_full_agent_run_over_the_wire(bare_nav):
    lat, lon = WYNWOOD
    seen_tool_msgs = []

    def provider(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        msgs = body["messages"]
        tool_msgs = [m for m in msgs if m["role"] == "tool"]
        if not tool_msgs:
            return httpx.Response(*[200], json=ok("", [call("search_schools", {"ages": [3, 7], "limit": 2})])[1])
        seen_tool_msgs.append(tool_msgs[-1])
        cite = json.loads(tool_msgs[-1]["content"])["schools"][0]["grades"]["cite"]
        return httpx.Response(200, json=ok(f"Your zoned school is listed [{cite}].")[1])

    llm = OpenAICompatLlm(cfg(), httpx.Client(transport=httpx.MockTransport(provider)), sleep=lambda s: None)
    r = agent.run_chat(bare_nav, ChatRequest(messages=[ChatMessage(role="user", content="schools for my kids")],
                                             profile=ChatProfile(lat=lat, lon=lon, children=[Child(age=3), Child(age=7)])), llm)
    assert not r.degraded and r.results and r.citations and r.citations[0].source and "[1]" in r.answer
    assert seen_tool_msgs[0]["tool_call_id"] == "c1"  # tool results are linked back by id, in the OpenAI format
    assert r.filters_applied["stages"] == ["pre_k", "elementary"]


def test_dotenv_loader_handles_comments_quotes_and_does_not_override(tmp_path, monkeypatch):
    from app.config import load_env_file

    monkeypatch.delenv("NAVIGATOR_SKIP_DOTENV", raising=False)
    for k in ("T_PLAIN", "T_COMMENT", "T_QUOTED", "T_EMPTY", "T_EXISTING"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("T_EXISTING", "from-shell")
    f = tmp_path / ".env"
    f.write_text("# header\nT_PLAIN=abc\nT_COMMENT=0.1      # low temperature\nT_QUOTED=\"has # hash\"\nT_EMPTY=\nT_EXISTING=from-file\n# T_OFF=1\n")
    import os

    assert sorted(load_env_file(f)) == ["T_COMMENT", "T_PLAIN", "T_QUOTED"]
    assert (os.environ["T_PLAIN"], os.environ["T_COMMENT"], os.environ["T_QUOTED"], os.environ["T_EXISTING"]) == ("abc", "0.1", "has # hash", "from-shell")
    assert "T_EMPTY" not in os.environ
    for k in ("T_PLAIN", "T_COMMENT", "T_QUOTED"):
        monkeypatch.delenv(k, raising=False)


def test_rate_limit_waits_for_the_providers_retry_delay():
    sleeps = []
    body = '{"error": {"code": 429, "details": [{"retryDelay": "7s"}]}}'
    p = Provider([(429, body), ok("after the wait")])
    llm = OpenAICompatLlm(cfg(), httpx.Client(transport=httpx.MockTransport(p)), sleep=sleeps.append)
    assert llm.create(system="s", messages=MSGS, tools=[]).text == "after the wait"
    assert sleeps == [8.0]  # 7s hint + 1s margin


def test_retry_delay_is_capped_and_message_text_is_understood():
    sleeps = []
    p = Provider([(429, "Quota exceeded. Please retry in 120.5s."), ok("ok")])
    OpenAICompatLlm(cfg(), httpx.Client(transport=httpx.MockTransport(p)), sleep=sleeps.append).create(system="s", messages=MSGS, tools=[])
    assert sleeps == [30.0]


def test_persistent_429_becomes_a_clear_quota_error():
    with pytest.raises(LlmUnavailable, match="rate limit or quota"):
        Provider([(429, "slow")]).llm().create(system="s", messages=MSGS, tools=[])


def test_token_per_minute_cap_waits_for_the_window_to_clear():
    now = [1000.0]
    sleeps = []

    def sleep(s):
        sleeps.append(round(s, 1))
        now[0] += s

    usage = {"usage": {"prompt_tokens": 600, "completion_tokens": 100}}
    reply = (200, {"choices": [{"message": {"role": "assistant", "content": "ok"}, "finish_reason": "stop"}], **usage})
    p = Provider([reply])
    llm = OpenAICompatLlm(cfg(tpm=720), httpx.Client(transport=httpx.MockTransport(p)), sleep=sleep)
    llm._clock = lambda: now[0]
    llm.create(system="s", messages=MSGS, tools=[])  # records 700 real tokens
    llm.create(system="s", messages=MSGS, tools=[])  # 700 real + the next request's estimate > 720 -> must wait for the first to age out of the 60s window
    assert sleeps and sleeps[0] >= 59 and len(p.requests) == 2
    llm.create(system="s", messages=MSGS, tools=[])  # window cleared again by then
    assert len(p.requests) == 3


def test_no_token_cap_means_no_waiting():
    p = Provider([ok()])
    llm = OpenAICompatLlm(cfg(), httpx.Client(transport=httpx.MockTransport(p)), sleep=lambda s: (_ for _ in ()).throw(AssertionError("slept")))
    llm.create(system="s", messages=MSGS, tools=[])
    llm.create(system="s", messages=MSGS, tools=[])


# ---------------------------------------------------------------- fallback model
def models(p):
    return [r["body"]["model"] for r in p.requests]


def test_fallback_model_takes_over_when_the_main_model_keeps_failing():
    p = Provider([(500, "boom"), (500, "boom"), (500, "boom"), ok("from the backup")])
    out = p.llm(fallback_model="backup").create(system="s", messages=MSGS, tools=[])
    assert out.text == "from the backup" and models(p) == ["m", "m", "m", "backup"]


def test_main_model_is_skipped_while_it_is_known_to_be_down():
    p = Provider([(500, "boom"), (500, "boom"), (500, "boom"), ok("one"), ok("two")])
    llm = p.llm(fallback_model="backup")
    llm.create(system="s", messages=MSGS, tools=[])
    llm.create(system="s", messages=MSGS, tools=[])
    assert models(p) == ["m", "m", "m", "backup", "backup"]


def test_main_model_is_tried_again_after_the_cooldown():
    p = Provider([(500, "boom"), (500, "boom"), (500, "boom"), ok("backup"), ok("main again")])
    llm = p.llm(fallback_model="backup")
    llm.create(system="s", messages=MSGS, tools=[])
    llm._primary_down_until = 0
    assert llm.create(system="s", messages=MSGS, tools=[]).text == "main again" and models(p)[-1] == "m"


@pytest.mark.parametrize("status", [401, 404, 400])
def test_fallback_is_not_used_for_key_or_request_problems(status):
    p = Provider([(status, "nope")])
    with pytest.raises(LlmUnavailable):
        p.llm(fallback_model="backup").create(system="s", messages=MSGS, tools=[])
    assert set(models(p)) == {"m"}


def test_fallback_model_comes_from_the_environment_and_is_not_a_secret():
    c = LlmConfig.from_env({"LLM_PROVIDER": "gemini", "GEMINI_API_KEY": "k", "LLM_FALLBACK_MODEL": " gemini-3.5-flash-lite "})
    assert c.fallback_model == "gemini-3.5-flash-lite" and c.describe()["fallback_model"] == "gemini-3.5-flash-lite"
    assert LlmConfig.from_env({"LLM_PROVIDER": "gemini", "GEMINI_API_KEY": "k"}).fallback_model is None


def test_both_models_down_still_ends_in_unavailable():
    with pytest.raises(LlmUnavailable):
        Provider([(500, "boom")]).llm(fallback_model="backup").create(system="s", messages=MSGS, tools=[])


# ---------------------------------------------------------------- backup chain across providers
from app.chat.llm import ChainLlm, default_llm, describe_chain, parse_backups  # noqa: E402

MAIN = cfg(provider="gemini", model="main-model")


def chain(main_replies, backup_replies, *, cap=0, clock=None, today=None):
    pm, pb = Provider(main_replies), Provider(backup_replies)
    routes = [("gemini:main-model", pm.llm(), 0), ("nvidia:backup-model", pb.llm(cfg(provider="nvidia", model="backup-model")), cap)]
    kw = {k: v for k, v in (("clock", clock), ("today", today)) if v}
    return ChainLlm(routes, **kw), pm, pb


def test_parse_backups_reads_provider_model_and_cap_and_uses_each_providers_own_key():
    env = {"NVIDIA_API_KEY": "nv-key", "CEREBRAS_API_KEY": "cb-key", "GEMINI_API_KEY": "main-key"}
    routes, problems = parse_backups("nvidia:google/gemma-4-31b-it, cerebras:qwen-3.8-27b@250", MAIN, env)
    assert problems == []
    (nv, nv_cap), (cb, cb_cap) = routes
    assert (nv.provider, nv.model, nv.api_key, nv_cap) == ("nvidia", "google/gemma-4-31b-it", "nv-key", 0)  # free tier: no default cap
    assert (cb.provider, cb.model, cb.api_key, cb_cap) == ("cerebras", "qwen-3.8-27b", "cb-key", 250)
    assert cb.base_url == "https://api.cerebras.ai/v1" and "main-key" not in (nv.api_key, cb.api_key)


def test_paid_providers_get_a_default_daily_cap_and_zero_means_unlimited():
    env = {"CEREBRAS_API_KEY": "k"}
    assert parse_backups("cerebras:m", MAIN, env)[0][0][1] == 600
    assert parse_backups("cerebras:m@0", MAIN, env)[0][0][1] == 0


def test_bad_backup_entries_are_skipped_with_a_reason_never_a_crash():
    routes, problems = parse_backups("nvidia:m,nokey:thing,cerebras:m,justtext,custom:x", MAIN, {})
    assert routes == [] and len(problems) == 5
    assert any("NVIDIA_API_KEY" in p for p in problems) and any("provider:model" in p for p in problems)


def test_chain_uses_the_main_route_when_it_works():
    c, pm, pb = chain([ok("main")], [ok("backup")])
    assert c.create(system="s", messages=MSGS, tools=[]).text == "main" and c.last_route == "gemini:main-model" and pb.requests == []


def test_chain_moves_to_the_backup_provider_and_skips_a_failing_main_for_a_while():
    clock = [1000.0]
    c, pm, pb = chain([(500, "boom")], [ok("one"), ok("two")], clock=lambda: clock[0])
    assert c.create(system="s", messages=MSGS, tools=[]).text == "one" and c.last_route == "nvidia:backup-model"
    n = len(pm.requests)
    assert c.create(system="s", messages=MSGS, tools=[]).text == "two" and len(pm.requests) == n  # main not asked again during the cooldown
    clock[0] += 61
    c.create(system="s", messages=MSGS, tools=[])
    assert len(pm.requests) > n  # main is tried again after 60 s


def test_a_bad_key_on_the_main_route_still_reaches_the_backup():
    c, pm, pb = chain([(401, "bad key")], [ok("backup")])
    assert c.create(system="s", messages=MSGS, tools=[]).text == "backup"


def test_daily_cap_stops_a_route_until_the_next_day():
    day = ["2026-10-17"]
    c, pm, pb = chain([(500, "boom")], [ok("x")], cap=2, today=lambda: day[0])
    c.create(system="s", messages=MSGS, tools=[])
    c.create(system="s", messages=MSGS, tools=[])
    with pytest.raises(LlmUnavailable):  # main is down, backup is at its cap
        c.create(system="s", messages=MSGS, tools=[])
    assert len(pb.requests) == 2  # the third call never reached the paid backup
    day[0] = "2026-10-18"
    assert c.create(system="s", messages=MSGS, tools=[]).text == "x"


def test_all_routes_failing_raises_one_unavailable_naming_each_route():
    c, _, _ = chain([(500, "boom")], [(503, "busy")])
    with pytest.raises(LlmUnavailable) as e:
        c.create(system="s", messages=MSGS, tools=[])
    assert "gemini:main-model" in str(e.value) and "nvidia:backup-model" in str(e.value)


def test_the_conversation_is_passed_unchanged_to_the_backup():
    msgs = [{"role": "user", "content": "q"}, {"role": "assistant", "content": None, "tool_calls": [call("get_dates", {})]},
            {"role": "tool", "tool_call_id": "c1", "content": "{}"}]
    c, _, pb = chain([(500, "boom")], [ok("answer")])
    c.create(system="sys", messages=msgs, tools=[])
    sent = pb.requests[0]["body"]["messages"]
    assert sent[0] == {"role": "system", "content": "sys"} and sent[1:] == msgs and pb.requests[0]["body"]["model"] == "backup-model"


def _env(monkeypatch, **kv):
    for k in ("LLM_PROVIDER", "LLM_MODEL", "LLM_API_KEY", "LLM_BACKUPS", "LLM_FALLBACK_MODEL", "GEMINI_API_KEY", "NVIDIA_API_KEY",
              "CEREBRAS_API_KEY", "LLM_RPM", "LLM_TPM"):
        monkeypatch.delenv(k, raising=False)
    for k, v in kv.items():
        monkeypatch.setenv(k, v)


def test_default_llm_is_shared_between_requests_and_rebuilt_when_the_settings_change(monkeypatch):
    _env(monkeypatch, GEMINI_API_KEY="k", NVIDIA_API_KEY="n", LLM_BACKUPS="nvidia:google/gemma-4-31b-it")
    a, b = default_llm(), default_llm()
    assert a is b and isinstance(a, ChainLlm)  # one object: cooldowns and caps survive from one request to the next
    monkeypatch.setenv("LLM_BACKUPS", "")
    c = default_llm()
    assert c is not a and isinstance(c, OpenAICompatLlm)


def test_describe_chain_lists_backups_but_never_a_key(monkeypatch):
    _env(monkeypatch, GEMINI_API_KEY="secret-main", NVIDIA_API_KEY="secret-nv", LLM_BACKUPS="nvidia:google/gemma-4-31b-it,cerebras:qwen-3.8-27b")
    d = describe_chain()
    assert [b["provider"] for b in d["backups"]] == ["nvidia"] and any("CEREBRAS_API_KEY" in p for p in d["backup_problems"])
    assert "secret" not in json.dumps(d)
