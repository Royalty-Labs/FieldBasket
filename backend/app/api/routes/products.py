from decimal import Decimal
from io import BytesIO
from uuid import UUID

import cloudinary
import cloudinary.uploader
from cloudinary.exceptions import Error as CloudinaryError
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.config import settings
from app.db.session import get_db
from app.models import FarmerProfile, Product, User
from app.schemas.product import ProductCreate, ProductResponse, ProductUpdate

router = APIRouter(prefix="/products", tags=["Products"])
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB

ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}

MAX_IMAGE_PIXELS = 25_000_000


def escape_like(value: str) -> str:
    """Treat %, _ and \\ in user input as plain characters in LIKE queries."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def strip_image_metadata(image_bytes: bytes) -> bytes:
    """Re-encode an image without EXIF data (camera details, GPS location).

    The photo is rotated upright first, since dropping EXIF also drops
    the orientation flag phones rely on.
    """
    with Image.open(BytesIO(image_bytes)) as original:
        image_format = original.format
        upright = ImageOps.exif_transpose(original)
        output = BytesIO()

        if image_format == "JPEG":
            upright.convert("RGB").save(output, format="JPEG", quality=88, optimize=True)
        elif image_format == "PNG":
            upright.save(output, format="PNG", optimize=True)
        else:
            upright.save(output, format="WEBP", quality=88)

        return output.getvalue()


def get_approved_farmer_profile(
    current_user: User,
    db: Session,
) -> FarmerProfile:
    profile = db.scalar(
        select(FarmerProfile).where(
            FarmerProfile.user_id == current_user.id
        )
    )

    if profile is None or profile.verification_status != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="An approved farmer profile is required to publish products.",
        )

    return profile


def get_owned_product(
    product_id: UUID,
    current_user: User,
    db: Session,
) -> Product:
    product = db.get(Product, product_id)

    if product is None or product.seller_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    return product


@router.get("/mine", response_model=list[ProductResponse])
def list_my_products(
    current_user: User = Depends(require_role("farmer")),
    db: Session = Depends(get_db),
) -> list[Product]:
    query = (
        select(Product)
        .where(Product.seller_id == current_user.id)
        .order_by(Product.created_at.desc(), Product.id.asc())
    )
    return list(db.scalars(query).all())


@router.get("", response_model=list[ProductResponse])
def list_public_products(
    category: str | None = Query(default=None, min_length=1, max_length=80),
    search: str | None = Query(default=None, min_length=1, max_length=150),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[Product]:
    query = (
        select(Product)
        .join(FarmerProfile, FarmerProfile.user_id == Product.seller_id)
        .where(
            FarmerProfile.verification_status == "approved",
            Product.is_available.is_(True),
            Product.quantity_available > Decimal("0"),
        )
    )

    if category is not None:
        query = query.where(
            Product.category.ilike(escape_like(category.strip()), escape="\\")
        )

    if search is not None:
        query = query.where(
            Product.name.ilike(f"%{escape_like(search.strip())}%", escape="\\")
        )

    query = query.order_by(Product.created_at.desc(), Product.id.asc())
    query = query.offset(skip).limit(limit)

    return list(db.scalars(query).all())


@router.post(
    "",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    data: ProductCreate,
    current_user: User = Depends(require_role("farmer")),
    db: Session = Depends(get_db),
) -> Product:
    profile = get_approved_farmer_profile(current_user, db)

    product = Product(
        seller_id=current_user.id,
        name=data.name,
        description=data.description,
        category=data.category,
        price_per_unit=data.price_per_unit,
        unit=data.unit,
        quantity_available=data.quantity_available,
        location=f"{profile.town}, {profile.state}",
        is_available=True,
    )
    db.add(product)

    try:
        db.commit()
        db.refresh(product)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The product could not be created.",
        ) from None

    return product


@router.get("/{product_id}", response_model=ProductResponse)
def get_public_product(
    product_id: UUID,
    db: Session = Depends(get_db),
) -> Product:
    query = (
        select(Product)
        .join(FarmerProfile, FarmerProfile.user_id == Product.seller_id)
        .where(
            Product.id == product_id,
            FarmerProfile.verification_status == "approved",
            Product.is_available.is_(True),
            Product.quantity_available > Decimal("0"),
        )
    )
    product = db.scalar(query)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    return product


@router.patch("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: UUID,
    data: ProductUpdate,
    current_user: User = Depends(require_role("farmer")),
    db: Session = Depends(get_db),
) -> Product:
    get_approved_farmer_profile(current_user, db)
    product = get_owned_product(product_id, current_user, db)

    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(product, field, value)

    try:
        db.commit()
        db.refresh(product)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The product could not be updated.",
        ) from None

    return product


@router.delete(
    "/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_product(
    product_id: UUID,
    current_user: User = Depends(require_role("farmer")),
    db: Session = Depends(get_db),
) -> Response:
    # Owners can remove their own listing even if their approval later changes.
    product = get_owned_product(product_id, current_user, db)
    db.delete(product)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.post(
    "/{product_id}/image",
    response_model=ProductResponse,
)
def upload_product_image(
    product_id: UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("farmer")),
    db: Session = Depends(get_db),
) -> Product:
    # Only approved farmers can upload product images.
    get_approved_farmer_profile(current_user, db)

    # Farmers can only upload images to their own products.
    product = get_owned_product(product_id, current_user, db)

    # Check Cloudinary configuration.
    if not all(
        (
            settings.cloudinary_cloud_name,
            settings.cloudinary_api_key,
            settings.cloudinary_api_secret,
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Product image storage is not configured.",
        )

    # Read at most 5 MB plus one byte to detect oversized files.
    image_bytes = file.file.read(MAX_IMAGE_SIZE + 1)

    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded image is empty.",
        )

    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image size must not exceed 5 MB.",
        )

    # Validate the actual image rather than trusting its filename or MIME type.
    try:
        image = Image.open(BytesIO(image_bytes))

        if image.format not in ALLOWED_IMAGE_FORMATS:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Only JPEG, PNG and WebP images are supported.",
            )

        if image.width * image.height > MAX_IMAGE_PIXELS:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Image dimensions are too large.",
            )

        image.verify()
        image_bytes = strip_image_metadata(image_bytes)

    except HTTPException:
        raise

    except (
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is not a valid image.",
        ) from None

    # Configure Cloudinary using environment-based settings.
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )

    try:
        upload_result = cloudinary.uploader.upload(
            image_bytes,
            folder="fieldbasket/products",
            public_id=f"product_{product.id}",
            overwrite=True,
            invalidate=True,
            resource_type="image",
        )

    except CloudinaryError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The image storage service could not save your image.",
        ) from None

    image_url = upload_result.get("secure_url")

    if not image_url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The image storage service returned an invalid response.",
        )

    product.image_url = image_url

    try:
        db.commit()
        db.refresh(product)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The product image could not be saved.",
        ) from None

    return product