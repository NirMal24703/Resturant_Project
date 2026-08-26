"""Admin console: approve partners, audit listings, read platform metrics."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, func, select

from auth import require_admin
from database import get_session
from models import Booking, Restaurant, RestaurantStatusUpdate, Review, User, utcnow
from serializers import booking_public, restaurant_public, user_public

router = APIRouter(prefix="/api/admin", tags=["admin"])

RESTAURANT_STATUSES = {"pending", "approved", "rejected"}


@router.get("/restaurants")
def list_all_restaurants(
    status_filter: Optional[str] = None,
    _: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Every venue in every state — the approvals queue reads from this."""
    query = select(Restaurant)
    if status_filter in RESTAURANT_STATUSES:
        query = query.where(Restaurant.status == status_filter)
    query = query.order_by(col(Restaurant.created_at).desc())

    return [
        restaurant_public(r, owner=session.get(User, r.owner_id) if r.owner_id else None)
        for r in session.exec(query).all()
    ]


@router.patch("/restaurants/{restaurant_id}/status")
def set_restaurant_status(
    restaurant_id: int,
    body: RestaurantStatusUpdate,
    _: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Approve, reject or suspend a listing. Only approved venues are public."""
    if body.status not in RESTAURANT_STATUSES:
        raise HTTPException(status_code=422, detail="Status must be pending, approved or rejected.")

    restaurant = session.get(Restaurant, restaurant_id)
    if restaurant is None:
        raise HTTPException(status_code=404, detail="Restaurant not found.")

    restaurant.status = body.status
    restaurant.updated_at = utcnow()
    session.add(restaurant)
    session.commit()
    session.refresh(restaurant)

    owner = session.get(User, restaurant.owner_id) if restaurant.owner_id else None
    return restaurant_public(restaurant, owner=owner)


@router.delete("/restaurants/{restaurant_id}")
def delete_restaurant(
    restaurant_id: int,
    _: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    restaurant = session.get(Restaurant, restaurant_id)
    if restaurant is None:
        raise HTTPException(status_code=404, detail="Restaurant not found.")

    session.delete(restaurant)
    session.commit()
    return {"message": "Restaurant removed."}


@router.get("/users")
def list_users(_: User = Depends(require_admin), session: Session = Depends(get_session)):
    users = session.exec(select(User).order_by(col(User.created_at).desc())).all()
    return [user_public(u) for u in users]


@router.patch("/users/{user_id}/role")
def set_user_role(
    user_id: int,
    body: dict,
    current: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    role = body.get("role")
    if role not in {"user", "owner", "admin"}:
        raise HTTPException(status_code=422, detail="Role must be user, owner or admin.")

    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found.")
    if user.id == current.id:
        raise HTTPException(status_code=409, detail="You can't change your own role.")

    user.role = role
    user.updated_at = utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user_public(user)


@router.get("/stats")
def platform_stats(_: User = Depends(require_admin), session: Session = Depends(get_session)):
    """Feeds the KPI cards and the recent-activity table."""

    def count(model, *conditions) -> int:
        query = select(func.count(model.id))
        for condition in conditions:
            query = query.where(condition)
        return int(session.exec(query).one() or 0)

    total_users = count(User, User.role == "user")
    total_owners = count(User, User.role == "owner")
    total_admins = count(User, User.role == "admin")

    latest = session.exec(
        select(Booking).order_by(col(Booking.created_at).desc()).limit(8)
    ).all()

    return {
        "users": {
            "totalUsers": total_users,
            "totalOwners": total_owners,
            "totalAdmins": total_admins,
            "total": total_users + total_owners + total_admins,
        },
        "restaurants": {
            "total": count(Restaurant),
            "approved": count(Restaurant, Restaurant.status == "approved"),
            "pending": count(Restaurant, Restaurant.status == "pending"),
            "rejected": count(Restaurant, Restaurant.status == "rejected"),
        },
        "bookings": {
            "total": count(Booking),
            "confirmed": count(Booking, Booking.status == "confirmed"),
            "completed": count(Booking, Booking.status == "completed"),
            "cancelled": count(Booking, Booking.status == "cancelled"),
        },
        "reviews": {"total": count(Review)},
        "latestBookings": [
            booking_public(
                b,
                restaurant=session.get(Restaurant, b.restaurant_id),
                user=session.get(User, b.user_id),
            )
            for b in latest
        ],
    }
