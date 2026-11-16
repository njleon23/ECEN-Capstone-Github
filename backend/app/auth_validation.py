"""Do not echo login credentials in validation error responses."""

from fastapi import Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


async def handle_request_validation(
    request: Request,
    error: RequestValidationError,
):
    if request.url.path.rstrip("/") != "/api/v1/auth/login":
        return await request_validation_exception_handler(request, error)

    return JSONResponse(
        status_code=422,
        content={
            "detail": [
                {
                    "loc": list(item["loc"]),
                    "msg": item["msg"],
                    "type": item["type"],
                }
                for item in error.errors()
            ]
        },
        headers={"Cache-Control": "no-store"},
    )
