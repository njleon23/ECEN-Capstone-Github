from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AgendaRecord(Base):
    __tablename__ = "agendas"

    agenda_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    meeting_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    meeting_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    version_id: Mapped[str] = mapped_column(String(36), nullable=False)
    original_file_name: Mapped[str] = mapped_column(Text, nullable=False)
    uploader: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_version: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    parsing_status: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    warnings: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )

    items: Mapped[list[AgendaItemRecord]] = relationship(
        back_populates="agenda",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="AgendaItemRecord.item_order",
    )


class AgendaItemRecord(Base):
    __tablename__ = "agenda_items"
    __table_args__ = (
        Index(
            "idx_agenda_items_agenda_id",
            "agenda_id",
            "item_order",
        ),
    )

    item_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agenda_id: Mapped[str] = mapped_column(
        ForeignKey("agendas.agenda_id", ondelete="CASCADE"),
        nullable=False,
    )
    item_number: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    item_order: Mapped[int] = mapped_column(Integer, nullable=False)
    review_status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
    )

    agenda: Mapped[AgendaRecord] = relationship(
        back_populates="items",
    )


class SourceRecord(Base):
    __tablename__ = "sources"

    source_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
    )
    source_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )
    source_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    file_name: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    approved: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )