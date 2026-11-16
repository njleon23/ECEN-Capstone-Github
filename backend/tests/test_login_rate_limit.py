from app.login_rate_limit import LoginRateLimiter


def test_limit_expires_without_sleeping():
    current_time = [0.0]

    limiter = LoginRateLimiter(
        limit=2,
        window_seconds=60,
        clock=lambda: current_time[0],
    )

    assert limiter.check("client-a") is None
    assert limiter.check("client-a") is None
    assert limiter.check("client-a") == 60

    current_time[0] = 61.0

    assert limiter.check("client-a") is None


def test_different_keys_have_separate_limits():
    limiter = LoginRateLimiter(limit=1)

    assert limiter.check("client-a") is None
    assert limiter.check("client-a") is not None
    assert limiter.check("client-b") is None


def test_key_storage_is_bounded():
    limiter = LoginRateLimiter(
        limit=2,
        max_keys=1,
    )

    assert limiter.check("client-a") is None
    assert limiter.check("client-b") is not None

    # The existing key keeps its own counter.
    assert limiter.check("client-a") is None
    assert limiter.check("client-a") is not None