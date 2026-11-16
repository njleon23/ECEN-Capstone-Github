from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.services.authentication_service import (
    AuthenticationError,
    AuthenticationStorageError,
    get_session_user,
)
from app.services.user_repository import UserSummary


bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="SessionToken",
    description="Paste the access_token returned by /api/v1/auth/login.",
)


def authentication_error(
    message: str = "A valid login session is required.",
) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={
            "code": "AUTHENTICATION_REQUIRED",
            "message": message,
        },
        headers={
            "WWW-Authenticate": "Bearer",
            "Cache-Control": "no-store",
        },
    )


def authentication_storage_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "code": "STORAGE_UNAVAILABLE",
            "message": "Authentication storage is unavailable.",
        },
        headers={"Cache-Control": "no-store"},
    )


def get_bearer_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
) -> str:
    if credentials is None:
        raise authentication_error()

    return credentials.credentials


def get_current_user(
    token: str = Depends(get_bearer_token),
) -> UserSummary:
    try:
        return get_session_user(token)
    except AuthenticationError:
        raise authentication_error() from None
    except AuthenticationStorageError:
        raise authentication_storage_error() from None


def require_reviewer(
    user: UserSummary = Depends(get_current_user),
) -> UserSummary:
    if user.role not in {"admin", "reviewer"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "PERMISSION_DENIED",
                "message": "A reviewer or administrator account is required.",
            },
        )

    return user


def require_admin(
    user: UserSummary = Depends(get_current_user),
) -> UserSummary:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "PERMISSION_DENIED",
                "message": "An administrator account is required.",
            },
        )

    return user