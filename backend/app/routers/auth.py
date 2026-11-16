from fastapi import APIRouter, Depends, Response, status

from app.auth_dependencies import (
    authentication_error,
    authentication_storage_error,
    get_bearer_token,
    get_current_user,
)
from app.auth_models import (
    AuthUserResponse,
    LoginRequest,
    LoginResponse,
)
from app.services.authentication_service import (
    AuthenticationError,
    AuthenticationStorageError,
    login,
    logout,
)
from app.services.user_repository import UserSummary
from fastapi import APIRouter, Depends, Request, Response, status
from app.login_rate_limit import enforce_login_limits

router = APIRouter(
    prefix="/api/v1/auth",
    tags=["authentication"],
)


@router.post("/login", response_model=LoginResponse)
def login_user(
    body: LoginRequest,
    response: Response,
    request: Request,
):
    client_address = (
        request.client.host
        if request.client is not None
        else "unknown"
    )

    enforce_login_limits(
        username=body.username,
        client_address=client_address,
    )

    try:
        session = login(
            username=body.username,
            password=body.password.get_secret_value(),
        )
    except AuthenticationError:
        raise authentication_error(
            "Invalid username or password."
        ) from None
    except AuthenticationStorageError:
        raise authentication_storage_error() from None

    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"

    return LoginResponse(
        access_token=session.token,
        expires_at=session.expires_at,
        user=AuthUserResponse.model_validate(session.user),
    )


@router.get("/me", response_model=AuthUserResponse)
def read_current_user(
    response: Response,
    user: UserSummary = Depends(get_current_user),
):
    response.headers["Cache-Control"] = "no-store"
    return AuthUserResponse.model_validate(user)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def logout_user(
    token: str = Depends(get_bearer_token),
):
    try:
        logout(token)
    except AuthenticationStorageError:
        raise authentication_storage_error() from None

    return Response(
        status_code=status.HTTP_204_NO_CONTENT,
        headers={"Cache-Control": "no-store"},
    )