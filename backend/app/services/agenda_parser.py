import re
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from pypdf import PdfReader

from app.models import AgendaItem


SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md"}


class AgendaParserError(Exception):
    """Base exception for agenda parsing failures."""


class UnsupportedFileTypeError(AgendaParserError):
    """Raised when the uploaded file type is unsupported."""


class OCRRequiredError(AgendaParserError):
    """Raised when a PDF does not contain enough searchable text."""


def extract_text(file_name: str, content: bytes) -> str:
    extension = Path(file_name).suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        raise UnsupportedFileTypeError(
            "Supported file types are PDF, TXT, and Markdown."
        )

    if extension in {".txt", ".md"}:
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError as error:
            raise AgendaParserError(
                "The text file must use UTF-8 encoding."
            ) from error

    else:
        try:
            reader = PdfReader(BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as error:
            raise AgendaParserError(
                "The PDF could not be read."
            ) from error

        searchable_characters = len(re.sub(r"\s+", "", text))
        if searchable_characters < 100:
            raise OCRRequiredError(
                "The PDF does not contain enough searchable text."
            )

    if not text.strip():
        raise AgendaParserError("The uploaded file contains no readable text.")

    return text


def parse_agenda_items(text: str, agenda_id: str) -> list[AgendaItem]:
    lines = text.splitlines()

    item_pattern = re.compile(
        r"^\s*(?:ITEM\s+)?"
        r"(?P<number>\d+(?:\.\d+)*)"
        r"(?:[.)])?\s+"
        r"(?P<title>.{3,250})\s*$",
        re.IGNORECASE,
    )

    matches: list[tuple[int, str, str]] = []

    for line_index, line in enumerate(lines):
        match = item_pattern.match(line)

        if match:
            matches.append(
                (
                    line_index,
                    match.group("number"),
                    match.group("title").strip(),
                )
            )

    if not matches:
        raise AgendaParserError(
            "No numbered agenda items could be identified."
        )

    items: list[AgendaItem] = []

    for order, (line_index, item_number, title) in enumerate(matches):
        next_line_index = (
            matches[order + 1][0]
            if order + 1 < len(matches)
            else len(lines)
        )

        source_text = "\n".join(
            lines[line_index:next_line_index]
        ).strip()

        items.append(
            AgendaItem(
                item_id=str(uuid4()),
                agenda_id=agenda_id,
                item_number=item_number,
                title=title,
                source_text=source_text,
                order=order,
                review_status="needs_review",
            )
        )

    return items