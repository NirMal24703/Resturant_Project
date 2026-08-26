"""Database tables and the request shapes the API accepts.

Tables use snake_case columns; everything the client sees is built by
serializers.py, which renames to the camelCase / `_id` shape the React app
already expects. Keeping those two apart means the UI never had to change
its field names, and password hashes can't leak into a response by accident.
"""

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, EmailStr, Field as PydanticField
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Tables ──────────────────────────────────────────────────────────────────


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: str = Field(index=True, unique=True)
    phone: Optional[str] = None
    # "user" (diner), "owner" (restaurant partner) or "admin".
    role: str = Field(default="user", index=True)
    password_hash: str
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Restaurant(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    slug: str = Field(index=True, unique=True)
    description: str = ""
    cuisine: str = Field(default="", index=True)
    price_range: str = Field(default="$$", index=True)
    location: str = Field(default="", index=True)
    address: str = ""
    image: str = ""
    chef: str = ""
    # Stored comma-separated so the schema stays a single flat SQLite table.
    tags: str = ""
    available_slots: str = ""
    featured: bool = Field(default=False)
    exclusive: bool = Field(default=False)
    total_seats: int = Field(default=20)
    # Denormalised review aggregates, recalculated whenever a review lands.
    rating: float = Field(default=0.0)
    review_count: int = Field(default=0)
    # "pending" until an admin approves; only "approved" is publicly listed.
    status: str = Field(default="pending", index=True)
    owner_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Booking(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    # Human-readable reference shown on the confirmation screen, e.g. GR-1A2B3C4D.
    booking_id: str = Field(index=True, unique=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    restaurant_id: int = Field(foreign_key="restaurant.id", index=True)
    # Guest contact details are copied onto the booking: the reservation may
    # be made for someone other than the account holder.
    guest_name: str = ""
    guest_email: str = ""
    guest_phone: str = ""
    date: str = Field(index=True)  # YYYY-MM-DD
    time: str = Field(index=True)  # HH:MM
    guests: int = 2
    occasion: str = ""
    special_requests: str = ""
    # "confirmed" | "completed" | "cancelled"
    status: str = Field(default="confirmed", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Review(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    restaurant_id: int = Field(foreign_key="restaurant.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    rating: int = 5
    comment: str = ""
    visited_date: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


# ── Request bodies ──────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    role: Optional[str] = "user"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class BookingCreate(BaseModel):
    restaurantId: str
    date: str
    time: str
    guests: int = PydanticField(default=2, ge=1, le=50)
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    occasion: Optional[str] = ""
    specialRequests: Optional[str] = ""


class BookingUpdate(BaseModel):
    """Used when a diner reschedules an existing reservation."""

    date: Optional[str] = None
    time: Optional[str] = None
    guests: Optional[int] = PydanticField(default=None, ge=1, le=50)
    occasion: Optional[str] = None
    specialRequests: Optional[str] = None


class BookingStatusUpdate(BaseModel):
    status: str


class ReviewCreate(BaseModel):
    rating: int = PydanticField(ge=1, le=5)
    comment: str = ""
    visitedDate: Optional[str] = None


class RestaurantStatusUpdate(BaseModel):
    status: str
