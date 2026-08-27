"""Public catalogue: browse, filter, view, check availability, read/write reviews."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, col, func, select

from auth import get_current_user
from database import get_session
from helpers import availability_for, parse_date
from models import Booking, Restaurant, Review, ReviewCreate, User, utcnow
from serializers import restaurant_public, review_public

router = APIRouter(prefix="/api/restaurants", tags=["restaurants"])


def _load_owner(session: Session, restaurant: Restaurant) -> Optional[User]:
    return session.get(User, restaurant.owner_id) if restaurant.owner_id else None


def _get_approved_or_404(session: Session, slug: str) -> Restaurant:
    restaurant = session.exec(select(Restaurant).where(Restaurant.slug == slug)).first()
    if restaurant is None or restaurant.status != "approved":
        raise HTTPException(status_code=404, detail="That restaurant isn't available.")
    return restaurant


@router.get("")
def list_restaurants(
    session: Session = Depends(get_session),
    search: Optional[str] = None,
    location: Optional[str] = None,
    cuisine: list[str] = Query(default=[]),
    priceRange: list[str] = Query(default=[]),
    sort: Optional[str] = None,
    featured: Optional[bool] = None,
    limit: int = Query(default=60, ge=1, le=200),
):
    """Backs the Search page. Only approved venues are ever listed."""
    query = select(Restaurant).where(Restaurant.status == "approved")

    if search:
        term = f"%{search.strip().lower()}%"
        query = query.where(
            func.lower(Restaurant.name).like(term)
            | func.lower(Restaurant.cuisine).like(term)
            | func.lower(Restaurant.tags).like(term)
            | func.lower(Restaurant.description).like(term)
        )

    if location:
        query = query.where(func.lower(Restaurant.location).like(f"%{location.strip().lower()}%"))

    if cuisine:
        query = query.where(col(Restaurant.cuisine).in_(cuisine))

    if priceRange:
        query = query.where(col(Restaurant.price_range).in_(priceRange))

    if featured is not None:
        query = query.where(Restaurant.featured == featured)

    results = list(session.exec(query).all())

    # Price tiers are "$".."$$$$", so string length is the rank.
    if sort == "price_low":
        results.sort(key=lambda r: (len(r.price_range), r.name))
    elif sort == "price_high":
        results.sort(key=lambda r: (-len(r.price_range), r.name))
    elif sort == "rating":
        results.sort(key=lambda r: -r.rating)
    else:
        results.sort(key=lambda r: r.created_at, reverse=True)

    return [restaurant_public(r) for r in results[:limit]]


@router.get("/featured")
def featured_restaurants(session: Session = Depends(get_session), limit: int = Query(default=6, ge=1, le=24)):
    """Backs the trending row on the home page and dashboard recommendations."""
    query = (
        select(Restaurant)
        .where(Restaurant.status == "approved")
        .order_by(col(Restaurant.featured).desc(), col(Restaurant.rating).desc())
        .limit(limit)
    )
    return [restaurant_public(r) for r in session.exec(query).all()]


@router.get("/{slug}")
def get_restaurant(slug: str, session: Session = Depends(get_session)):
    restaurant = _get_approved_or_404(session, slug)
    return restaurant_public(restaurant, owner=_load_owner(session, restaurant))


@router.get("/{slug}/availability")
def get_availability(
    slug: str,
    date: Optional[str] = None,
    session: Session = Depends(get_session),
):
    """Remaining seats per slot for a given day."""
    restaurant = _get_approved_or_404(session, slug)
    day = parse_date(date).isoformat() if date else None

    if day is None:
        # No date picked yet: show the full slot list at full capacity.
        return [
            {
                "time": slot,
                "availableSeats": restaurant.total_seats,
                "totalSeats": restaurant.total_seats,
                "isAvailable": True,
            }
            for slot in sorted(s.strip() for s in restaurant.available_slots.split(",") if s.strip())
        ]

    return availability_for(session, restaurant, day)


# ── Reviews ─────────────────────────────────────────────────────────────────


@router.get("/{slug}/reviews")
def list_reviews(slug: str, session: Session = Depends(get_session)):
    restaurant = _get_approved_or_404(session, slug)
    reviews = session.exec(
        select(Review)
        .where(Review.restaurant_id == restaurant.id)
        .order_by(col(Review.created_at).desc())
    ).all()
    return [review_public(r, session.get(User, r.user_id)) for r in reviews]


@router.post("/{slug}/reviews", status_code=status.HTTP_201_CREATED)
def create_review(
    slug: str,
    body: ReviewCreate,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Only diners who actually completed a booking here may review."""
    restaurant = _get_approved_or_404(session, slug)

    has_visited = session.exec(
        select(Booking).where(
            Booking.restaurant_id == restaurant.id,
            Booking.user_id == current.id,
            col(Booking.status).in_(["completed", "confirmed"]),
        )
    ).first()
    if has_visited is None:
        raise HTTPException(
            status_code=403,
            detail="You can only review a restaurant you've booked with.",
        )

    already = session.exec(
        select(Review).where(Review.restaurant_id == restaurant.id, Review.user_id == current.id)
    ).first()
    if already is not None:
        raise HTTPException(status_code=409, detail="You've already reviewed this restaurant.")

    review = Review(
        restaurant_id=restaurant.id,
        user_id=current.id,
        rating=body.rating,
        comment=body.comment.strip(),
        visited_date=body.visitedDate,
    )
    session.add(review)
    session.commit()
    session.refresh(review)

    _recalculate_rating(session, restaurant)
    return review_public(review, current)


def _recalculate_rating(session: Session, restaurant: Restaurant) -> None:
    """Keep the denormalised rating/review_count columns in step."""
    average, count = session.exec(
        select(func.avg(Review.rating), func.count(Review.id)).where(Review.restaurant_id == restaurant.id)
    ).one()
    restaurant.rating = float(average or 0.0)
    restaurant.review_count = int(count or 0)
    restaurant.updated_at = utcnow()
    session.add(restaurant)
    session.commit()
