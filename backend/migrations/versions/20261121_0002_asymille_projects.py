"""Asymille: the projects of each user (sheets, graphs, fits), kept as the page writes them.

    users ─── asymille_projects

The table is defined by backend/asymille/web/tables.py on the application's base
(app/asymille.py). A project belongs to its owner and leaves with them.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-21
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('asymille_projects',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('owner_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('sheet_count', sa.Integer(), nullable=False),
    sa.Column('graph_count', sa.Integer(), nullable=False),
    sa.Column('fit_count', sa.Integer(), nullable=False),
    sa.Column('document', sa.JSON(), nullable=False),
    sa.Column('revision', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], name=op.f('fk_asymille_projects_owner_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_asymille_projects'))
    )
    with op.batch_alter_table('asymille_projects', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_asymille_projects_owner_id'), ['owner_id'], unique=False)
        batch_op.create_index('ix_asymille_projects_owner_updated', ['owner_id', 'updated_at'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('asymille_projects', schema=None) as batch_op:
        batch_op.drop_index('ix_asymille_projects_owner_updated')
        batch_op.drop_index(batch_op.f('ix_asymille_projects_owner_id'))

    op.drop_table('asymille_projects')
