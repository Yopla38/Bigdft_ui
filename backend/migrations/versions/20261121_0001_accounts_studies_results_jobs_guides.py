"""Accounts, studies, results, jobs, guides: the first schema of the application.

    users ─┬─ sessions
           ├─ studies ─┬─ run_results
           │           └─ jobs
           └─ guides
    login_attempts

Revision ID: 0001
Revises:
Create Date: 2026-11-21
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('login_attempts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=254), nullable=False),
    sa.Column('ip', sa.String(length=45), nullable=False),
    sa.Column('at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_login_attempts'))
    )
    with op.batch_alter_table('login_attempts', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_login_attempts_at'), ['at'], unique=False)
        batch_op.create_index('ix_login_attempts_email_ip', ['email', 'ip'], unique=False)

    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=254), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('role', sa.Enum('USER', 'ADMIN', name='role', native_enum=False, length=8), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
    sa.UniqueConstraint('email', name=op.f('uq_users_email'))
    )
    op.create_table('guides',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('owner_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=120), nullable=False),
    sa.Column('level', sa.String(length=20), nullable=False),
    sa.Column('minutes', sa.Integer(), nullable=False),
    sa.Column('summary', sa.String(length=600), nullable=False),
    sa.Column('origin', sa.String(length=120), nullable=False),
    sa.Column('notebook', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], name=op.f('fk_guides_owner_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_guides'))
    )
    with op.batch_alter_table('guides', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_guides_owner_id'), ['owner_id'], unique=False)

    op.create_table('sessions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('csrf_token', sa.String(length=64), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('user_agent', sa.String(length=200), nullable=False),
    sa.Column('ip', sa.String(length=45), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_sessions_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_sessions')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_sessions_token_hash'))
    )
    with op.batch_alter_table('sessions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_sessions_expires_at'), ['expires_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_sessions_user_id'), ['user_id'], unique=False)

    op.create_table('studies',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('owner_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=60), nullable=False),
    sa.Column('system', sa.String(length=40), nullable=False),
    sa.Column('step_count', sa.Integer(), nullable=False),
    sa.Column('document', sa.JSON(), nullable=False),
    sa.Column('revision', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], name=op.f('fk_studies_owner_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_studies'))
    )
    with op.batch_alter_table('studies', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_studies_owner_id'), ['owner_id'], unique=False)
        batch_op.create_index('ix_studies_owner_updated', ['owner_id', 'updated_at'], unique=False)

    op.create_table('jobs',
    sa.Column('id', sa.String(length=16), nullable=False),
    sa.Column('owner_id', sa.Integer(), nullable=False),
    sa.Column('study_id', sa.Integer(), nullable=False),
    sa.Column('state', sa.String(length=12), nullable=False),
    sa.Column('runs', sa.JSON(), nullable=False),
    sa.Column('pid', sa.Integer(), nullable=True),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], name=op.f('fk_jobs_owner_id_users'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['study_id'], ['studies.id'], name=op.f('fk_jobs_study_id_studies'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_jobs'))
    )
    with op.batch_alter_table('jobs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_jobs_owner_id'), ['owner_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_jobs_state'), ['state'], unique=False)
        batch_op.create_index(batch_op.f('ix_jobs_study_id'), ['study_id'], unique=False)

    op.create_table('run_results',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('study_id', sa.Integer(), nullable=False),
    sa.Column('owner_id', sa.Integer(), nullable=False),
    sa.Column('key_hash', sa.String(length=64), nullable=False),
    sa.Column('key', sa.Text(), nullable=False),
    sa.Column('name', sa.String(length=30), nullable=False),
    sa.Column('result', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], name=op.f('fk_run_results_owner_id_users'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['study_id'], ['studies.id'], name=op.f('fk_run_results_study_id_studies'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_run_results')),
    sa.UniqueConstraint('study_id', 'key_hash', name=op.f('uq_run_results_study_id'))
    )
    with op.batch_alter_table('run_results', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_run_results_owner_id'), ['owner_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_run_results_study_id'), ['study_id'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('run_results', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_run_results_study_id'))
        batch_op.drop_index(batch_op.f('ix_run_results_owner_id'))

    op.drop_table('run_results')
    with op.batch_alter_table('jobs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_jobs_study_id'))
        batch_op.drop_index(batch_op.f('ix_jobs_state'))
        batch_op.drop_index(batch_op.f('ix_jobs_owner_id'))

    op.drop_table('jobs')
    with op.batch_alter_table('studies', schema=None) as batch_op:
        batch_op.drop_index('ix_studies_owner_updated')
        batch_op.drop_index(batch_op.f('ix_studies_owner_id'))

    op.drop_table('studies')
    with op.batch_alter_table('sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_sessions_user_id'))
        batch_op.drop_index(batch_op.f('ix_sessions_expires_at'))

    op.drop_table('sessions')
    with op.batch_alter_table('guides', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_guides_owner_id'))

    op.drop_table('guides')
    op.drop_table('users')
    with op.batch_alter_table('login_attempts', schema=None) as batch_op:
        batch_op.drop_index('ix_login_attempts_email_ip')
        batch_op.drop_index(batch_op.f('ix_login_attempts_at'))

    op.drop_table('login_attempts')
