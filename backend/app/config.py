"""Runtime settings, read once from environment variables (see .env.example). Secrets never live in the repo."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_env_file(path: Path | None = None) -> list[str]:
    """Load KEY=value lines from backend/.env into os.environ without overriding variables that are already set.

    Understands `# comments` (whole-line and after whitespace) and quoted values. Returns the names it set. Set
    NAVIGATOR_SKIP_DOTENV=1 to disable (the tests do, so they can never use a real key).
    """
    if os.getenv("NAVIGATOR_SKIP_DOTENV"):
        return []
    path = path or ROOT / ".env"
    if not path.exists():
        return []
    loaded = []
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if value and value[0] in "\"'" and value.count(value[0]) >= 2:
            value = value[1:value.index(value[0], 1)]
        else:
            value = value.split(" #", 1)[0].split("\t#", 1)[0].strip()
        key = key.strip()
        if key and value and key not in os.environ:
            os.environ[key] = value
            loaded.append(key)
    return loaded


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("DATA_DIR", ROOT / "data")))
    db_path: Path = field(default_factory=lambda: Path(os.getenv("DB_PATH", ROOT / "data" / "navigator.db")))
    users_db_path: Path = field(default_factory=lambda: Path(os.getenv("USERS_DB_PATH", ROOT / "data" / "users.db")))
    cookie_secure: bool = field(default_factory=lambda: _bool("COOKIE_SECURE", False))  # true on https deployments
    cookie_samesite: str = field(default_factory=lambda: os.getenv("COOKIE_SAMESITE", "lax").strip().lower())  # "none" for a cross-site frontend (needs secure)
    auto_ingest: bool = field(default_factory=lambda: _bool("AUTO_INGEST", True))
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:4173").split(",") if o.strip()
        )
    )
    llm_max_tool_calls: int = 4  # spec: max 4 tool calls per chat turn
    http_timeout: float = 60.0

    @property
    def snapshot_dir(self) -> Path:
        return self.data_dir / "snapshots"

    @property
    def curated_dir(self) -> Path:
        return self.data_dir / "curated"

    @property
    def fldoe_dir(self) -> Path:
        return self.data_dir / "raw" / "fldoe"


def get_settings() -> Settings:
    load_env_file()
    return Settings()
