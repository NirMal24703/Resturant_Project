from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from typing import List

from database import init_db, get_session
from models import (
    Booking, BookingCreate, User,
    RegisterRequest, LoginRequest, AuthResponse, UserPublic,
)
from auth import (
    hash_password, verify_password, create_token,
    get_current_user, get_user_by_email,
)

app = FastAPI(title="QuickDine API")

# Vite may land on 5173, 5174, 5175... if a port is taken, and the browser
# treats localhost and 127.0.0.1 as different origins. Match all of them.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):(517\d|3000)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/api/health")
def health():
    """Quick check that the API is up: open http://localhost:8000/api/health"""
    return {"status": "ok"}


# ════════════════════════════════════════════════════════════════════════════
# Auth
# ════════════════════════════════════════════════════════════════════════════

@app.post("/api/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, session: Session = Depends(get_session)):
    if get_user_by_email(session, body.email):
        raise HTTPException(status_code=409, detail="That email is already registered. Try signing in.")

    if len(body.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")

    user = User(
        name=body.name.strip(),
        email=body.email.lower().strip(),
        phone=body.phone,
        # Only 'user' and 'owner' can be self-assigned; admin is granted manually.
        role=body.role if body.role in ("user", "owner") else "user",
        password_hash=hash_password(body.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    return AuthResponse(token=create_token(user.id), user=UserPublic(**user.model_dump()))


@app.post("/api/auth/login", response_model=AuthResponse)
def login(body: LoginRequest, session: Session = Depends(get_session)):
    user = get_user_by_email(session, body.email)

    # Same message either way, so this can't be used to discover which
    # emails have accounts.
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    return AuthResponse(token=create_token(user.id), user=UserPublic(**user.model_dump()))


@app.get("/api/auth/me", response_model=UserPublic)
def me(current: User = Depends(get_current_user)):
    """Used on page load to restore the session from a stored token."""
    return UserPublic(**current.model_dump())


# ════════════════════════════════════════════════════════════════════════════
# Bookings — scoped to the signed-in user
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/bookings", response_model=List[Booking])
def get_bookings(current: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return session.exec(select(Booking).where(Booking.user_id == current.id)).all()


@app.get("/api/bookings/{booking_id}", response_model=Booking)
def get_booking(booking_id: int, current: User = Depends(get_current_user), session: Session = Depends(get_session)):
    booking = session.get(Booking, booking_id)
    if not booking or booking.user_id != current.id:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


@app.post("/api/bookings", response_model=Booking, status_code=status.HTTP_201_CREATED)
def create_booking(body: BookingCreate, current: User = Depends(get_current_user), session: Session = Depends(get_session)):
    booking = Booking(**body.model_dump(), user_id=current.id)
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking


@app.put("/api/bookings/{booking_id}", response_model=Booking)
def update_booking(booking_id: int, body: BookingCreate, current: User = Depends(get_current_user), session: Session = Depends(get_session)):
    booking = session.get(Booking, booking_id)
    if not booking or booking.user_id != current.id:
        raise HTTPException(status_code=404, detail="Booking not found")

    booking.name = body.name
    booking.date = body.date
    booking.time = body.time
    booking.guests = body.guests
    booking.restaurant_slug = body.restaurant_slug
    session.commit()
    session.refresh(booking)
    return booking


@app.patch("/api/bookings/{booking_id}/cancel", response_model=Booking)
def cancel_booking(booking_id: int, current: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Soft-cancel: keeps the row so it still shows under past reservations."""
    booking = session.get(Booking, booking_id)
    if not booking or booking.user_id != current.id:
        raise HTTPException(status_code=404, detail="Booking not found")

    booking.status = "cancelled"
    session.commit()
    session.refresh(booking)
    return booking


@app.delete("/api/bookings/{booking_id}")
def delete_booking(booking_id: int, current: User = Depends(get_current_user), session: Session = Depends(get_session)):
    booking = session.get(Booking, booking_id)
    if not booking or booking.user_id != current.id:
        raise HTTPException(status_code=404, detail="Booking not found")

    session.delete(booking)
    session.commit()
    return {"message": "Booking deleted"}
