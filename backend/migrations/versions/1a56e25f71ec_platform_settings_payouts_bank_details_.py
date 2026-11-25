"""platform settings, payouts, bank details and delivery stages

Revision ID: 1a56e25f71ec
Revises: 23d56d9ac4bb
Create Date: 2026-11-25 14:07:36.176145

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1a56e25f71ec'
down_revision: Union[str, Sequence[str], None] = '23d56d9ac4bb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('platform_settings',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('commission_percent', sa.Numeric(precision=5, scale=2), server_default='0', nullable=False),
    sa.Column('service_area', sa.String(length=100), server_default='Ekiti State', nullable=False),
    sa.Column('operator_name', sa.String(length=150), nullable=True),
    sa.Column('support_email', sa.String(length=255), nullable=True),
    sa.Column('support_phone', sa.String(length=30), nullable=True),
    sa.Column('support_whatsapp', sa.String(length=30), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.CheckConstraint('commission_percent >= 0 AND commission_percent <= 50', name='ck_platform_commission_range'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('payouts',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('farmer_id', sa.Uuid(), nullable=False),
    sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('gross_amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('commission_amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('order_count', sa.Integer(), nullable=False),
    sa.Column('bank_name', sa.String(length=100), nullable=True),
    sa.Column('account_number', sa.String(length=20), nullable=True),
    sa.Column('account_name', sa.String(length=150), nullable=True),
    sa.Column('transfer_reference', sa.String(length=100), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('recorded_by_id', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.CheckConstraint('amount >= 0', name='ck_payout_amount_nonnegative'),
    sa.ForeignKeyConstraint(['farmer_id'], ['users.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['recorded_by_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_payouts_farmer_id'), 'payouts', ['farmer_id'], unique=False)
    with op.batch_alter_table('farmer_profiles') as batch:
        batch.add_column(sa.Column('bank_name', sa.String(length=100), nullable=True))
        batch.add_column(sa.Column('account_number', sa.String(length=20), nullable=True))
        batch.add_column(sa.Column('account_name', sa.String(length=150), nullable=True))
        batch.add_column(sa.Column('bank_updated_at', sa.DateTime(timezone=True), nullable=True))

    # Orders placed so far keep a 0% commission: they were agreed before it existed.
    with op.batch_alter_table('orders') as batch:
        batch.add_column(sa.Column('commission_percent', sa.Numeric(precision=5, scale=2), server_default='0', nullable=False))
        batch.add_column(sa.Column('delivery_stage', sa.String(length=20), nullable=True))
        batch.add_column(sa.Column('payout_id', sa.Uuid(), nullable=True))
        batch.create_index('ix_orders_payout_id', ['payout_id'], unique=False)
        batch.create_foreign_key('fk_orders_payout_id_payouts', 'payouts', ['payout_id'], ['id'], ondelete='SET NULL')
        batch.create_check_constraint(
            'ck_order_delivery_stage_valid',
            "delivery_stage IS NULL OR delivery_stage IN ('picked_up', 'out_for_delivery', 'delivered')",
        )

    # The single settings row. Commission starts at 0% until an admin sets it.
    op.execute("INSERT INTO platform_settings (id, commission_percent, service_area) VALUES (1, 0, 'Ekiti State')")


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('orders') as batch:
        batch.drop_constraint('ck_order_delivery_stage_valid', type_='check')
        batch.drop_constraint('fk_orders_payout_id_payouts', type_='foreignkey')
        batch.drop_index('ix_orders_payout_id')
        batch.drop_column('payout_id')
        batch.drop_column('delivery_stage')
        batch.drop_column('commission_percent')
    with op.batch_alter_table('farmer_profiles') as batch:
        batch.drop_column('bank_updated_at')
        batch.drop_column('account_name')
        batch.drop_column('account_number')
        batch.drop_column('bank_name')
    op.drop_index(op.f('ix_payouts_farmer_id'), table_name='payouts')
    op.drop_table('payouts')
    op.drop_table('platform_settings')
