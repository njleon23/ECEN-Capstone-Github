"""Error types that map onto the ICD error codes (section 6.4.8)."""

from __future__ import annotations


class AnalyticsError(Exception):
    """Base class. ``code`` and ``http_status`` follow the ICD error table."""

    code = "INTERNAL_ERROR"
    http_status = 500

    def __init__(self, message: str = "", *, retryable: bool = False):
        super().__init__(message or self.code)
        self.message = message or self.code
        self.retryable = retryable

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message,
                "http_status": self.http_status, "retryable": self.retryable}


class InvalidRequest(AnalyticsError):
    code, http_status = "INVALID_REQUEST", 400


class InsufficientEvidence(AnalyticsError):
    code, http_status = "INSUFFICIENT_EVIDENCE", 422


class RateLimited(AnalyticsError):
    code, http_status = "RATE_LIMITED", 429

    def __init__(self, message: str = "", *, retry_after: float | None = None):
        super().__init__(message, retryable=True)
        self.retry_after = retry_after


class ProviderError(AnalyticsError):
    """Provider returned an unusable response (bad JSON, schema failure)."""

    code, http_status = "PROVIDER_ERROR", 502


class DependencyUnavailable(AnalyticsError):
    """Provider or another dependency is down or timed out."""

    code, http_status = "DEPENDENCY_UNAVAILABLE", 503

    def __init__(self, message: str = ""):
        super().__init__(message, retryable=True)


class SchemaValidationError(ProviderError):
    """Model output parsed but did not meet the briefing schema or citation rules."""

    code = "PROVIDER_ERROR"
