"""The restaurant partner portal: one venue per owner, plus its reservations."""

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlmodel import Session, col, func, select

from auth import require_owner
from database import get_session
from helpers import save_upload, unique_slug
from models import Booking, BookingStatusUpdate, Restaurant, User, utcnow
from serializers import booking_public, restaurant_public

router = APIRouter(prefix="/api/owner", tags=["owner"])

VALID_PRICE_RANGES = {"$", "$$", "$$$", "$$$$"}
BOOKING_STATUSES = {"confirmed", "completed", "cancelled"}


def _my_restaurant(session: Session, current: User) -> Optional[Restaurant]:
    return session.exec(select(Restaurant).where(Restaurant.owner_id == current.id)).first()


def _clean_slots(raw: str) -> str:
    """Normalise 'availableSlots' from the wizard's comma-joined string."""
    slots = sorted({s.strip() for s in (raw or "").split(",") if s.strip()})
    if not slots:
        raise HTTPException(status_code=422, detail="Pick at least one dining slot.")
    return ",".join(slots)


def _clean_tags(raw: str) -> str:
    return ",".join(t.strip() for t in (raw or "").split(",") if t.strip())


# ── Restaurant profile ──────────────────────────────────────────────────────


@router.get("/restaurant")
def get_my_restaurant(current: User = Depends(require_owner), session: Session = Depends(get_session)):
    """Returns null when the owner hasn't registered a venue yet — that's the
    signal the dashboard uses to show the setup wizard."""
    restaurant = _my_restaurant(session, current)
    return restaurant_public(restaurant, owner=current) if restaurant else None


@router.post("/restaurant", status_code=status.HTTP_201_CREATED)
def create_my_restaurant(
    name: str = Form(...),
    description: str = Form(""),
    cuisine: str = Form(...),
    priceRange: str = Form("$$"),
    location: str = Form(...),
    address: str = Form(...),
    chef: str = Form(""),
    tags: str = Form(""),
    availableSlots: str = Form(""),
    totalSeats: int = Form(20),
    image: Optional[UploadFile] = File(None),
    current: User = Depends(require_owner),
    session: Session = Depends(get_session),
):
    if _my_restaurant(session, current) is not None:
        raise HTTPException(
            status_code=409,
            detail="You already have a restaurant registered. Edit it under Profile Details.",
        )

    if priceRange not in VALID_PRICE_RANGES:
        raise HTTPException(status_code=422, detail="Price range must be $, $$, $$$ or $$$$.")
    if totalSeats < 1:
        raise HTTPException(status_code=422, detail="Total capacity must be at least 1 seat.")

    restaurant = Restaurant(
        name=name.strip(),
        slug=unique_slug(session, name),
        description=description.strip(),
        cuisine=cuisine.strip(),
        price_range=priceRange,
        location=location.strip(),
        address=address.strip(),
        chef=chef.strip(),
        tags=_clean_tags(tags),
        available_slots=_clean_slots(availableSlots),
        total_seats=totalSeats,
        image=save_upload(image) if image and image.filename else "/restaurant_1.png",
        owner_id=current.id,
        # New venues are invisible to diners until an admin approves them.
        status="pending",
    )
    session.add(restaurant)
    session.commit()
    session.refresh(restaurant)
    return restaurant_public(restaurant, owner=current)


@router.put("/restaurant")
def update_my_restaurant(
    name: str = Form(...),
    description: str = Form(""),
    cuisine: str = Form(...),
    priceRange: str = Form("$$"),
    location: str = Form(...),
    address: str = Form(...),
    chef: str = Form(""),
    tags: str = Form(""),
    availableSlots: str = Form(""),
    totalSeats: int = Form(20),
    image: Optional[UploadFile] = File(None),
    current: User = Depends(require_owner),
    session: Session = Depends(get_session),
):
    restaurant = _my_restaurant(session, current)
    if restaurant is None:
        raise HTTPException(status_code=404, detail="You haven't registered a restaurant yet.")

    if priceRange not in VALID_PRICE_RANGES:
        raise HTTPException(status_code=422, detail="Price range must be $, $$, $$$ or $$$$.")
    if totalSeats < 1:
        raise HTTPException(status_code=422, detail="Total capacity must be at least 1 seat.")

    if name.strip() != restaurant.name:
        restaurant.slug = unique_slug(session, name, exclude_id=restaurant.id)

    restaurant.name = name.strip()
    restaurant.description = description.strip()
    restaurant.cuisine = cuisine.strip()
    restaurant.price_range = priceRange
    restaurant.location = location.strip()
    restaurant.address = address.strip()
    restaurant.chef = chef.strip()
    restaurant.tags = _clean_tags(tags)
    restaurant.available_slots = _clean_slots(availableSlots)
    restaurant.total_seats = totalSeats
    if image and image.filename:
        restaurant.image = save_upload(image)
    restaurant.updated_at = utcnow()

    session.add(restaurant)
    session.commit()
    session.refresh(restaurant)
    return restaurant_public(restaurant, owner=current)


@router.delete("/restaurant")
def delete_my_restaurant(current: User = Depends(require_owner), session: Session = Depends(get_session)):
    """Withdraw the listing. Reservation history is kept for the diners."""
    restaurant = _my_restaurant(session, current)
    if restaurant is None:
        raise HTTPException(status_code=404, detail="You haven't registered a restaurant yet.")

    upcoming = session.exec(
        select(func.count(Booking.id)).where(
            Booking.restaurant_id == restaurant.id, Booking.status == "confirmed"
        )
    ).one()
    if int(upcoming or 0) > 0:
        raise HTTPException(
            status_code=409,
            detail="Cancel or complete the outstanding reservations before removing your listing.",
        )

    session.delete(restaurant)
    session.commit()
    return {"message": "Restaurant listing removed."}


# ── Reservations at my restaurant ───────────────────────────────────────────


@router.get("/bookings")
def my_restaurant_bookings(
    status_filter: Optional[str] = None,
    current: User = Depends(require_owner),
    session: Session = Depends(get_session),
):
    restaurant = _my_restaurant(session, current)
    if restaurant is None:
        return []

    query = select(Booking).where(Booking.restaurant_id == restaurant.id)
    if status_filter in BOOKING_STATUSES:
        query = query.where(Booking.status == status_filter)
    query = query.order_by(col(Booking.date).desc(), col(Booking.time).desc())

    return [
        booking_public(b, restaurant=restaurant, user=session.get(User, b.user_id))
        for b in session.exec(query).all()
    ]


@router.patch("/bookings/{booking_id}/status")
def set_booking_status(
    booking_id: int,
    body: BookingStatusUpdate,
    current: User = Depends(require_owner),
    session: Session = Depends(get_session),
):
    """Mark a reservation completed (guest dined) or cancelled."""
    if body.status not in BOOKING_STATUSES:
        raise HTTPException(status_code=422, detail="Status must be confirmed, completed or cancelled.")

    booking = session.get(Booking, booking_id)
    restaurant = _my_restaurant(session, current)
    if booking is None or restaurant is None or booking.restaurant_id != restaurant.id:
        raise HTTPException(status_code=404, detail="Reservation not found.")

    booking.status = body.status
    booking.updated_at = utcnow()
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking_public(booking, restaurant=restaurant, user=session.get(User, booking.user_id))


@router.get("/stats")
def owner_stats(current: User = Depends(require_owner), session: Session = Depends(get_session)):
    """Headline numbers for the owner dashboard."""
    restaurant = _my_restaurant(session, current)
    if restaurant is None:
        return {"bookings": {"total": 0, "confirmed": 0, "completed": 0, "cancelled": 0}, "covers": 0}

    def count(status_value: str) -> int:
        total = session.exec(
            select(func.count(Booking.id)).where(
                Booking.restaurant_id == restaurant.id, Booking.status == status_value
            )
        ).one()
        return int(total or 0)

    covers = session.exec(
        select(func.coalesce(func.sum(Booking.guests), 0)).where(
            Booking.restaurant_id == restaurant.id, Booking.status != "cancelled"
        )
    ).one()

    confirmed, completed, cancelled = count("confirmed"), count("completed"), count("cancelled")
    return {
        "bookings": {
            "total": confirmed + completed + cancelled,
            "confirmed": confirmed,
            "completed": completed,
            "cancelled": cancelled,
        },
        "covers": int(covers or 0),
        "totalSeats": restaurant.total_seats,
        "rating": round(restaurant.rating, 1),
        "reviewCount": restaurant.review_count,
    }
