/**
 * Drives the real API through the same sequences the UI performs, using the
 * shipped api.ts logic (auth header, FormData handling, error unwrapping).
 *
 *   node integration_test.mjs            # assumes http://localhost:8000
 */

const BASE = (process.argv[2] ?? "http://localhost:8000").replace(/\/$/, "");
const API = `${BASE}/api`;

let token = null;
let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
    if (condition) {
        passed++;
        console.log(`  PASS  ${label}`);
    } else {
        failed++;
        console.log(`  FAIL  ${label}  ${JSON.stringify(detail)}`);
    }
}

// Mirrors the request() helper in Client/src/api.ts.
async function request(path, options = {}) {
    const isFormData = options.body instanceof FormData;
    const response = await fetch(`${API}${path}`, {
        ...options,
        headers: {
            ...(isFormData ? {} : { "Content-Type": "application/json" }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers,
        },
    });

    if (response.status === 204) return undefined;
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        const detail = payload?.detail;
        const message = Array.isArray(detail)
            ? detail.map((d) => d.msg).filter(Boolean).join(", ")
            : typeof detail === "string"
              ? detail
              : `Request failed (${response.status})`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }
    return payload;
}

const today = new Date();
const iso = (offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d.toISOString().split("T")[0];
};

// ── Diner journey: home -> search -> detail -> book -> dashboard ────────────
console.log("\n=== Diner journey");

const trending = await request("/restaurants/featured?limit=6");
check("Home loads a trending row", Array.isArray(trending) && trending.length > 0);
check("RestaurantCard fields present",
    trending.every((r) => r.name && r.slug && r.image && typeof r.rating === "number"),
    trending[0]);

// Search page: filters live in the URL and go straight through as query params.
const params = new URLSearchParams();
params.append("cuisine", "French");
params.set("sort", "price_low");
const searched = await request(`/restaurants?${params}`);
check("Search applies URL filters", searched.every((r) => r.cuisine === "French"), searched.map((r) => r.cuisine));

const detail = await request(`/restaurants/${trending[0].slug}`);
check("Detail page loads by slug", detail.slug === trending[0].slug);
check("availableSlots is an array the widget can map", Array.isArray(detail.availableSlots) && detail.availableSlots.length > 0);

const when = iso(2);
const slots = await request(`/restaurants/${detail.slug}/availability?date=${when}`);
check("BookingWidget receives slot availability",
    slots.every((s) => typeof s.time === "string" && typeof s.availableSeats === "number" && typeof s.isAvailable === "boolean"),
    slots[0]);

({ token } = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "diner@quickdine.com", password: "diner1234" }),
}));
check("Diner signs in and receives a token", typeof token === "string" && token.length > 20);

const me = await request("/auth/me");
check("Session restores on reload", me.email === "diner@quickdine.com");

const chosenSlot = slots.find((s) => s.isAvailable).time;
const booking = await request("/bookings", {
    method: "POST",
    body: JSON.stringify({
        restaurantId: detail._id,
        date: when,
        time: chosenSlot,
        guests: 2,
        name: "Alex Mercer",
        email: "diner@quickdine.com",
        phone: "+1 917 555 0198",
        occasion: "Birthday",
        specialRequests: "Booth seating please",
    }),
});
check("BookingConfirmation creates a reservation", booking.status === "confirmed", booking);
check("BookingSuccess can show a reference", /^GR-/.test(booking.bookingId), booking.bookingId);
check("Dashboard can render b.restaurant.image", typeof booking.restaurant?.image === "string", booking.restaurant);
check("Dashboard can render b.restaurant.cuisine", typeof booking.restaurant?.cuisine === "string");

// Dashboard's upcoming/past split relies on the date landing on the right day.
const parsed = new Date(booking.date);
const midnight = new Date();
midnight.setHours(0, 0, 0, 0);
check("Booking counts as upcoming, not history", parsed >= midnight, { date: booking.date });
check("Local calendar day matches what was booked",
    parsed.toISOString().split("T")[0] === when || parsed.toLocaleDateString("en-CA") === when,
    { stored: booking.date, expected: when });

const mine = await request("/bookings");
check("Dashboard lists the new booking", mine.some((b) => b._id === booking._id));

const afterBooking = await request(`/restaurants/${detail.slug}/availability?date=${when}`);
const usedSlot = afterBooking.find((s) => s.time === chosenSlot);
check("Seats decrease for the next visitor", usedSlot.availableSeats === detail.totalSeats - 2, usedSlot);

const cancelled = await request(`/bookings/${booking._id}/cancel`, { method: "PATCH" });
check("Dashboard cancel button works", cancelled.status === "cancelled");

// ── Owner journey: signup -> wizard -> pending -> approved -> manage ────────
console.log("\n=== Owner journey");

const ownerEmail = `owner_${Math.random().toString(16).slice(2, 10)}@example.com`;
let ownerAuth = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Nadia Okafor", email: ownerEmail, password: "password123", role: "owner" }),
});
check("Signing up cannot self-assign the owner role", ownerAuth.user.role === "user", ownerAuth.user);

const grantAuth = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@quickdine.com", password: "admin1234" }),
});
token = grantAuth.token;
const granted = await request(`/admin/users/${ownerAuth.user._id}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role: "owner" }),
});
check("AdminUsers can grant partner access", granted.role === "owner", granted);

ownerAuth = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ownerEmail, password: "password123" }),
});
check("Promoted account signs back in as owner", ownerAuth.user.role === "owner", ownerAuth.user);
token = ownerAuth.token;

const noVenue = await request("/owner/restaurant");
check("New owner sees the wizard (null venue)", noVenue === null, noVenue);

// RestaurantWizard posts multipart FormData with a cover image.
const form = new FormData();
form.append("name", "Aurora Supper Club");
form.append("description", "Late-night tasting menus under a domed skylight.");
form.append("cuisine", "French");
form.append("priceRange", "$$$");
form.append("location", "Brooklyn, NY");
form.append("address", "12 Dome St, Brooklyn, NY 11201");
form.append("chef", "Nadia Okafor");
form.append("tags", "Late Night, Skylight, Tasting Menu");
form.append("availableSlots", "19:00,20:00,21:00");
form.append("totalSeats", "24");
const pngBytes = Uint8Array.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff0300000600055773b0d20000000049454e44ae426082"
        .match(/../g)
        .map((h) => parseInt(h, 16)),
);
form.append("image", new Blob([pngBytes], { type: "image/png" }), "cover.png");

const created = await request("/owner/restaurant", { method: "POST", body: form });
check("Wizard registers the venue", created.name === "Aurora Supper Club", created);
check("Venue starts pending admin approval", created.status === "pending");
check("Tags split into an array", Array.isArray(created.tags) && created.tags.length === 3, created.tags);
check("Uploaded cover returns an absolute URL", /^https?:\/\/.+\/uploads\//.test(created.image), created.image);

const imageResponse = await fetch(created.image);
check("Uploaded cover is actually served", imageResponse.ok && imageResponse.headers.get("content-type").includes("image"));

const publicList = await request("/restaurants?search=Aurora");
check("Pending venue stays out of public search", !publicList.some((r) => r._id === created._id));

// ── Admin journey ──────────────────────────────────────────────────────────
console.log("\n=== Admin journey");

({ token } = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@quickdine.com", password: "admin1234" }),
}));

const allVenues = await request("/admin/restaurants");
const queued = allVenues.find((r) => r._id === created._id);
check("Approvals queue shows the new venue", Boolean(queued));
check("AdminApprovals can read r.owner.email", queued.owner?.email === ownerEmail, queued.owner);
check("AdminApprovals can read capacity", queued.totalSeats === 24);

const approved = await request(`/admin/restaurants/${created._id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "approved" }),
});
check("Admin approve button works", approved.status === "approved");

const stats = await request("/admin/stats");
check("AdminStats KPI cards resolve",
    [stats.users.totalUsers, stats.users.totalOwners, stats.restaurants.total, stats.bookings.total]
        .every((v) => typeof v === "number"),
    stats);
check("Recent activity table has diner + venue objects",
    stats.latestBookings.length > 0
        && typeof stats.latestBookings[0].user?.name === "string"
        && typeof stats.latestBookings[0].restaurant?.name === "string",
    stats.latestBookings[0]);

// Now public, and bookable by a diner.
const nowPublic = await request(`/restaurants/${approved.slug}`);
check("Approved venue is publicly visible", nowPublic._id === created._id);

({ token } = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "diner@quickdine.com", password: "diner1234" }),
}));
const secondBooking = await request("/bookings", {
    method: "POST",
    body: JSON.stringify({ restaurantId: created._id, date: iso(4), time: "20:00", guests: 4 }),
});
check("Diner books the newly approved venue", secondBooking.status === "confirmed");

// Owner sees that reservation and completes it.
token = ownerAuth.token;
const ownerBookings = await request("/owner/bookings");
check("Owner sees the incoming reservation", ownerBookings.some((b) => b._id === secondBooking._id));
check("OwnerBookings can read b.user.name", typeof ownerBookings[0].user?.name === "string", ownerBookings[0].user);
check("OwnerBookings can read specialRequests", "specialRequests" in ownerBookings[0]);

const completed = await request(`/owner/bookings/${secondBooking._id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed" }),
});
check("Owner marks the visit completed", completed.status === "completed");

// OwnerProfileDetails saves capacity changes.
const editForm = new FormData();
editForm.append("name", "Aurora Supper Club");
editForm.append("description", "Late-night tasting menus under a domed skylight.");
editForm.append("cuisine", "French");
editForm.append("priceRange", "$$$$");
editForm.append("location", "Brooklyn, NY");
editForm.append("address", "12 Dome St, Brooklyn, NY 11201");
editForm.append("chef", "Nadia Okafor");
editForm.append("tags", "Late Night, Skylight");
editForm.append("availableSlots", "19:00,20:00,21:00,22:00");
editForm.append("totalSeats", "30");
const edited = await request("/owner/restaurant", { method: "PUT", body: editForm });
check("Profile Details saves capacity", edited.totalSeats === 30 && edited.priceRange === "$$$$", edited);
check("Adding a slot is reflected", edited.availableSlots.includes("22:00"), edited.availableSlots);

// Error surfacing: the message must be human-readable for toast().
try {
    await request("/bookings", {
        method: "POST",
        body: JSON.stringify({ restaurantId: created._id, date: iso(4), time: "20:00", guests: 999 }),
    });
    check("Validation errors surface a readable message", false, "no error thrown");
} catch (error) {
    check("Validation errors surface a readable message",
        typeof error.message === "string" && error.message.length > 5 && !error.message.includes("[object"),
        error.message);
}

try {
    token = null;
    await request("/owner/restaurant");
    check("Signed-out owner route is rejected", false, "no error thrown");
} catch (error) {
    check("Signed-out owner route is rejected", error.status === 401, error.message);
}

console.log(`\n${"=".repeat(46)}\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
