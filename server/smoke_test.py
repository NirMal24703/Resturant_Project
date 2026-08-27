"""End-to-end check of every API surface, run against a live server.

    python smoke_test.py            # assumes http://localhost:8000
    python smoke_test.py <base_url>

Exits non-zero on the first failure. Safe to run repeatedly: everything it
creates it also cleans up, apart from the extra accounts it registers.
"""

import io
import sys
import urllib.error
import urllib.request
import json
import uuid
from datetime import date, timedelta

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
API = f"{BASE}/api"

passed = 0
failed = 0


def call(method, path, token=None, body=None, multipart=None, expect=200):
    """Returns (status, parsed_json)."""
    url = f"{API}{path}"
    headers = {}
    data = None

    if multipart is not None:
        boundary = uuid.uuid4().hex
        buffer = io.BytesIO()
        for key, value in multipart.items():
            buffer.write(f"--{boundary}\r\n".encode())
            if isinstance(value, tuple):
                filename, content, content_type = value
                buffer.write(
                    f'Content-Disposition: form-data; name="{key}"; filename="{filename}"\r\n'.encode()
                )
                buffer.write(f"Content-Type: {content_type}\r\n\r\n".encode())
                buffer.write(content)
            else:
                buffer.write(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode())
                buffer.write(str(value).encode())
            buffer.write(b"\r\n")
        buffer.write(f"--{boundary}--\r\n".encode())
        data = buffer.getvalue()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"

    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            payload = response.read()
            return response.status, (json.loads(payload) if payload else None)
    except urllib.error.HTTPError as error:
        payload = error.read()
        return error.code, (json.loads(payload) if payload else None)


def check(label, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}  {detail}")


def section(title):
    print(f"\n=== {title}")


def login(email, password):
    status, data = call("POST", "/auth/login", body={"email": email, "password": password})
    assert status == 200, f"login failed for {email}: {data}"
    return data["token"], data["user"]


# ── Health & auth ───────────────────────────────────────────────────────────
section("Health & auth")
status, data = call("GET", "/health")
check("health returns ok", status == 200 and data["status"] == "ok", data)

diner_token, diner = login("diner@quickdine.com", "diner1234")
owner_token, owner = login("owner@quickdine.com", "owner1234")
admin_token, admin = login("admin@quickdine.com", "admin1234")
check("diner role is user", diner["role"] == "user", diner)
check("owner role is owner", owner["role"] == "owner", owner)
check("admin role is admin", admin["role"] == "admin", admin)
check("password hash never serialised", "password_hash" not in json.dumps(diner))

status, data = call("POST", "/auth/login", body={"email": "diner@quickdine.com", "password": "wrong"})
check("wrong password rejected", status == 401, data)

status, data = call("GET", "/auth/me", token=diner_token)
check("me restores session", status == 200 and data["email"] == "diner@quickdine.com", data)

status, data = call("GET", "/auth/me")
check("me requires a token", status == 401, data)

status, data = call("GET", "/auth/me", token="not-a-real-token")
check("garbage token rejected", status == 401, data)

new_email = f"tester_{uuid.uuid4().hex[:8]}@example.com"
status, data = call(
    "POST", "/auth/register",
    body={"name": "Test Diner", "email": new_email, "password": "password123", "phone": "+1 555 0100"},
)
check("register creates account", status == 201 and data["user"]["role"] == "user", data)
new_token = data["token"]

status, data = call(
    "POST", "/auth/register",
    body={"name": "Dup", "email": new_email, "password": "password123"},
)
check("duplicate email rejected", status == 409, data)

status, data = call(
    "POST", "/auth/register",
    body={"name": "Short", "email": f"s_{uuid.uuid4().hex[:6]}@example.com", "password": "abc"},
)
check("short password rejected", status == 422, data)

status, data = call(
    "POST", "/auth/register",
    body={"name": "Sneaky", "email": f"a_{uuid.uuid4().hex[:6]}@example.com", "password": "password123", "role": "admin"},
)
check("self-assigned admin downgraded to user", status == 201 and data["user"]["role"] == "user", data)

status, data = call("PUT", "/auth/me", token=new_token, body={"name": "Renamed Diner", "phone": "+1 555 0199"})
check("profile update works", status == 200 and data["name"] == "Renamed Diner", data)

status, data = call(
    "PUT", "/auth/password", token=new_token,
    body={"current_password": "wrongpass", "new_password": "newpassword123"},
)
check("password change needs current password", status == 401, data)

# ── Public catalogue ────────────────────────────────────────────────────────
section("Public catalogue")
status, all_restaurants = call("GET", "/restaurants")
check("browse returns approved venues", status == 200 and len(all_restaurants) == 6, len(all_restaurants))
check("pending venue hidden from public", all(r["status"] == "approved" for r in all_restaurants))
check("client shape uses _id + camelCase",
      all({"_id", "priceRange", "totalSeats", "availableSlots", "reviewCount"} <= set(r) for r in all_restaurants))
check("tags/slots are arrays", isinstance(all_restaurants[0]["tags"], list) and isinstance(all_restaurants[0]["availableSlots"], list))

status, data = call("GET", "/restaurants?cuisine=French")
check("cuisine filter", status == 200 and {r["cuisine"] for r in data} == {"French"}, data)

status, data = call("GET", "/restaurants?cuisine=French&cuisine=Japanese")
check("multi-cuisine filter", {r["cuisine"] for r in data} == {"French", "Japanese"})

status, data = call("GET", "/restaurants?priceRange=$$$")
check("price filter", {r["priceRange"] for r in data} == {"$$$"})

status, data = call("GET", "/restaurants?search=rooftop")
check("search hits tags/description", any(r["slug"] == "terraza-cielo" for r in data), [r["slug"] for r in data])

status, data = call("GET", "/restaurants?location=Manhattan")
check("location filter", status == 200 and len(data) == 6, len(data))

status, data = call("GET", "/restaurants?sort=price_low")
check("price_low sorts ascending", [len(r["priceRange"]) for r in data] == sorted(len(r["priceRange"]) for r in data))

status, data = call("GET", "/restaurants?sort=price_high")
check("price_high sorts descending", [len(r["priceRange"]) for r in data] == sorted((len(r["priceRange"]) for r in data), reverse=True))

status, data = call("GET", "/restaurants?search=zzzznothing")
check("no matches returns empty list", status == 200 and data == [], data)

status, featured = call("GET", "/restaurants/featured")
check("featured endpoint", status == 200 and len(featured) > 0, featured)

status, essence = call("GET", "/restaurants/l-essence")
check("detail by slug", status == 200 and essence["name"] == "L'Essence", essence)
check("detail embeds owner object", isinstance(essence.get("owner"), dict), essence.get("owner"))

status, data = call("GET", "/restaurants/does-not-exist")
check("unknown slug 404s", status == 404, data)

status, data = call("GET", "/restaurants/casa-verde")
check("pending venue not publicly viewable", status == 404, data)

# ── Availability ────────────────────────────────────────────────────────────
section("Availability")
tomorrow = (date.today() + timedelta(days=1)).isoformat()
status, slots = call("GET", f"/restaurants/l-essence/availability?date={tomorrow}")
check("availability shape", status == 200 and {"time", "availableSeats", "isAvailable"} <= set(slots[0]), slots[:1])
check("availability lists every slot", len(slots) == len(essence["availableSlots"]), slots)

status, slots_nodate = call("GET", "/restaurants/l-essence/availability")
check("availability without a date defaults to full capacity",
      status == 200 and all(s["availableSeats"] == essence["totalSeats"] for s in slots_nodate))

status, data = call("GET", "/restaurants/l-essence/availability?date=not-a-date")
check("bad date rejected", status == 422, data)

# ── Bookings ────────────────────────────────────────────────────────────────
section("Bookings (diner)")
status, data = call("POST", "/bookings", body={"restaurantId": essence["_id"], "date": tomorrow, "time": "20:00", "guests": 2})
check("booking requires auth", status == 401, data)

status, booking = call(
    "POST", "/bookings", token=diner_token,
    body={
        "restaurantId": essence["_id"], "date": tomorrow, "time": "20:00", "guests": 2,
        "occasion": "Anniversary", "specialRequests": "Window table",
    },
)
check("create booking", status == 201 and booking["status"] == "confirmed", booking)
check("booking gets a GR- reference", booking["bookingId"].startswith("GR-"), booking.get("bookingId"))
check("booking embeds restaurant object", isinstance(booking["restaurant"], dict), booking["restaurant"])
check("booking date keeps its calendar day", booking["date"].startswith(tomorrow), booking["date"])
booking_pk = booking["_id"]

status, data = call("GET", f"/restaurants/l-essence/availability?date={tomorrow}")
seat_row = next(s for s in data if s["time"] == "20:00")
check("availability drops after booking", seat_row["availableSeats"] == essence["totalSeats"] - 2, seat_row)

status, data = call(
    "POST", "/bookings", token=diner_token,
    body={"restaurantId": essence["_id"], "date": tomorrow, "time": "03:00", "guests": 2},
)
check("slot outside opening hours rejected", status == 422, data)

yesterday = (date.today() - timedelta(days=1)).isoformat()
status, data = call(
    "POST", "/bookings", token=diner_token,
    body={"restaurantId": essence["_id"], "date": yesterday, "time": "20:00", "guests": 2},
)
check("past date rejected", status == 422, data)

status, data = call(
    "POST", "/bookings", token=diner_token,
    body={"restaurantId": essence["_id"], "date": tomorrow, "time": "20:00", "guests": 50},
)
check("overbooking rejected (capacity)", status == 409, data)

status, data = call(
    "POST", "/bookings", token=diner_token,
    body={"restaurantId": essence["_id"], "date": tomorrow, "time": "20:00", "guests": 999},
)
check("absurd party size rejected (validation)", status == 422, data)

status, data = call(
    "POST", "/bookings", token=diner_token,
    body={"restaurantId": "999999", "date": tomorrow, "time": "20:00", "guests": 2},
)
check("unknown restaurant 404s", status == 404, data)

status, mine = call("GET", "/bookings", token=diner_token)
check("list my bookings", status == 200 and any(b["_id"] == booking_pk for b in mine), len(mine))

status, other = call("GET", "/bookings", token=new_token)
check("bookings are per-account", all(b["_id"] != booking_pk for b in other), other)

status, data = call("GET", f"/bookings/{booking_pk}", token=new_token)
check("can't read someone else's booking", status == 404, data)

status, data = call("PUT", f"/bookings/{booking_pk}", token=diner_token, body={"time": "21:00", "guests": 4})
check("reschedule booking", status == 200 and data["time"] == "21:00" and data["guests"] == 4, data)

status, data = call("PATCH", f"/bookings/{booking_pk}/cancel", token=diner_token)
check("cancel booking", status == 200 and data["status"] == "cancelled", data)

status, data = call("PATCH", f"/bookings/{booking_pk}/cancel", token=diner_token)
check("double-cancel rejected", status == 409, data)

status, data = call("GET", f"/restaurants/l-essence/availability?date={tomorrow}")
seat_row = next(s for s in data if s["time"] == "21:00")
check("cancelling frees the seats", seat_row["availableSeats"] == essence["totalSeats"], seat_row)

status, data = call("DELETE", f"/bookings/{booking_pk}", token=diner_token)
check("delete booking", status == 200, data)
status, data = call("GET", f"/bookings/{booking_pk}", token=diner_token)
check("deleted booking is gone", status == 404, data)

# ── Owner portal ────────────────────────────────────────────────────────────
section("Owner portal")
status, data = call("GET", "/owner/restaurant", token=diner_token)
check("diners can't reach the owner portal", status == 403, data)

status, my_venue = call("GET", "/owner/restaurant", token=owner_token)
check("owner reads their venue", status == 200 and my_venue["slug"] == "l-essence", my_venue)

status, data = call(
    "PUT", "/owner/restaurant", token=owner_token,
    multipart={
        "name": "L'Essence", "description": my_venue["description"], "cuisine": "French",
        "priceRange": "$$$$", "location": "Manhattan, NY", "address": my_venue["address"],
        "chef": "Jean-Luc Picard", "tags": "Romantic,Candlelit",
        "availableSlots": "18:00,19:00,20:00,21:00,22:00", "totalSeats": 50,
    },
)
check("owner updates venue via multipart", status == 200 and data["totalSeats"] == 50, data)
check("tags round-trip as an array", data["tags"] == ["Romantic", "Candlelit"], data["tags"])

png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff0300000600055773b0d20000000049454e44ae426082")
status, data = call(
    "PUT", "/owner/restaurant", token=owner_token,
    multipart={
        "name": "L'Essence", "description": my_venue["description"], "cuisine": "French",
        "priceRange": "$$$$", "location": "Manhattan, NY", "address": my_venue["address"],
        "chef": "Jean-Luc Picard", "tags": "Romantic,Candlelit",
        "availableSlots": "18:00,19:00,20:00,21:00,22:00", "totalSeats": 45,
        "image": ("cover.png", png, "image/png"),
    },
)
check("cover image upload accepted", status == 200 and "/uploads/" in data["image"], data.get("image"))
check("uploaded image is an absolute URL", data["image"].startswith("http"), data.get("image"))
uploaded_path = data["image"].replace(BASE, "")
try:
    with urllib.request.urlopen(f"{BASE}{uploaded_path}") as response:
        check("uploaded image is served back", response.status == 200)
except Exception as error:  # noqa: BLE001
    check("uploaded image is served back", False, error)

status, data = call(
    "PUT", "/owner/restaurant", token=owner_token,
    multipart={
        "name": "L'Essence", "description": "x", "cuisine": "French", "priceRange": "£££",
        "location": "NY", "address": "x", "chef": "x", "tags": "", "availableSlots": "18:00", "totalSeats": 10,
    },
)
check("invalid price range rejected", status == 422, data)

status, data = call(
    "PUT", "/owner/restaurant", token=owner_token,
    multipart={
        "name": "L'Essence", "description": "x", "cuisine": "French", "priceRange": "$$$$",
        "location": "NY", "address": "x", "chef": "x", "tags": "", "availableSlots": "", "totalSeats": 10,
    },
)
check("empty slot list rejected", status == 422, data)

status, data = call(
    "POST", "/owner/restaurant", token=owner_token,
    multipart={
        "name": "Second Venue", "description": "x", "cuisine": "French", "priceRange": "$$",
        "location": "NY", "address": "x", "chef": "x", "tags": "", "availableSlots": "18:00", "totalSeats": 10,
    },
)
check("one venue per owner enforced", status == 409, data)

fresh_owner_email = f"owner_{uuid.uuid4().hex[:8]}@example.com"
status, data = call(
    "POST", "/auth/register",
    body={"name": "Fresh Owner", "email": fresh_owner_email, "password": "password123", "role": "owner"},
)
check("self-assigned owner downgraded to user", status == 201 and data["user"]["role"] == "user", data)
fresh_owner_token = data["token"]
fresh_owner_id = data["user"]["_id"]

status, promoted = call(
    "PATCH", f"/admin/users/{fresh_owner_id}/role", token=admin_token, body={"role": "owner"},
)
check("admin grants partner access", status == 200 and promoted["role"] == "owner", promoted)

status, data = call("GET", "/owner/restaurant", token=fresh_owner_token)
check("new owner has no venue yet", status == 200 and data is None, data)

status, created = call(
    "POST", "/owner/restaurant", token=fresh_owner_token,
    multipart={
        "name": "Test Bistro", "description": "A test venue.", "cuisine": "Italian", "priceRange": "$$",
        "location": "Queens, NY", "address": "1 Test St", "chef": "Chef Test",
        "tags": "Casual,Test", "availableSlots": "18:00,19:00", "totalSeats": 12,
    },
)
check("owner registers a venue", status == 201, created)
check("new venue starts pending", created["status"] == "pending", created)
check("slug generated from name", created["slug"] == "test-bistro", created["slug"])

status, data = call("GET", "/restaurants?search=Test%20Bistro")
check("pending venue absent from public search", all(r["slug"] != "test-bistro" for r in data))

status, owner_bookings = call("GET", "/owner/bookings", token=owner_token)
check("owner sees their reservations", status == 200 and isinstance(owner_bookings, list), owner_bookings)
check("owner bookings embed the diner", not owner_bookings or isinstance(owner_bookings[0]["user"], dict))

if owner_bookings:
    target = owner_bookings[0]["_id"]
    status, data = call("PATCH", f"/owner/bookings/{target}/status", token=owner_token, body={"status": "completed"})
    check("owner marks booking completed", status == 200 and data["status"] == "completed", data)
    status, data = call("PATCH", f"/owner/bookings/{target}/status", token=owner_token, body={"status": "bogus"})
    check("invalid booking status rejected", status == 422, data)
    status, data = call("PATCH", f"/owner/bookings/{target}/status", token=fresh_owner_token, body={"status": "cancelled"})
    check("owner can't touch another venue's booking", status == 404, data)

status, data = call("GET", "/owner/stats", token=owner_token)
check("owner stats", status == 200 and "bookings" in data, data)

# ── Reviews ─────────────────────────────────────────────────────────────────
section("Reviews")
status, reviews = call("GET", "/restaurants/l-essence/reviews")
check("reviews list", status == 200 and len(reviews) >= 1, reviews)
check("review shape matches UI", {"_id", "userName", "rating", "comment", "visitedDate"} <= set(reviews[0]))

status, data = call(
    "POST", "/restaurants/l-essence/reviews", token=new_token,
    body={"rating": 5, "comment": "Never been but sounds nice"},
)
check("review requires a prior booking", status == 403, data)

status, data = call(
    "POST", "/restaurants/l-essence/reviews", token=diner_token,
    body={"rating": 5, "comment": "Second review attempt"},
)
check("one review per diner per venue", status == 409, data)

status, data = call(
    "POST", "/restaurants/l-essence/reviews", token=diner_token,
    body={"rating": 9, "comment": "Out of range"},
)
check("rating must be 1-5", status == 422, data)

# ── Admin console ───────────────────────────────────────────────────────────
section("Admin console")
status, data = call("GET", "/admin/stats", token=diner_token)
check("diners can't reach admin", status == 403, data)
status, data = call("GET", "/admin/stats", token=owner_token)
check("owners can't reach admin", status == 403, data)

status, admin_list = call("GET", "/admin/restaurants", token=admin_token)
check("admin sees every venue including pending", status == 200 and any(r["status"] == "pending" for r in admin_list), admin_list)
check("admin list embeds owner object",
      any(isinstance(r.get("owner"), dict) for r in admin_list))

pending = next(r for r in admin_list if r["slug"] == "test-bistro")
status, data = call("PATCH", f"/admin/restaurants/{pending['_id']}/status", token=admin_token, body={"status": "approved"})
check("admin approves a venue", status == 200 and data["status"] == "approved", data)

status, data = call("GET", "/restaurants/test-bistro")
check("approved venue becomes public", status == 200, data)

status, data = call("PATCH", f"/admin/restaurants/{pending['_id']}/status", token=admin_token, body={"status": "rejected"})
check("admin suspends a venue", status == 200 and data["status"] == "rejected", data)
status, data = call("GET", "/restaurants/test-bistro")
check("suspended venue leaves the catalogue", status == 404, data)

status, data = call("PATCH", f"/admin/restaurants/{pending['_id']}/status", token=admin_token, body={"status": "sideways"})
check("invalid venue status rejected", status == 422, data)

status, stats = call("GET", "/admin/stats", token=admin_token)
check("admin stats shape", status == 200 and {"users", "restaurants", "bookings", "latestBookings"} <= set(stats), stats)
check("stats KPI fields match the UI",
      {"totalUsers", "totalOwners", "total"} <= set(stats["users"]), stats["users"])
check("latest bookings embed user + restaurant",
      not stats["latestBookings"] or (
          isinstance(stats["latestBookings"][0]["user"], dict)
          and isinstance(stats["latestBookings"][0]["restaurant"], dict)
      ))

status, users = call("GET", "/admin/users", token=admin_token)
check("admin lists users", status == 200 and len(users) >= 5, len(users))

status, data = call("PATCH", f"/admin/users/{admin['_id']}/role", token=admin_token, body={"role": "user"})
check("admin can't demote themselves", status == 409, data)

# Clean up the venue created during the run.
call("DELETE", f"/admin/restaurants/{pending['_id']}", token=admin_token)

print(f"\n{'=' * 46}\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
