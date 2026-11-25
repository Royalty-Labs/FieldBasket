from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models import FarmerProfile, User
from app.services import messages
from app.services.email import send_email
from app.schemas.admin import (
    AdminFarmerProfileResponse,
    FarmerProfileReviewRequest,
)


router = APIRouter(prefix="/admin/farmer-profiles", tags=["Admin - Farmer Review"])


@router.get("", response_model=list[AdminFarmerProfileResponse])
def list_farmer_profiles(
    verification_status: Literal["pending", "approved", "rejected"] | None = Query(
        default=None
    ),
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> list[FarmerProfile]:
    query = select(FarmerProfile).order_by(
        FarmerProfile.created_at.asc(),
        FarmerProfile.id.asc(),
    )

    if verification_status is not None:
        query = query.where(
            FarmerProfile.verification_status == verification_status
        )

    return list(db.scalars(query).all())


@router.patch(
    "/{profile_id}/review",
    response_model=AdminFarmerProfileResponse,
)
def review_farmer_profile(
    profile_id: UUID,
    data: FarmerProfileReviewRequest,
    background: BackgroundTasks,
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> FarmerProfile:
    profile = db.get(FarmerProfile, profile_id)

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Farmer profile not found.",
        )

    if profile.verification_status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending farmer profiles can be reviewed.",
        )

    profile.verification_status = data.verification_status
    profile.rejection_reason = data.rejection_reason
    profile.user.is_verified = data.verification_status == "approved"

    try:
        db.commit()
        db.refresh(profile)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The farmer profile could not be reviewed.",
        ) from None

    background.add_task(
        send_email,
        messages.farmer_review_result(
            profile.user.email,
            profile.user.full_name,
            profile.farm_name,
            data.verification_status == "approved",
            data.rejection_reason,
        ),
    )
    return profile
