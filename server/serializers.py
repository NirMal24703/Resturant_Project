"""Turns table rows into the exact JSON shapes the React client expects.

The UI was written against a Mongo-style API, so it reads `_id`, camelCase
keys and nested `restaurant` / `user` / `owner` objects. Rather than rewrite
every component, the API speaks that dialect and this module is the single
place where the translation happens.
"""

import os
from datetime import datetime, timezone
from typing import Optional

from models import Booking, Restaurant, Review, User

# Used to turn a stored upload path into an absolute URL, because the client
# runs on a different origin (5173) than the API (8000).
PUBLIC_URL = os.getenv("PUBLIC_URL", "http://localhost:8000").rstrip("/")


def _iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _date_iso(value: str) -> str:
    """Expand a stored YYYY-MM-DD into an ISO timestamp at midday UTC.

    The client does `new Date(booking.date)`. A bare date string parses as
    UTC midnight, which reads as the *previous* day for anyone west of
    Greenwich and makes today's bookings look like history. Anchoring at
    12:00Z keeps the calendar day intact across effectively every timezone.
    """
    if not value:
        return value
    return f"{value}T12:00:00.000Z" if len(value) == 10 else value


def image_url(stored: str) -> str:
    """Uploads need the API origin; seeded `/restaurant_1.png` files ship
    with the client's own /public folder and are already correct."""
    if not stored:
        return ""
    if stored.startswith("http://") or stored.startswith("https://"):
        return stored
    if stored.startswith("/uploads/"):
        return f"{PUBLIC_URL}{stored}"
    return stored


def _split(value: str) -> list[str]:
    return [part.strip() for part in (value or "").split(",") if part.strip()]


# ── Users ───────────────────────────────────────────────────────────────────


def user_public(user: User) -> dict:
    """A user as the owning account sees themself. Never includes the hash."""
    return {
        "_id": str(user.id),
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "createdAt": _iso(user.created_at),
        "updatedAt": _iso(user.updated_at),
    }


def user_brief(user: Optional[User]) -> Optional[dict]:
    """The trimmed version embedded in bookings and restaurant records."""
    if user is None:
        return None
    return {
        "_id": str(user.id),
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
    }


# ── Restaurants ─────────────────────────────────────────────────────────────


def restaurant_public(restaurant: Restaurant, owner: Optional[User] = None) -> dict:
    return {
        "_id": str(restaurant.id),
        "name": restaurant.name,
        "slug": restaurant.slug,
        "description": restaurant.description,
        "cuisine": restaurant.cuisine,
        "priceRange": restaurant.price_range,
        "rating": round(restaurant.rating, 1),
        "reviewCount": restaurant.review_count,
        "location": restaurant.location,
        "address": restaurant.address,
        "image": image_url(restaurant.image),
        "chef": restaurant.chef,
        "tags": _split(restaurant.tags),
        "availableSlots": _split(restaurant.available_slots),
        "featured": restaurant.featured,
        "exclusive": restaurant.exclusive,
        "totalSeats": restaurant.total_seats,
        "status": restaurant.status,
        "owner": user_brief(owner),
        "createdAt": _iso(restaurant.created_at),
        "updatedAt": _iso(restaurant.updated_at),
    }


def restaurant_brief(restaurant: Optional[Restaurant]) -> Optional[dict]:
    """Embedded inside a booking, for the cards on the diner dashboard."""
    if restaurant is None:
        return None
    return {
        "_id": str(restaurant.id),
        "name": restaurant.name,
        "slug": restaurant.slug,
        "cuisine": restaurant.cuisine,
        "location": restaurant.location,
        "address": restaurant.address,
        "image": image_url(restaurant.image),
    }


# ── Bookings & reviews ──────────────────────────────────────────────────────


def booking_public(
    booking: Booking,
    restaurant: Optional[Restaurant] = None,
    user: Optional[User] = None,
) -> dict:
    return {
        "_id": str(booking.id),
        "bookingId": booking.booking_id,
        "user": user_brief(user),
        "restaurant": restaurant_brief(restaurant),
        "guestName": booking.guest_name,
        "guestEmail": booking.guest_email,
        "guestPhone": booking.guest_phone,
        "date": _date_iso(booking.date),
        "time": booking.time,
        "guests": booking.guests,
        "occasion": booking.occasion,
        "specialRequests": booking.special_requests,
        "status": booking.status,
        "createdAt": _iso(booking.created_at),
        "updatedAt": _iso(booking.updated_at),
    }


def review_public(review: Review, user: Optional[User] = None) -> dict:
    return {
        "_id": str(review.id),
        "userName": user.name if user else "Guest",
        "rating": review.rating,
        "comment": review.comment,
        "visitedDate": _date_iso(review.visited_date) if review.visited_date else _iso(review.created_at),
        "createdAt": _iso(review.created_at),
    }
