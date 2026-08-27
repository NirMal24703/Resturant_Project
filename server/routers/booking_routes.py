"""Reservations owned by the signed-in diner: create, view, reschedule, cancel."""

from datetime import date as date_cls

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, select

from auth import get_current_user
from database import get_session
from helpers import new_booking_reference, parse_date, seats_taken
from models import Booking, BookingCreate, BookingUpdate, Restaurant, User, utcnow
from serializers import booking_public

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


def _slot_list(restaurant: Restaurant) -> list[str]:
    return [s.strip() for s in (restaurant.available_slots or "").split(",") if s.strip()]


def _owned_or_404(session: Session, booking_id: int, current: User) -> Booking:
    booking = session.get(Booking, booking_id)
    # 404 rather than 403: don't confirm that someone else's booking exists.
    if booking is None or booking.user_id != current.id:
        raise HTTPException(status_code=404, detail="Reservation not found.")
    return booking


def _with_relations(session: Session, booking: Booking) -> dict:
    return booking_public(
        booking,
        restaurant=session.get(Restaurant, booking.restaurant_id),
        user=session.get(User, booking.user_id),
    )


def _assert_capacity(
    session: Session,
    restaurant: Restaurant,
    day: str,
    time: str,
    guests: int,
    exclude_booking_id: int | None = None,
) -> None:
    """Refuse the booking if the slot can't seat the party."""
    if time not in _slot_list(restaurant):
        raise HTTPException(status_code=422, detail="That dining time isn't offered by this restaurant.")

    if parse_date(day) < date_cls.today():
        raise HTTPException(status_code=422, detail="You can't book a table in the past.")

    taken = seats_taken(session, restaurant.id, day, time)
    if exclude_booking_id is not None:
        existing = session.get(Booking, exclude_booking_id)
        # Rescheduling within the same slot shouldn't compete with itself.
        if existing and existing.status != "cancelled" and existing.date == day and existing.time == time:
            taken -= existing.guests

    remaining = restaurant.total_seats - taken
    if guests > remaining:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Only {max(remaining, 0)} seat(s) left at {time}. "
                "Please pick another time or reduce the party size."
            ),
        )


@router.get("")
def my_bookings(current: User = Depends(get_current_user), session: Session = Depends(get_session)):
    bookings = session.exec(
        select(Booking)
        .where(Booking.user_id == current.id)
        .order_by(col(Booking.date).desc(), col(Booking.time).desc())
    ).all()
    return [_with_relations(session, b) for b in bookings]


@router.get("/{booking_id}")
def get_booking(
    booking_id: int,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return _with_relations(session, _owned_or_404(session, booking_id, current))


@router.post("", status_code=status.HTTP_201_CREATED)
def create_booking(
    body: BookingCreate,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    try:
        restaurant_id = int(body.restaurantId)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Invalid restaurant reference.")

    restaurant = session.get(Restaurant, restaurant_id)
    if restaurant is None or restaurant.status != "approved":
        raise HTTPException(status_code=404, detail="That restaurant isn't accepting reservations.")

    day = parse_date(body.date).isoformat()
    _assert_capacity(session, restaurant, day, body.time, body.guests)

    booking = Booking(
        booking_id=new_booking_reference(session),
        user_id=current.id,
        restaurant_id=restaurant.id,
        guest_name=(body.name or current.name).strip(),
        guest_email=(body.email or current.email).strip(),
        guest_phone=(body.phone or current.phone or "").strip(),
        date=day,
        time=body.time,
        guests=body.guests,
        occasion=(body.occasion or "").strip(),
        special_requests=(body.specialRequests or "").strip(),
    )
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return _with_relations(session, booking)


@router.put("/{booking_id}")
def update_booking(
    booking_id: int,
    body: BookingUpdate,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Reschedule: change date, time, party size or notes."""
    booking = _owned_or_404(session, booking_id, current)
    if booking.status != "confirmed":
        raise HTTPException(status_code=409, detail="Only confirmed reservations can be changed.")

    restaurant = session.get(Restaurant, booking.restaurant_id)
    if restaurant is None:
        raise HTTPException(status_code=404, detail="That restaurant is no longer listed.")

    day = parse_date(body.date).isoformat() if body.date else booking.date
    time = body.time or booking.time
    guests = body.guests or booking.guests

    if (day, time, guests) != (booking.date, booking.time, booking.guests):
        _assert_capacity(session, restaurant, day, time, guests, exclude_booking_id=booking.id)

    booking.date = day
    booking.time = time
    booking.guests = guests
    if body.occasion is not None:
        booking.occasion = body.occasion.strip()
    if body.specialRequests is not None:
        booking.special_requests = body.specialRequests.strip()
    booking.updated_at = utcnow()

    session.add(booking)
    session.commit()
    session.refresh(booking)
    return _with_relations(session, booking)


@router.patch("/{booking_id}/cancel")
def cancel_booking(
    booking_id: int,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Soft-cancel: the row stays so it still shows under dining history."""
    booking = _owned_or_404(session, booking_id, current)
    if booking.status == "cancelled":
        raise HTTPException(status_code=409, detail="That reservation is already cancelled.")
    if booking.status == "completed":
        raise HTTPException(status_code=409, detail="A completed visit can't be cancelled.")

    booking.status = "cancelled"
    booking.updated_at = utcnow()
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return _with_relations(session, booking)


@router.delete("/{booking_id}")
def delete_booking(
    booking_id: int,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Hard delete, for clearing a record out of dining history entirely."""
    booking = _owned_or_404(session, booking_id, current)
    session.delete(booking)
    session.commit()
    return {"message": "Reservation deleted."}
