"""Simple in-memory limits for repeated failed sign-ins.

Counts are kept per server process. That is enough to stop password
guessing on a single Render instance; move this to Redis or the database
if the API is ever run on several instances.
"""

from collections import deque
from threading import Lock
from time import monotonic


class FailedLoginLimiter:
    def __init__(self, max_failures: int = 5, window_seconds: int = 15 * 60) -> None:
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._failures: dict[str, deque[float]] = {}
        self._lock = Lock()

    def _recent(self, key: str, now: float) -> deque[float]:
        attempts = self._failures.setdefault(key, deque())
        while attempts and now - attempts[0] > self.window_seconds:
            attempts.popleft()
        return attempts

    def retry_after(self, key: str) -> int:
        """Seconds until this key may try again, or 0 if it is not blocked."""
        with self._lock:
            now = monotonic()
            attempts = self._recent(key, now)
            if len(attempts) < self.max_failures:
                return 0
            return max(1, int(self.window_seconds - (now - attempts[0])) + 1)

    def record_failure(self, key: str) -> None:
        with self._lock:
            now = monotonic()
            self._recent(key, now).append(now)

    def reset(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._failures.clear()
            else:
                self._failures.pop(key, None)


login_limiter = FailedLoginLimiter()

# Password-reset emails: at most 3 per email address every 15 minutes.
reset_limiter = FailedLoginLimiter(max_failures=3)
