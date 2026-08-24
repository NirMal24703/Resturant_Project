from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, EmailStr


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: str = Field(index=True, unique=True)
    phone: Optional[str] = None
    role: str = Field(default="user")
    password_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Booking(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    date: str
    time: str
    guests: int
    # Which restaurant this is for. The client joins this back to the
    # restaurant catalogue for images, cuisine and address.
    restaurant_slug: Optional[str] = None
    status: str = Field(default="confirmed")
    # Every booking belongs to the signed-in user who made it.
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)


# ── Request / response shapes ───────────────────────────────────────────────
# Kept separate from the table models so a password hash can never be
# serialised out, and so clients can't set user_id or role themselves.

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    role: Optional[str] = "user"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: int
    name: str
    email: str
    phone: Optional[str] = None
    role: str


class AuthResponse(BaseModel):
    token: str
    user: UserPublic


class BookingCreate(BaseModel):
    name: str
    date: str
    time: str
    guests: int
    restaurant_slug: Optional[str] = None
