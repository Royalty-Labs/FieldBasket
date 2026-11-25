"""Bring the database schema up to date when the API starts.

This means a deploy works whether or not the hosting start command runs
`alembic upgrade head` itself. A Postgres advisory lock stops two
starting copies of the API from migrating at the same time.
"""

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[2]
LOCK_ID = 7_351_204  # any fixed number, shared by every copy of the API


def upgrade_database() -> None:
    if not settings.migrate_on_start or settings.database_url.startswith("sqlite"):
        return
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.attributes["configure_logger"] = False
    with engine.connect() as connection:
        connection.execute(text("SELECT pg_advisory_lock(:id)"), {"id": LOCK_ID})
        try:
            command.upgrade(config, "head")
            logger.info("Database schema is up to date.")
        finally:
            connection.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": LOCK_ID})
            connection.commit()
