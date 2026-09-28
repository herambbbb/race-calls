"""A polite JSON file cache for API responses, under settings.data_dir (gitignored).

Callers decide what is safe to cache: never an empty table (the data may simply not be
published yet), and only with a max_age for anything that can still change, such as the
calendar.
"""

import hashlib
import json
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


def _now() -> datetime:
    return datetime.now(UTC)


class JsonCache:
    def __init__(self, root: Path, clock: Callable[[], datetime] = _now) -> None:
        self._root = root
        self._clock = clock

    def _path(self, namespace: str, key: str) -> Path:
        digest = hashlib.sha256(key.encode()).hexdigest()[:32]
        return self._root / namespace / f"{digest}.json"

    def get(self, namespace: str, key: str, max_age: timedelta | None = None) -> Any | None:
        path = self._path(namespace, key)
        try:
            entry = json.loads(path.read_text())
            fetched_at = datetime.fromisoformat(entry["fetched_at"])
        except (OSError, ValueError, KeyError, TypeError):
            return None
        if entry.get("key") != key:
            return None
        if max_age is not None and self._clock() - fetched_at > max_age:
            return None
        return entry.get("value")

    def put(self, namespace: str, key: str, value: Any) -> None:
        path = self._path(namespace, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        entry = {"key": key, "fetched_at": self._clock().isoformat(), "value": value}
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(entry, ensure_ascii=False))
        tmp.replace(path)
