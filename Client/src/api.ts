// Override in Client/.env.local with:  VITE_API_URL=http://localhost:8000/api
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

const TOKEN_KEY = "token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export interface ApiUser {
    id: number;
    name: string;
    email: string;
    phone?: string | null;
    role: "user" | "owner" | "admin";
}

export interface AuthResponse {
    token: string;
    user: ApiUser;
}

export interface BookingRecord {
    id: number;
    name: string;
    date: string;
    time: string;
    guests: number;
    restaurant_slug: string | null;
    status: string;
    user_id: number | null;
}

export interface BookingInput {
    name: string;
    date: string;
    time: string;
    guests: number;
    restaurant_slug?: string;
}

/**
 * One place that knows how to talk to the API: attaches the bearer token,
 * and turns FastAPI's error shapes into a plain Error with a readable message.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = getToken();

    let response: Response;
    try {
        response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...options.headers,
            },
        });
    } catch {
        // fetch only rejects when the request never reached a server.
        throw new Error(
            "Can't reach the server. Make sure the API is running: uvicorn main:app --reload --port 8000",
        );
    }

    if (response.status === 204) return undefined as T;

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        const detail = payload?.detail;
        // FastAPI validation errors arrive as an array of issues.
        const message = Array.isArray(detail)
            ? detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(", ")
            : typeof detail === "string"
              ? detail
              : `Request failed (${response.status})`;
        throw new Error(message);
    }

    return payload as T;
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

// ── Bookings (all require a signed-in user) ─────────────────────────────────

export function getBookings() {
    return request<BookingRecord[]>("/bookings");
}

export function getBooking(id: number) {
    return request<BookingRecord>(`/bookings/${id}`);
}

export function createBooking(booking: BookingInput) {
    return request<BookingRecord>("/bookings", { method: "POST", body: JSON.stringify(booking) });
}

export function updateBooking(id: number, booking: BookingInput) {
    return request<BookingRecord>(`/bookings/${id}`, { method: "PUT", body: JSON.stringify(booking) });
}

export function cancelBooking(id: number) {
    return request<BookingRecord>(`/bookings/${id}/cancel`, { method: "PATCH" });
}

export function deleteBooking(id: number) {
    return request<{ message: string }>(`/bookings/${id}`, { method: "DELETE" });
}
