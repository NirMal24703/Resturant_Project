/**
 * The single place that knows how to talk to the QuickDine API.
 *
 * It attaches the bearer token, turns FastAPI's error shapes into a plain
 * Error with a readable message, and exposes one function per endpoint so
 * components never build URLs by hand.
 *
 * Override the base URL in Client/.env.local with:
 *   VITE_API_URL=http://localhost:8000/api
 */

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

const TOKEN_KEY = "token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// ── Types ───────────────────────────────────────────────────────────────────

export type Role = "user" | "owner" | "admin";
export type BookingStatus = "confirmed" | "completed" | "cancelled";
export type RestaurantStatus = "pending" | "approved" | "rejected";

export interface ApiUser {
    _id: string;
    name: string;
    email: string;
    phone?: string | null;
    role: Role;
    createdAt?: string;
    updatedAt?: string;
}

export interface UserBrief {
    _id: string;
    name: string;
    email: string;
    phone?: string | null;
}

export interface AuthResponse {
    token: string;
    user: ApiUser;
}

export interface Restaurant {
    _id: string;
    name: string;
    slug: string;
    description: string;
    cuisine: string;
    priceRange: string;
    rating: number;
    reviewCount: number;
    location: string;
    address: string;
    image: string;
    chef: string;
    tags: string[];
    availableSlots: string[];
    featured: boolean;
    exclusive: boolean;
    totalSeats: number;
    status: RestaurantStatus;
    /** Populated on detail/admin responses; null on public list responses. */
    owner: UserBrief | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface RestaurantBrief {
    _id: string;
    name: string;
    slug: string;
    cuisine: string;
    location: string;
    address: string;
    image: string;
}

export interface Booking {
    _id: string;
    bookingId: string;
    user: UserBrief | null;
    /** Null only if the venue was removed after the booking was made. */
    restaurant: RestaurantBrief | null;
    guestName: string;
    guestEmail: string;
    guestPhone: string;
    date: string;
    time: string;
    guests: number;
    occasion: string;
    specialRequests: string;
    status: BookingStatus;
    createdAt?: string;
    updatedAt?: string;
}

export interface Review {
    _id: string;
    userName: string;
    rating: number;
    comment: string;
    visitedDate: string;
    createdAt?: string;
}

export interface SlotAvailability {
    time: string;
    availableSeats: number;
    totalSeats: number;
    isAvailable: boolean;
}

export interface AdminStats {
    users: { totalUsers: number; totalOwners: number; totalAdmins: number; total: number };
    restaurants: { total: number; approved: number; pending: number; rejected: number };
    bookings: { total: number; confirmed: number; completed: number; cancelled: number };
    reviews: { total: number };
    latestBookings: Booking[];
}

export interface OwnerStats {
    bookings: { total: number; confirmed: number; completed: number; cancelled: number };
    covers: number;
    totalSeats?: number;
    rating?: number;
    reviewCount?: number;
}

export interface RestaurantQuery {
    search?: string;
    location?: string;
    cuisine?: string[];
    priceRange?: string[];
    sort?: string;
    featured?: boolean;
    limit?: number;
}

// ── Core request helper ─────────────────────────────────────────────────────

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = getToken();
    const isFormData = options.body instanceof FormData;

    let response: Response;
    try {
        response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers: {
                // The browser must set its own multipart boundary, so only
                // declare JSON when we're actually sending JSON.
                ...(isFormData ? {} : { "Content-Type": "application/json" }),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...options.headers,
            },
        });
    } catch {
        // fetch only rejects when the request never reached a server at all.
        throw new Error(
            "Can't reach the server. Make sure the API is running: uvicorn main:app --reload --port 8000",
        );
    }

    if (response.status === 204) return undefined as T;

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        const detail = (payload as { detail?: unknown } | null)?.detail;
        // FastAPI validation errors arrive as an array of issues.
        const message = Array.isArray(detail)
            ? detail
                  .map((d: { msg?: string }) => d.msg)
                  .filter(Boolean)
                  .join(", ")
            : typeof detail === "string"
              ? detail
              : `Request failed (${response.status})`;
        throw new Error(message);
    }

    return payload as T;
}

function buildQuery(params: RestaurantQuery): string {
    const search = new URLSearchParams();
    if (params.search) search.set("search", params.search);
    if (params.location) search.set("location", params.location);
    if (params.sort) search.set("sort", params.sort);
    if (params.limit) search.set("limit", String(params.limit));
    if (params.featured !== undefined) search.set("featured", String(params.featured));
    // Repeated keys, matching what the Search page keeps in the URL.
    params.cuisine?.forEach((c) => search.append("cuisine", c));
    params.priceRange?.forEach((p) => search.append("priceRange", p));
    const query = search.toString();
    return query ? `?${query}` : "";
}

// ── Auth ────────────────────────────────────────────────────────────────────

export function registerUser(body: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role?: string;
}) {
    return request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(body) });
}

export function loginUser(body: { email: string; password: string }) {
    return request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(body) });
}

export function getMe() {
    return request<ApiUser>("/auth/me");
}

export function updateProfile(body: { name?: string; phone?: string }) {
    return request<ApiUser>("/auth/me", { method: "PUT", body: JSON.stringify(body) });
}

export function changePassword(body: { current_password: string; new_password: string }) {
    return request<AuthResponse>("/auth/password", { method: "PUT", body: JSON.stringify(body) });
}

// ── Restaurants (public) ────────────────────────────────────────────────────

export function getRestaurants(params: RestaurantQuery = {}) {
    return request<Restaurant[]>(`/restaurants${buildQuery(params)}`);
}

export function getFeaturedRestaurants(limit = 6) {
    return request<Restaurant[]>(`/restaurants/featured?limit=${limit}`);
}

export function getRestaurant(slug: string) {
    return request<Restaurant>(`/restaurants/${slug}`);
}

export function getAvailability(slug: string, date?: string) {
    const suffix = date ? `?date=${encodeURIComponent(date)}` : "";
    return request<SlotAvailability[]>(`/restaurants/${slug}/availability${suffix}`);
}

export function getReviews(slug: string) {
    return request<Review[]>(`/restaurants/${slug}/reviews`);
}

export function createReview(slug: string, body: { rating: number; comment: string; visitedDate?: string }) {
    return request<Review>(`/restaurants/${slug}/reviews`, { method: "POST", body: JSON.stringify(body) });
}

// ── Bookings (diner) ────────────────────────────────────────────────────────

export interface BookingInput {
    restaurantId: string;
    date: string;
    time: string;
    guests: number;
    name?: string;
    email?: string;
    phone?: string;
    occasion?: string;
    specialRequests?: string;
}

export function getMyBookings() {
    return request<Booking[]>("/bookings");
}

export function getBooking(id: string) {
    return request<Booking>(`/bookings/${id}`);
}

export function createBooking(body: BookingInput) {
    return request<Booking>("/bookings", { method: "POST", body: JSON.stringify(body) });
}

export function updateBooking(
    id: string,
    body: { date?: string; time?: string; guests?: number; occasion?: string; specialRequests?: string },
) {
    return request<Booking>(`/bookings/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export function cancelBooking(id: string) {
    return request<Booking>(`/bookings/${id}/cancel`, { method: "PATCH" });
}

export function deleteBooking(id: string) {
    return request<{ message: string }>(`/bookings/${id}`, { method: "DELETE" });
}

// ── Owner portal ────────────────────────────────────────────────────────────

/** Resolves to null when the owner hasn't registered a venue yet. */
export function getMyRestaurant() {
    return request<Restaurant | null>("/owner/restaurant");
}

export function createMyRestaurant(form: FormData) {
    return request<Restaurant>("/owner/restaurant", { method: "POST", body: form });
}

export function updateMyRestaurant(form: FormData) {
    return request<Restaurant>("/owner/restaurant", { method: "PUT", body: form });
}

export function deleteMyRestaurant() {
    return request<{ message: string }>("/owner/restaurant", { method: "DELETE" });
}

export function getOwnerBookings() {
    return request<Booking[]>("/owner/bookings");
}

export function setOwnerBookingStatus(id: string, status: BookingStatus) {
    return request<Booking>(`/owner/bookings/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
    });
}

export function getOwnerStats() {
    return request<OwnerStats>("/owner/stats");
}

// ── Admin console ───────────────────────────────────────────────────────────

export function getAllRestaurants() {
    return request<Restaurant[]>("/admin/restaurants");
}

export function setRestaurantStatus(id: string, status: RestaurantStatus) {
    return request<Restaurant>(`/admin/restaurants/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
    });
}

export function adminDeleteRestaurant(id: string) {
    return request<{ message: string }>(`/admin/restaurants/${id}`, { method: "DELETE" });
}

export function getAdminStats() {
    return request<AdminStats>("/admin/stats");
}

export function getAllUsers() {
    return request<ApiUser[]>("/admin/users");
}

export function setUserRole(id: string, role: Role) {
    return request<ApiUser>(`/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
}
