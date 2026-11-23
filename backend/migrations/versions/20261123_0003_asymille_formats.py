"""Asymille: the formats of a figure a person kept under a name (its size, its type, its lines, its ticks).

    users ─── asymille_formats

The table is defined by backend/asymille/web/tables.py on the application's base
(app/asymille.py). A format belongs to its owner and leaves with them; two
people may each keep one under the same name, one person may not.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-23
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('asymille_formats',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('owner_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=60), nullable=False),
    sa.Column('format', sa.JSON(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], name=op.f('fk_asymille_formats_owner_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_asymille_formats')),
    sa.UniqueConstraint('owner_id', 'name', name='uq_asymille_formats_owner_name')
    )
    with op.batch_alter_table('asymille_formats', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_asymille_formats_owner_id'), ['owner_id'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('asymille_formats', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_asymille_formats_owner_id'))

    op.drop_table('asymille_formats')
