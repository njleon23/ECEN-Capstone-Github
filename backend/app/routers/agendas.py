from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

from app.models import AgendaResponse
from app.services.agenda_parser import (
    AgendaParserError,
    OCRRequiredError,
    UnsupportedFileTypeError,
    extract_text,
    parse_agenda_items,
)


router = APIRouter(prefix="/api/v1", tags=["agendas"])

MAX_FILE_SIZE = 25 * 1024 * 1024
SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md"}

# Temporary storage until SQLite persistence is implemented.
agenda_store: dict[str, AgendaResponse] = {}


def error_response(
    status_code: int,
    code: str,
    message: str,
    retry_guidance: str,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "request_id": str(uuid4()),
                "details": None,
                "retry_guidance": retry_guidance,
            }
        },
    )


@router.post(
    "/agendas",
    response_model=AgendaResponse,
    status_code=201,
)
async def upload_agenda(
    file: UploadFile = File(...),
    meeting_title: str | None = Form(None),
    meeting_date: date | None = Form(None),
    source_url: str | None = Form(None),
    client_version: str | None = Form(None),
):
    file_name = file.filename or "unnamed"
    extension = Path(file_name).suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        return error_response(
            415,
            "UNSUPPORTED_FILE_TYPE",
            "Supported file types are searchable PDF, TXT, and Markdown.",
            "Convert the file to PDF, TXT, or Markdown and upload it again.",
        )

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        return error_response(
            413,
            "FILE_TOO_LARGE",
            "The uploaded file exceeds the 25 MB limit.",
            "Reduce the file size and upload it again.",
        )

    if not content:
        return error_response(
            400,
            "INVALID_REQUEST",
            "The uploaded file is empty.",
            "Choose a nonempty agenda file.",
        )

    agenda_id = str(uuid4())

    try:
        text = extract_text(file_name, content)
        items = parse_agenda_items(text, agenda_id)
    except UnsupportedFileTypeError as error:
        return error_response(
            415,
            "UNSUPPORTED_FILE_TYPE",
            str(error),
            "Convert the file to a supported format.",
        )
    except OCRRequiredError as error:
        return error_response(
            422,
            "OCR_REQUIRED",
            str(error),
            "Apply OCR or provide a searchable version of the PDF.",
        )
    except AgendaParserError as error:
        return error_response(
            400,
            "INVALID_REQUEST",
            str(error),
            "Correct the file and upload it again.",
        )

    warnings: list[str] = []

    if meeting_title is None:
        warnings.append("Meeting title was not supplied.")

    if meeting_date is None:
        warnings.append("Meeting date was not supplied.")

    response = AgendaResponse(
        agenda_id=agenda_id,
        meeting_title=meeting_title,
        meeting_date=meeting_date,
        version_id=str(uuid4()),
        original_file_name=file_name,
        uploader="local_prototype_user",
        source_url=source_url,
        client_version=client_version,
        uploaded_at=datetime.now(timezone.utc),
        parsing_status=(
            "completed_with_warnings" if warnings else "completed"
        ),
        warnings=warnings,
        items=items,
    )

    agenda_store[agenda_id] = response
    return response


@router.get(
    "/agendas/{agenda_id}",
    response_model=AgendaResponse,
)
def get_agenda(agenda_id: str):
    agenda = agenda_store.get(agenda_id)

    if agenda is None:
        return error_response(
            404,
            "NOT_FOUND",
            "The requested agenda was not found.",
            "Verify the agenda identifier and try again.",
        )

    return agenda