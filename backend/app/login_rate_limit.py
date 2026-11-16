"""Bounded, thread-safe login limits for a single backend process."""

import hashlib
import math
import time
from collections.abc import Callable
from threading import Lock

from fastapi import HTTPException


class LoginRateLimiter:
    def __init__(
        self,
        *,
        limit: int,
        window_seconds: float = 60,
        max_keys: int = 10000,
        clock: Callable[[], float] = time.monotonic,
    ):
        if limit < 1 or window_seconds <= 0 or max_keys < 1:
            raise ValueError("Rate-limit settings must be positive.")

        self.limit = limit
        self.window_seconds = window_seconds
        self.max_keys = max_keys
        self._clock = clock
        self._buckets: dict[str, tuple[float, int]] = {}
        self._lock = Lock()

    def check(self, key: str) -> int | None:
        """Return None if allowed, or seconds to wait if blocked."""
        with self._lock:
            now = self._clock()

            expired_keys = [
                existing_key
                for existing_key, (started_at, _) in self._buckets.items()
                if now - started_at >= self.window_seconds
            ]

            for existing_key in expired_keys:
                del self._buckets[existing_key]

            bucket = self._buckets.get(key)

            if bucket is None:
                if len(self._buckets) >= self.max_keys:
                    # Refuse new keys rather than growing indefinitely
                    # or evicting limits that an attacker could bypass.
                    return max(1, math.ceil(self.window_seconds))

                self._buckets[key] = (now, 1)
                return None

            started_at, count = bucket

            if count >= self.limit:
                remaining = self.window_seconds - (now - started_at)
                return max(1, math.ceil(remaining))

            self._buckets[key] = (started_at, count + 1)
            return None

    def clear(self) -> None:
        """Reset state for isolated tests; not exposed through the API."""
        with self._lock:
            self._buckets.clear()


account_login_limiter = LoginRateLimiter(limit=5)
client_login_limiter = LoginRateLimiter(limit=20)


def enforce_login_limits(
    username: str,
    client_address: str,
) -> None:
    normalized_username = username.strip().lower()

    account_key = hashlib.sha256(
        normalized_username.encode("utf-8")
    ).hexdigest()

    retry_after = client_login_limiter.check(client_address)

    if retry_after is None:
        retry_after = account_login_limiter.check(account_key)

    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "RATE_LIMITED",
                "message": "Too many login attempts. Try again later.",
            },
            headers={
                "Retry-After": str(retry_after),
                "Cache-Control": "no-store",
            },
        )