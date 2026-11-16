"""Prompt for demo credentials without putting passwords or tokens in files."""

from getpass import getpass
from urllib.parse import urlsplit

import httpx


def authenticate_demo_client(client: httpx.Client, username: str | None = None) -> None:
    target = urlsplit(str(client.base_url))
    local_hosts = {"localhost", "127.0.0.1", "::1"}
    if target.scheme != "https" and not (
        target.scheme == "http" and target.hostname in local_hosts
    ):
        raise SystemExit("Use HTTPS for remote logins; HTTP is allowed only on localhost.")

    username = username or input("Reviewer username: ").strip()
    password = getpass("Reviewer password: ")
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )
    if response.status_code != 200:
        raise SystemExit(
            f"Login failed (HTTP {response.status_code}). "
            "Check the account, backend availability, or login retry time."
        )

    client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
