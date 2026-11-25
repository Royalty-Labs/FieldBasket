from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "FieldBasket API"
    database_url: str = "sqlite:///./farmlink.db"

    # Required secret: load it from backend/.env.
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # Comma-separated list of frontend origins allowed to call the API.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    cloudinary_cloud_name: str | None = None
    cloudinary_api_key: str | None = None
    cloudinary_api_secret: str | None = None

    # Public address of the website, used in emails and payment redirects.
    # Optional: when blank, the first address in CORS_ORIGINS is used.
    frontend_url: str | None = None

    # Email (SMTP). Emails are skipped, with a log line, until host and
    # sender are set. Works with Brevo, Mailgun, Zoho, Gmail and others.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True
    email_from: str | None = None  # e.g. "FieldBasket <orders@fieldbasket.ng>"

    # Payments. A provider appears at checkout once its keys are set.
    paystack_secret_key: str | None = None
    paystack_base_url: str = "https://api.paystack.co"
    interswitch_merchant_code: str | None = None
    interswitch_pay_item_id: str | None = None
    interswitch_mode: str = "test"  # "test" or "live"
    interswitch_pay_url: str | None = None  # override the hosted page URL
    interswitch_requery_url: str | None = None  # override the status URL

    # Apply database migrations when the API starts (Postgres only).
    migrate_on_start: bool = True

    # Unpaid checkouts release their reserved stock after this long.
    checkout_expiry_minutes: int = 60

    # Error alerts (https://sentry.io). Off when blank.
    sentry_dsn: str | None = None
    environment: str = "production"  # set "development" on your own computer

    # Single orders without payment (POST /orders). Off in production.
    allow_unpaid_orders: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        """Accept Render's URL as-is (postgres:// or postgresql://)."""
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix):]
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip().rstrip("/")
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]


    @property
    def frontend_base(self) -> str:
        base = self.frontend_url or (self.cors_origin_list[0] if self.cors_origin_list else "")
        return base.rstrip("/")


settings = Settings()
