"""Seeds demo accounts, the six launch venues, reviews and sample bookings.

Runs automatically on startup and is idempotent: it does nothing at all once
a user table exists, so restarting the API never duplicates or resets data.
Force a rebuild with `python seed.py --reset`.
"""

import sys
from datetime import date, timedelta

from sqlmodel import Session, func, select

from auth import hash_password
from database import engine, init_db
from helpers import new_booking_reference, slugify
from models import Booking, Restaurant, Review, User

# Demo logins printed in RUNNING.md. Change these before deploying anywhere.
ACCOUNTS = [
    {"name": "Platform Admin", "email": "admin@quickdine.com", "password": "admin1234", "role": "admin", "phone": "+1 212 000 0000"},
    {"name": "Marc Dubois", "email": "owner@quickdine.com", "password": "owner1234", "role": "owner", "phone": "+1 212 555 0142"},
    {"name": "Elena Rossi", "email": "elena@quickdine.com", "password": "owner1234", "role": "owner", "phone": "+1 212 555 0177"},
    {"name": "Alex Mercer", "email": "diner@quickdine.com", "password": "diner1234", "role": "user", "phone": "+1 917 555 0198"},
    {"name": "Emily Watson", "email": "emily@quickdine.com", "password": "diner1234", "role": "user", "phone": "+1 917 555 0110"},
]

RESTAURANTS = [
    {
        "name": "L'Essence",
        "description": "An intimate, Parisian-inspired fine dining chamber wrapped in dark velvet and soft golden candle glow. L'Essence specializes in meticulous plating of haute gastronomy, creating a rich sensory dialogue between modern culinary innovation and classic romance.",
        "cuisine": "French",
        "price_range": "$$$$",
        "location": "Manhattan, NY",
        "address": "115 Greenwich St, New York, NY 10006",
        "image": "/restaurant_5.png",
        "chef": "Jean-Luc Picard",
        "tags": "Romantic,Velvet Booths,Candlelit,Haute Cuisine",
        "available_slots": "18:00,19:00,20:00,21:00,22:00",
        "featured": True,
        "exclusive": False,
        "total_seats": 45,
        "owner_email": "owner@quickdine.com",
        "status": "approved",
    },
    {
        "name": "Terraza Cielo",
        "description": "A sun-drenched rooftop oasis celebrating Italian and Mediterranean lifestyles. Featuring floor-to-ceiling foliage, white marble bistro tables, and panoramic skyline views, Terraza Cielo serves hand-crafted pastas and coastal seafood paired with bright botanical cocktails.",
        "cuisine": "Italian",
        "price_range": "$$$",
        "location": "Manhattan, NY",
        "address": "244 Fifth Ave Rooftop, New York, NY 10001",
        "image": "/restaurant_3.jpg",
        "chef": "Elena Rossi",
        "tags": "Rooftop,Skyline Views,Handmade Pasta,Craft Cocktails",
        "available_slots": "12:00,13:00,17:00,18:00,19:00,20:00,21:00",
        "featured": True,
        "exclusive": False,
        "total_seats": 30,
        "owner_email": "elena@quickdine.com",
        "status": "approved",
    },
    {
        "name": "Kuro Omakase",
        "description": "An atmospheric, moody sanctuary of premium Japanese gastronomy. Seated at a dark, polished basalt-stone counter, guests experience a deeply focused sushi omakase. Chef Kenji Sato translates the freshest seasonal ingredients directly from Tokyo's fish markets into elegant, edible poetry.",
        "cuisine": "Japanese",
        "price_range": "$$$$",
        "location": "Manhattan, NY",
        "address": "18 Orchard St, New York, NY 10002",
        "image": "/restaurant_2.jpg",
        "chef": "Kenji Sato",
        "tags": "Omakase,Basalt Counter,Japanese,Zen Atmosphere",
        "available_slots": "18:00,20:30",
        "featured": True,
        "exclusive": True,
        "total_seats": 25,
        "owner_email": None,
        "status": "approved",
    },
    {
        "name": "Flora Garden",
        "description": "A bright, airy conservatory celebrating organic, plant-forward gastronomy. Nestled under glass ceilings with floor-to-ceiling botanicals, Flora Garden transforms fresh seasonal crops into delicate, high-end editorial culinary works of art.",
        "cuisine": "Vegetarian",
        "price_range": "$$$",
        "location": "Manhattan, NY",
        "address": "90 Grand St, New York, NY 10013",
        "image": "/restaurant_6.png",
        "chef": "Chloe Mercer",
        "tags": "Plant-Based,Glasshouse,Organic,Bright & Airy",
        "available_slots": "11:30,13:00,14:30,17:30,19:00,20:30",
        "featured": False,
        "exclusive": False,
        "total_seats": 40,
        "owner_email": None,
        "status": "approved",
    },
    {
        "name": "Ember Grille",
        "description": "An upscale modern steakhouse with exposed brick walls, leather booths, and warm, industrial-chic pendant lighting. Offering Prime dry-aged cuts grilled over live hickory and cherrywood embers. Gourmet dining elevated into a sophisticated nocturnal experience.",
        "cuisine": "Steakhouse",
        "price_range": "$$$$",
        "location": "Manhattan, NY",
        "address": "320 Bowery, New York, NY 10012",
        "image": "/restaurant_1.png",
        "chef": "Marcus Vance",
        "tags": "Dry-Aged Beef,Wood Fire,Moody Lighting,Wine Room",
        "available_slots": "17:00,18:00,19:00,20:00,21:00,22:00",
        "featured": False,
        "exclusive": False,
        "total_seats": 35,
        "owner_email": None,
        "status": "approved",
    },
    {
        "name": "L'Artiste",
        "description": "An avant-garde journey through modern French gastronomy. L'Artiste blends classic French culinary foundations with contemporary visual artistry, resulting in a sensory dining experience that is both theatrical and deeply satisfying. Set in a gorgeous high-ceilinged room with minimal charcoal and gold design language.",
        "cuisine": "French",
        "price_range": "$$$$",
        "location": "Manhattan, NY",
        "address": "420 Mercer St, New York, NY 10003",
        "image": "/restaurant_4.png",
        "chef": "Jean-Pierre Dubois",
        "tags": "Michelin Star,Fine Dining,Tasting Menu,Romantic",
        "available_slots": "17:00,17:30,18:00,18:30,19:00,19:30,20:00,20:30,21:00,21:30",
        "featured": True,
        "exclusive": True,
        "total_seats": 20,
        "owner_email": None,
        "status": "approved",
    },
    {
        # Left pending on purpose so the admin approvals queue isn't empty
        # the first time you sign in as admin.
        "name": "Casa Verde",
        "description": "A candlelit Mediterranean courtyard serving mezze, charcoal-grilled seafood and natural wines beneath a canopy of olive trees and hanging lanterns.",
        "cuisine": "Italian",
        "price_range": "$$",
        "location": "Brooklyn, NY",
        "address": "77 Wythe Ave, Brooklyn, NY 11249",
        "image": "/restaurant_7.png",
        "chef": "Sofia Marchetti",
        "tags": "Courtyard,Mezze,Natural Wine",
        "available_slots": "17:30,18:30,19:30,20:30",
        "featured": False,
        "exclusive": False,
        "total_seats": 28,
        "owner_email": "elena@quickdine.com",
        "status": "pending",
    },
]

REVIEWS = [
    ("l-essence", "emily@quickdine.com", 5, "Absolutely phenomenal experience. The ambiance was perfect and every course arrived cooked precisely as promised."),
    ("l-essence", "diner@quickdine.com", 5, "Every course of the tasting menu was a delightful surprise, and the pairings were exquisite. High-end dining at its finest."),
    ("terraza-cielo", "emily@quickdine.com", 4, "The signature pastas were incredible and the staff extremely attentive. The skyline at sunset is worth the booking alone."),
]


def _reference_day(offset: int) -> str:
    return (date.today() + timedelta(days=offset)).isoformat()


def seed(reset: bool = False) -> None:
    if reset:
        from sqlmodel import SQLModel

        SQLModel.metadata.drop_all(engine)

    init_db()

    with Session(engine) as session:
        existing = session.exec(select(func.count(User.id))).one()
        if int(existing or 0) > 0 and not reset:
            return  # Already seeded — leave real data alone.

        users: dict[str, User] = {}
        for spec in ACCOUNTS:
            user = User(
                name=spec["name"],
                email=spec["email"],
                phone=spec["phone"],
                role=spec["role"],
                password_hash=hash_password(spec["password"]),
            )
            session.add(user)
            users[spec["email"]] = user
        session.commit()

        venues: dict[str, Restaurant] = {}
        for spec in RESTAURANTS:
            owner_email = spec.pop("owner_email")
            restaurant = Restaurant(
                **spec,
                slug=slugify(spec["name"]),
                owner_id=users[owner_email].id if owner_email else None,
            )
            session.add(restaurant)
            venues[restaurant.slug] = restaurant
        session.commit()

        for slug, email, rating, comment in REVIEWS:
            session.add(
                Review(
                    restaurant_id=venues[slug].id,
                    user_id=users[email].id,
                    rating=rating,
                    comment=comment,
                    visited_date=_reference_day(-14),
                )
            )
        session.commit()

        # Refresh the denormalised rating columns from the reviews just added.
        for restaurant in venues.values():
            average, count = session.exec(
                select(func.avg(Review.rating), func.count(Review.id)).where(
                    Review.restaurant_id == restaurant.id
                )
            ).one()
            restaurant.rating = float(average or 0.0)
            restaurant.review_count = int(count or 0)
            session.add(restaurant)
        session.commit()

        sample_bookings = [
            ("l-essence", "diner@quickdine.com", _reference_day(3), "20:00", 2, "Anniversary", "Quiet corner table if possible."),
            ("terraza-cielo", "diner@quickdine.com", _reference_day(6), "19:00", 4, "", "One guest is gluten intolerant."),
            ("l-essence", "emily@quickdine.com", _reference_day(-10), "21:00", 2, "Birthday", ""),
        ]
        for slug, email, day, time, guests, occasion, notes in sample_bookings:
            diner = users[email]
            session.add(
                Booking(
                    booking_id=new_booking_reference(session),
                    user_id=diner.id,
                    restaurant_id=venues[slug].id,
                    guest_name=diner.name,
                    guest_email=diner.email,
                    guest_phone=diner.phone or "",
                    date=day,
                    time=time,
                    guests=guests,
                    occasion=occasion,
                    special_requests=notes,
                    status="completed" if day < date.today().isoformat() else "confirmed",
                )
            )
        session.commit()

    print("Seeded demo accounts, restaurants, reviews and bookings.")


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)
