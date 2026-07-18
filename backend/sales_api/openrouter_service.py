"""
OpenRouter free-model registry + chat config helpers.

- Fetches free models from OpenRouter
- Persists registry + selected model to data/openrouter_free_models.json
- Auto-refreshes when cache is stale (default 24h)
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger("sales_api.openrouter")

# 정책: 유료 금지 + 빠른 답변 우선 (정확도보다 속도)
# 소형/경량 free 모델만 기본·재시도에 사용. 70B·405B·ultra 급은 후보에서 제외.
DEFAULT_FREE_MODEL = "meta-llama/llama-3.2-3b-instruct:free"
FALLBACK_FREE_MODELS = [
    {"id": "meta-llama/llama-3.2-3b-instruct:free", "name": "Llama 3.2 3B (free, fast)", "context_length": 131072},
    {"id": "google/gemma-4-26b-a4b-it:free", "name": "Gemma 4 26B A4B (free, MoE fast)", "context_length": 262144},
    {"id": "nvidia/nemotron-3-nano-30b-a3b:free", "name": "Nemotron 3 Nano 30B A3B (free)", "context_length": 256000},
    {"id": "openai/gpt-oss-20b:free", "name": "GPT-OSS 20B (free)", "context_length": 131072},
    {"id": "google/gemma-4-31b-it:free", "name": "Gemma 4 31B IT (free)", "context_length": 262144},
    {"id": "openrouter/free", "name": "OpenRouter Free (auto)", "context_length": 200000},
]

# 정책: 유료 모델 절대 사용 금지. 허용 ID = openrouter/free 또는 *:free 만.
# 느린 초대형 free 모델은 자동 재시도 후보에서 제외 (사용자 요청: 빠른 답변 위주)
_SLOW_FREE_ID_SUBSTR = (
    "405b",
    "550b",
    "70b",
    "72b",
    "80b",
    "ultra",
    "hermes-3-llama-3.1-405b",
    "qwen3-next-80b",
    "llama-3.3-70b",
)

# Skip non-chat / niche free models from the selector
_EXCLUDE_ID_SUBSTR = (
    "lyria",
    "content-safety",
    "embed",
    "whisper",
    "tts",
    "image",
    "vision-only",
)

CACHE_MAX_AGE_SEC = 24 * 60 * 60  # 24h


def _data_path() -> Path:
    base = Path(__file__).resolve().parent.parent / "data"
    base.mkdir(parents=True, exist_ok=True)
    return base / "openrouter_free_models.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty_store() -> dict:
    raw_selected = (
        os.getenv("OPENROUTER_DEFAULT_MODEL")
        or os.getenv("ANTHROPIC_DEFAULT_SONNET_MODEL")
        or DEFAULT_FREE_MODEL
    )
    return {
        "updated_at": None,
        "selected_model": enforce_free_model_id(raw_selected),
        "models": list(FALLBACK_FREE_MODELS),
        "source": "fallback",
    }


def load_store() -> dict:
    path = _data_path()
    if not path.exists():
        store = _empty_store()
        save_store(store)
        return store
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return _empty_store()
        if not isinstance(raw.get("models"), list) or not raw["models"]:
            raw["models"] = list(FALLBACK_FREE_MODELS)
        if not raw.get("selected_model"):
            raw["selected_model"] = DEFAULT_FREE_MODEL
        return raw
    except Exception as e:
        logger.warning("Failed to load openrouter store: %s", e)
        return _empty_store()


def save_store(store: dict) -> None:
    path = _data_path()
    try:
        path.write_text(
            json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except Exception as e:
        logger.error("Failed to save openrouter store: %s", e)


def get_api_key() -> str:
    return (
        (os.getenv("OPENROUTER_API_KEY") or "").strip()
        or (os.getenv("ANTHROPIC_AUTH_TOKEN") or "").strip()
    )


def get_base_url() -> str:
    """
    Normalize to host root, e.g. https://openrouter.ai
    (chat path is always /api/v1/chat/completions)
    """
    raw = (
        (os.getenv("OPENROUTER_BASE_URL") or "").strip()
        or (os.getenv("ANTHROPIC_BASE_URL") or "").strip()
        or "https://openrouter.ai"
    )
    base = raw.rstrip("/")
    # strip common suffixes so callers can append /api/v1/...
    for suffix in ("/api/v1", "/api", "/anthropic"):
        if base.endswith(suffix):
            base = base[: -len(suffix)].rstrip("/")
    # force openrouter if key looks like openrouter key and url is z.ai/deepseek
    key = get_api_key()
    if key.startswith("sk-or-") and "openrouter.ai" not in base:
        base = "https://openrouter.ai"
    if not base:
        base = "https://openrouter.ai"
    return base


def is_allowed_free_model_id(model_id: str) -> bool:
    """
    유료 모델 차단 규칙 (엄격).
    - openrouter/free (무료 라우터)
    - id 가 ':free' 로 끝나는 모델만 허용
    pricing=0 이어도 :free 접미사가 없으면 거부 (유료 슬립스트림 방지)
    """
    mid = (model_id or "").strip()
    if not mid:
        return False
    if mid == "openrouter/free":
        return True
    return mid.endswith(":free")


def is_fast_free_model_id(model_id: str) -> bool:
    """무료이면서 자동 선택/재시도에 쓸 정도로 빠른 모델인지."""
    mid = (model_id or "").strip().lower()
    if not is_allowed_free_model_id(mid):
        return False
    if mid == "openrouter/free":
        return True  # 라우터 — 후순위 폴백용
    return not any(s in mid for s in _SLOW_FREE_ID_SUBSTR)


def enforce_free_model_id(model_id: Optional[str], *, fallback: str = DEFAULT_FREE_MODEL) -> str:
    """유료/미허용 모델이면 기본 무료 모델로 치환."""
    mid = (model_id or "").strip()
    if is_allowed_free_model_id(mid):
        return mid
    if mid:
        logger.warning("Blocked non-free OpenRouter model %r → %s", mid, fallback)
    return fallback if is_allowed_free_model_id(fallback) else DEFAULT_FREE_MODEL


def _is_free_model(item: dict) -> bool:
    mid = str(item.get("id") or "")
    # ID 규칙 우선 (유료 차단)
    if is_allowed_free_model_id(mid):
        return True
    # openrouter/free 외, pricing 0 이어도 :free 없으면 제외
    return False


def _should_exclude(mid: str, name: str = "") -> bool:
    blob = f"{mid} {name}".lower()
    return any(x in blob for x in _EXCLUDE_ID_SUBSTR)


def _normalize_model(item: dict) -> Optional[dict]:
    mid = str(item.get("id") or "").strip()
    if not mid:
        return None
    name = str(item.get("name") or mid).strip()
    if _should_exclude(mid, name):
        return None
    # Prefer text chat models; skip pure audio/image if architecture says so
    arch = item.get("architecture") if isinstance(item.get("architecture"), dict) else {}
    modality = str(arch.get("modality") or arch.get("input_modalities") or "text")
    if isinstance(modality, list):
        modality = ",".join(str(x) for x in modality)
    modality_l = modality.lower()
    if modality_l and "text" not in modality_l and "any" not in modality_l:
        # still allow if id ends with :free and looks like instruct
        if not any(k in mid.lower() for k in ("instruct", "chat", "it", "coder", "oss", "free")):
            return None

    ctx = item.get("context_length") or item.get("top_provider", {}).get("context_length")
    try:
        ctx_i = int(ctx) if ctx is not None else None
    except Exception:
        ctx_i = None

    return {
        "id": mid,
        "name": name,
        "context_length": ctx_i,
        "pricing": item.get("pricing") or {"prompt": "0", "completion": "0"},
        "description": (item.get("description") or "")[:240],
    }


def fetch_free_models_from_openrouter(timeout_s: int = 25) -> list[dict]:
    key = get_api_key()
    base = get_base_url()
    url = f"{base}/api/v1/models"
    headers = {
        "Accept": "application/json",
        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL") or "http://localhost:5174",
        "X-Title": os.getenv("OPENROUTER_APP_NAME") or "VF Delivery AI",
    }
    if key:
        headers["Authorization"] = f"Bearer {key}"

    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        raw = resp.read().decode("utf-8")
    data = json.loads(raw) if raw else {}
    items = data.get("data") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return list(FALLBACK_FREE_MODELS)

    free: list[dict] = []
    seen = set()
    for item in items:
        if not isinstance(item, dict) or not _is_free_model(item):
            continue
        norm = _normalize_model(item)
        if not norm or norm["id"] in seen:
            continue
        seen.add(norm["id"])
        free.append(norm)

    # always include openrouter/free if missing
    if "openrouter/free" not in seen:
        free.insert(0, FALLBACK_FREE_MODELS[0])

    free.sort(key=lambda m: (m.get("name") or m["id"]).lower())
    return free if free else list(FALLBACK_FREE_MODELS)


def _store_age_sec(store: dict) -> Optional[float]:
    ts = store.get("updated_at")
    if not ts:
        return None
    try:
        # support Z suffix
        s = str(ts).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return max(0.0, time.time() - dt.timestamp())
    except Exception:
        return None


def refresh_free_models(force: bool = False) -> dict:
    store = load_store()
    age = _store_age_sec(store)
    if (
        not force
        and age is not None
        and age < CACHE_MAX_AGE_SEC
        and store.get("source") == "openrouter"
        and store.get("models")
    ):
        store["cache_hit"] = True
        store["cache_age_sec"] = int(age)
        return store

    try:
        models = fetch_free_models_from_openrouter()
        selected = enforce_free_model_id(store.get("selected_model") or DEFAULT_FREE_MODEL)
        ids = {m["id"] for m in models if isinstance(m, dict) and is_allowed_free_model_id(m["id"])}
        if selected not in ids:
            selected = DEFAULT_FREE_MODEL if DEFAULT_FREE_MODEL in ids else (
                models[0]["id"] if models else DEFAULT_FREE_MODEL
            )
            selected = enforce_free_model_id(selected)

        store = {
            "updated_at": _now_iso(),
            "selected_model": selected,
            "models": models,
            "source": "openrouter",
            "cache_hit": False,
            "count": len(models),
        }
        save_store(store)
        return store
    except Exception as e:
        logger.warning("OpenRouter free model refresh failed: %s", e)
        store = load_store()
        store["error"] = str(e)
        store["cache_hit"] = True
        store["source"] = store.get("source") or "fallback"
        if not store.get("models"):
            store["models"] = list(FALLBACK_FREE_MODELS)
        return store


def list_free_models(auto_refresh: bool = True) -> dict:
    if auto_refresh:
        return refresh_free_models(force=False)
    return load_store()


def get_selected_model() -> str:
    store = load_store()
    env_model = (
        (os.getenv("OPENROUTER_DEFAULT_MODEL") or "").strip()
        or (os.getenv("ANTHROPIC_DEFAULT_SONNET_MODEL") or "").strip()
    )
    # env 우선 (빠른 모델 정책 강제), 그다음 store
    selected = (env_model or store.get("selected_model") or DEFAULT_FREE_MODEL).strip()
    selected = enforce_free_model_id(selected)
    # 저장값이 초대형 free 면 소형 기본으로 교체
    if not is_fast_free_model_id(selected):
        logger.warning("Slow free model %r demoted to %s", selected, DEFAULT_FREE_MODEL)
        selected = DEFAULT_FREE_MODEL
    return selected


def set_selected_model(model_id: str) -> dict:
    mid = (model_id or "").strip()
    if not mid:
        raise ValueError("model id required")
    if not is_allowed_free_model_id(mid):
        raise ValueError(
            f"유료/미허용 모델입니다: {mid}. "
            "OpenRouter 무료 모델만 사용 가능합니다 (openrouter/free 또는 id 끝 :free)."
        )
    store = load_store()
    # auto-register unknown free-looking ids so user can pick newly discovered ones
    models = store.get("models") if isinstance(store.get("models"), list) else []
    ids = {m.get("id") for m in models if isinstance(m, dict)}
    if mid not in ids:
        models.append(
            {
                "id": mid,
                "name": mid,
                "context_length": None,
                "pricing": {"prompt": "0", "completion": "0"},
            }
        )
        store["models"] = models
    store["selected_model"] = mid
    store["selected_at"] = _now_iso()
    save_store(store)
    return store


def get_chat_config(model_override: Optional[str] = None) -> Optional[dict]:
    api_key = get_api_key()
    if not api_key:
        return None

    base_url = get_base_url()
    model = enforce_free_model_id(
        (model_override or "").strip() or get_selected_model()
    )

    timeout_ms_raw = (os.getenv("API_TIMEOUT_MS") or "").strip()
    # 빠른 답변 위주: 기본 20s, 최대 30s (느린 대기 방지)
    timeout_s = 20
    if timeout_ms_raw:
        try:
            timeout_s = max(8, min(30, int(int(timeout_ms_raw) / 1000)))
        except ValueError:
            timeout_s = 20

    return {
        "base_url": base_url,
        "api_key": api_key,
        "model": model,
        "timeout_s": timeout_s,
        "provider": "openrouter" if "openrouter.ai" in base_url else "custom",
    }


def _preferred_retry_models(primary: str) -> list[str]:
    """
    실패 시 재시도 후보 — 빠른 무료 모델만 (70B/405B/ultra 제외).
    primary 가 느린 free 모델이면 소형 기본 모델로 치환.
    """
    store = load_store()
    catalog = []
    for m in store.get("models") or []:
        mid = m.get("id") if isinstance(m, dict) else None
        if mid and is_fast_free_model_id(mid):
            catalog.append(mid)

    primary_use = primary if is_fast_free_model_id(primary) else DEFAULT_FREE_MODEL
    preferred = [
        primary_use,
        DEFAULT_FREE_MODEL,
        "meta-llama/llama-3.2-3b-instruct:free",
        "google/gemma-4-26b-a4b-it:free",
        "nvidia/nemotron-3-nano-30b-a3b:free",
        "openai/gpt-oss-20b:free",
        "nvidia/nemotron-nano-9b-v2:free",
        "openrouter/free",  # 최후 라우터
    ]
    out: list[str] = []
    seen = set()
    for mid in preferred + catalog:
        mid = enforce_free_model_id(mid) if mid else ""
        if not mid or mid in seen or not is_fast_free_model_id(mid):
            continue
        seen.add(mid)
        out.append(mid)
    return out[:6]


def _chat_once(
    *,
    cfg: dict,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float,
) -> dict[str, Any]:
    url = f"{cfg['base_url']}/api/v1/chat/completions"
    payload = {
        "model": cfg["model"],
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    headers = {
        "Authorization": f"Bearer {cfg['api_key']}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL") or "http://localhost:5174",
        "X-Title": os.getenv("OPENROUTER_APP_NAME") or "VF Delivery AI",
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=cfg["timeout_s"]) as resp:
            raw = resp.read().decode("utf-8")
        data = json.loads(raw) if raw else {}
        content = ""
        choices = data.get("choices") if isinstance(data, dict) else None
        if isinstance(choices, list) and choices:
            message = choices[0].get("message") or {}
            content = message.get("content") or ""
            if not content:
                content = message.get("reasoning") or ""
        if not content and isinstance(data, dict):
            content = data.get("content") or ""
        content = (content or "").strip()
        if not content:
            err = None
            if isinstance(data, dict):
                err = data.get("error")
            return {
                "success": False,
                "content": None,
                "model": cfg["model"],
                "error": str(err) if err else "empty model response",
                "retryable": True,
            }
        return {
            "success": True,
            "content": content,
            "model": cfg["model"],
            "provider": cfg.get("provider"),
            "error": None,
        }
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            body = str(e)
        logger.error("OpenRouter HTTPError %s (%s): %s", e.code, cfg["model"], body[:500])
        retryable = e.code in (408, 429, 500, 502, 503, 504)
        return {
            "success": False,
            "content": None,
            "model": cfg["model"],
            "error": f"HTTP {e.code}: {body[:400]}",
            "retryable": retryable,
            "http_status": e.code,
        }
    except Exception as e:
        logger.error("OpenRouter call failed (%s): %s", cfg["model"], e)
        return {
            "success": False,
            "content": None,
            "model": cfg["model"],
            "error": str(e),
            "retryable": True,
        }


def chat_completions(
    *,
    system: str,
    user: str,
    max_tokens: int = 2048,
    temperature: float = 0.3,
    model: Optional[str] = None,
) -> dict[str, Any]:
    """
    Call OpenRouter (OpenAI-compatible) chat completions.
    On 429/5xx, retries other free models automatically.
    Returns { success, content, model, error? }
    """
    primary_cfg = get_chat_config(model_override=model)
    if not primary_cfg:
        return {"success": False, "content": None, "model": None, "error": "API key not configured"}

    candidates = _preferred_retry_models(primary_cfg["model"])
    errors: list[str] = []
    last: dict[str, Any] = {
        "success": False,
        "content": None,
        "model": primary_cfg["model"],
        "error": "no attempts",
    }

    for mid in candidates:
        cfg = dict(primary_cfg)
        cfg["model"] = mid
        result = _chat_once(
            cfg=cfg,
            system=system,
            user=user,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        last = result
        if result.get("success"):
            if mid != primary_cfg["model"]:
                result["fallback_from"] = primary_cfg["model"]
            return result
        err = result.get("error") or "unknown"
        errors.append(f"{mid}: {err[:120]}")
        if not result.get("retryable"):
            break

    last["error"] = " | ".join(errors)[:500]
    last["tried_models"] = candidates
    return last
