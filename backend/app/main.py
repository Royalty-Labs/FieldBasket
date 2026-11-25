import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.admin import router as admin_router
from app.api.routes.auth import router as auth_router
from app.api.routes.farmers import router as farmers_router
from app.api.routes.products import router as products_router
from app.api.routes.orders import router as orders_router
from app.api.routes.payments import router as payments_router
from app.api.routes.delivery import router as delivery_router
from app.api.routes.admin_ops import router as admin_ops_router
from app.core.config import settings
from app.db.session import SessionLocal
from app.services.checkout_flow import expire_stale_checkouts
from app.services.email import send_all

logger = logging.getLogger(__name__)


def _sweep_checkouts() -> None:
    with SessionLocal() as db:
        emails = expire_stale_checkouts(db)
        db.commit()
    send_all(emails)


async def _checkout_sweeper() -> None:
    """Every few minutes, release stock held by unpaid checkouts."""
    while True:
        await asyncio.sleep(300)
        try:
            await asyncio.to_thread(_sweep_checkouts)
        except Exception:  # keep the loop alive whatever happens
            logger.exception("Checkout sweep failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(_checkout_sweeper())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(
    title="FieldBasket API",
    description="Verified-farmer marketplace for Ekiti State.",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(farmers_router)
app.include_router(products_router)
app.include_router(orders_router)
app.include_router(payments_router)
app.include_router(delivery_router)
app.include_router(admin_router)
app.include_router(admin_ops_router)


@app.get("/", tags=["Health"])
def root():
    return {
        "message": "Welcome to FieldBasket API",
        "status": "running",
    }


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "fieldbasket-api",
    }
