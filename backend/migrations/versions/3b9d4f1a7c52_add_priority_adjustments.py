"""Add priority adjustment history

Revision ID: 3b9d4f1a7c52
Revises: 48de1fd2356a
Create Date: 2026-11-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3b9d4f1a7c52'
down_revision: Union[str, Sequence[str], None] = '48de1fd2356a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('priority_adjustments',
    sa.Column('adjustment_id', sa.String(length=36), nullable=False),
    sa.Column('item_id', sa.String(length=36), nullable=False),
    sa.Column('job_id', sa.String(length=36), nullable=False),
    sa.Column('factor_key', sa.String(length=64), nullable=False),
    sa.Column('old_value', sa.Float(), nullable=False),
    sa.Column('new_value', sa.Float(), nullable=False),
    sa.Column('old_score', sa.Float(), nullable=False),
    sa.Column('new_score', sa.Float(), nullable=False),
    sa.Column('new_category', sa.String(length=32), nullable=False),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('reviewer', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['item_id'], ['agenda_items.item_id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['job_id'], ['analysis_jobs.job_id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('adjustment_id')
    )
    op.create_index('idx_priority_adjustments_item_created_at', 'priority_adjustments', ['item_id', 'created_at'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_priority_adjustments_item_created_at', table_name='priority_adjustments')
    op.drop_table('priority_adjustments')
