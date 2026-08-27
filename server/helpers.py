"""Small shared utilities: slugs, booking references, uploads, availability."""

import re
import secrets
import shutil
import uuid
from datetime import date as date_cls
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile
from sqlmodel import Session, func, select

from models import Booking, Restaurant

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug or "restaurant"


def unique_slug(session: Session, name: str, exclude_id: Optional[int] = None) -> str:
    """Append -2, -3 ... until the slug is free. Slugs are the public URL key."""
    base = slugify(name)
    candidate = base
    counter = 2
    while True:
        query = select(Restaurant).where(Restaurant.slug == candidate)
        if exclude_id is not None:
            query = query.where(Restaurant.id != exclude_id)
        if session.exec(query).first() is None:
            return candidate
        candidate = f"{base}-{counter}"
        counter += 1


def new_booking_reference(session: Session) -> str:
    """Guest-facing reference, e.g. GR-9F2A61C3."""
    while True:
        reference = f"GR-{secrets.token_hex(4).upper()}"
        if session.exec(select(Booking).where(Booking.booking_id == reference)).first() is None:
            return reference


def save_upload(file: UploadFile) -> str:
    """Persist an uploaded cover image and return its public path."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Cover image must be a JPG, PNG, WEBP or GIF.")

    suffix = Path(file.filename or "").suffix.lower() or ".jpg"
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        suffix = ".jpg"

    destination = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    with destination.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer, length=1024 * 1024)

    if destination.stat().st_size > MAX_IMAGE_BYTES:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=413, detail="Cover image must be smaller than 5 MB.")

    return f"/uploads/{destination.name}"


def parse_date(value: str, field: str = "date") -> date_cls:
    try:
        return date_cls.fromisoformat(value[:10])
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail=f"'{field}' must be a valid date (YYYY-MM-DD).")


def seats_taken(session: Session, restaurant_id: int, day: str, time: str) -> int:
    """Guests already booked into one slot. Cancelled reservations free seats."""
    total = session.exec(
        select(func.coalesce(func.sum(Booking.guests), 0)).where(
            Booking.restaurant_id == restaurant_id,
            Booking.date == day,
            Booking.time == time,
            Booking.status != "cancelled",
        )
    ).one()
    return int(total or 0)


def availability_for(session: Session, restaurant: Restaurant, day: str) -> list[dict]:
    """Per-slot remaining capacity, in the shape BookingWidget renders."""
    slots = [s.strip() for s in (restaurant.available_slots or "").split(",") if s.strip()]
    result = []
    for slot in sorted(slots):
        taken = seats_taken(session, restaurant.id, day, slot)
        remaining = max(restaurant.total_seats - taken, 0)
        result.append(
            {
                "time": slot,
                "availableSeats": remaining,
                "totalSeats": restaurant.total_seats,
                "isAvailable": remaining > 0,
            }
        )
    return result
