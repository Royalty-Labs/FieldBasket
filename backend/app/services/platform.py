from sqlalchemy.orm import Session

from app.models import PlatformSettings


def get_platform_settings(db: Session) -> PlatformSettings:
    """The single settings row, created with safe defaults if missing."""
    settings_row = db.get(PlatformSettings, 1)
    if settings_row is None:
        settings_row = PlatformSettings(id=1)
        db.add(settings_row)
        db.flush()
    return settings_row
