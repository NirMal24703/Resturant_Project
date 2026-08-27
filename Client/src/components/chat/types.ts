export interface RestaurantLite {
    _id: string;
    name: string;
    slug: string;
    cuisine: string;
    priceRange: string;
    rating: number;
    reviewCount?: number;
    location: string;
    image: string;
    tags: string[];
    availableSlots: string[];
}

export interface BookingLite {
    bookingId: string;
    name: string;
    slug: string;
    image: string;
    date: string;
    time: string;
    guests: number;
    status: string;
}

/** Which slot the concierge is currently waiting on. */
export type Awaiting = "restaurant" | "date" | "time" | "guests" | "confirm" | null;

export interface BookingDraft {
    slug?: string;
    name?: string;
    /** ISO yyyy-mm-dd */
    date?: string;
    /** 24h HH:MM */
    time?: string;
    guests?: number;
    awaiting: Awaiting;
}

export interface Message {
    id: string;
    from: "bot" | "user";
    text: string;
    ts: number;
    chips?: string[];
    restaurants?: RestaurantLite[];
    bookings?: BookingLite[];
    /** Present on the confirmation card message. */
    draft?: BookingDraft;
}

export type EngineAction =
    | { type: "auth" }
    | { type: "navigate"; to: string }
    | { type: "reset" };

export interface OutMessage {
    text: string;
    chips?: string[];
    restaurants?: RestaurantLite[];
    bookings?: BookingLite[];
    draft?: BookingDraft;
}

export interface EngineContext {
    isAuthenticated: boolean;
    userName?: string;
    /** Slug of the restaurant page the visitor is currently looking at, if any. */
    routeSlug?: string;
    /** The most recent set of results shown, so "there" and "the first one" resolve. */
    lastResults?: RestaurantLite[];
    /** The signed-in diner's real reservations, loaded by Chatbot.tsx. */
    bookings?: BookingLite[];
    draft: BookingDraft | null;
}

export interface EngineResult {
    messages: OutMessage[];
    draft: BookingDraft | null;
    action?: EngineAction;
}
