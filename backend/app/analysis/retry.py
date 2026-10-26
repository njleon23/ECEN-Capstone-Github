"""Shared call-validate-retry loop for provider requests (ICD 6.4.5 'Retry').

At most ``max_retries`` automatic retries are made (default one). A schema or
citation failure is retried once with the validation error added to the request;
a rate limit or outage is retried once after a short wait. Anything else, such as
rejected credentials, fails immediately. After the last attempt the final error is
raised so the caller can mark the job degraded or failed.
"""

from __future__ import annotations

import time
from typing import Callable, Optional, Tuple, TypeVar

from .errors import DependencyUnavailable, RateLimited, SchemaValidationError
from .llm_client import LLMProvider, ProviderResponse

T = TypeVar("T")


def call_with_retries(provider: LLMProvider, *, system: str,
                      build_user: Callable[[Optional[str]], str],
                      validate: Callable[[ProviderResponse], T],
                      temperature: float, max_retries: int,
                      sleep: Callable[[float], None] = time.sleep,
                      on_response: Optional[Callable[[ProviderResponse], None]] = None,
                      ) -> Tuple[ProviderResponse, T]:
    previous_error: Optional[str] = None
    last: Optional[Exception] = None
    for attempt in range(max_retries + 1):
        try:
            response = provider.complete_json(
                system=system, user=build_user(previous_error), temperature=temperature)
            if on_response:
                on_response(response)
            return response, validate(response)
        except SchemaValidationError as e:
            last, previous_error = e, e.message
        except RateLimited as e:
            last = e
            if attempt < max_retries:
                sleep(e.retry_after if e.retry_after is not None else 2.0)
        except DependencyUnavailable as e:
            last = e
            if attempt < max_retries:
                sleep(2.0)
    assert last is not None
    raise last
