import type { Restaurant } from "../../api.ts";
import type {
    BookingDraft,
    BookingLite,
    EngineContext,
    EngineResult,
    OutMessage,
    RestaurantLite,
} from "./types.ts";


export const CATALOGUE: RestaurantLite[] = [];

/** Replaces the catalogue in place, keeping the exported reference stable. */
export function hydrateCatalogue(restaurants: Restaurant[]): void {
    const seen = new Set<string>();
    const mapped = restaurants
        .filter((r) => {
            if (seen.has(r.slug)) return false;
            seen.add(r.slug);
            return true;
        })
        .map((r) => ({
            _id: r._id,
            name: r.name,
            slug: r.slug,
            cuisine: r.cuisine,
            priceRange: r.priceRange,
            rating: r.rating,
            reviewCount: r.reviewCount,
            location: r.location,
            image: r.image,
            tags: r.tags ?? [],
            availableSlots: r.availableSlots ?? [],
        }));
    CATALOGUE.splice(0, CATALOGUE.length, ...mapped);
}

export const findBySlug = (slug?: string) => CATALOGUE.find((r) => r.slug === slug);


const pad = (n: number) => String(n).padStart(2, "0");

export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const addDays = (d: Date, n: number) => {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + n);
    return copy;
};

const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
};

export function formatTime12(hhmm: string): string {
    const [h, m] = hhmm.split(":").map(Number);
    if (Number.isNaN(h)) return hhmm;
    const suffix = h >= 12 ? "PM" : "AM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return m ? `${hour}:${pad(m)} ${suffix}` : `${hour} ${suffix}`;
}

export function formatDateLabel(iso: string): string {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    const today = startOfToday();
    const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parseDate(input: string): string | null {
    const t = input.toLowerCase();
    const today = startOfToday();

    if (/\btoday\b|\btonight\b|\bthis evening\b/.test(t)) return toISODate(today);
    if (/\btomorrow\b|\btmr\b|\btmrw\b/.test(t)) return toISODate(addDays(today, 1));

    const inDays = t.match(/\bin (\d{1,2}) days?\b/);
    if (inDays) return toISODate(addDays(today, Number(inDays[1])));

    if (/\bnext week\b/.test(t)) return toISODate(addDays(today, 7));
    if (/\bthis weekend\b|\bweekend\b/.test(t)) {
        const delta = (6 - today.getDay() + 7) % 7 || 7;
        return toISODate(addDays(today, delta));
    }

    for (let i = 0; i < WEEKDAYS.length; i++) {
        if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(t)) {
            const delta = (i - today.getDay() + 7) % 7 || 7;
            return toISODate(addDays(today, delta));
        }
    }

    const explicit = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (explicit) return `${explicit[1]}-${pad(Number(explicit[2]))}-${pad(Number(explicit[3]))}`;

    // "25 dec" / "dec 25"
    const dayMonth = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\b/);
    const monthDay = t.match(/\b([a-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    const pair = dayMonth
        ? { day: Number(dayMonth[1]), month: dayMonth[2] }
        : monthDay
          ? { day: Number(monthDay[2]), month: monthDay[1] }
          : null;

    if (pair) {
        const idx = MONTHS.findIndex((m) => pair.month.startsWith(m));
        if (idx >= 0 && pair.day >= 1 && pair.day <= 31) {
            const year = today.getFullYear() + (idx < today.getMonth() ? 1 : 0);
            return `${year}-${pad(idx + 1)}-${pad(pair.day)}`;
        }
    }

    return null;
}

export function parseTime(input: string): string | null {
    const t = input.toLowerCase().replace(/\s+/g, "");

    let m = t.match(/(\d{1,2}):(\d{2})(am|pm)?/);
    if (m) {
        let h = Number(m[1]);
        if (m[3] === "pm" && h < 12) h += 12;
        if (m[3] === "am" && h === 12) h = 0;
        if (h <= 23) return `${pad(h)}:${m[2]}`;
    }

    m = t.match(/(\d{1,2})(am|pm)/);
    if (m) {
        let h = Number(m[1]);
        if (m[2] === "pm" && h < 12) h += 12;
        if (m[2] === "am" && h === 12) h = 0;
        if (h <= 23) return `${pad(h)}:00`;
    }

    if (/\bnoon\b/.test(input.toLowerCase())) return "12:00";
    if (/\bmidnight\b/.test(input.toLowerCase())) return "00:00";
    return null;
}

const NUMBER_WORDS: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    a: 1, couple: 2, solo: 1, alone: 1,
};

export function parseGuests(input: string): number | null {
    const t = input.toLowerCase();
    const clamp = (n: number) => (n >= 1 && n <= 20 ? n : null);

    let m = t.match(/(?:for|party of|table for|group of|book)\s+(\d{1,2})\b/);
    if (m) return clamp(Number(m[1]));

    m = t.match(/\b(\d{1,2})\s*(?:people|persons?|guests?|pax|adults?|of us|seats?)\b/);
    if (m) return clamp(Number(m[1]));

    for (const [word, value] of Object.entries(NUMBER_WORDS)) {
        if (new RegExp(`\\b${word}\\b`).test(t) && /\b(people|guests?|of us|persons?|party|table)\b/.test(t)) {
            return clamp(value);
        }
    }

    m = t.match(/^\s*(\d{1,2})\s*$/);
    if (m) return clamp(Number(m[1]));

    return null;
}

/* ════════════════════════════════════════════════════════════════════════════
   Restaurant search
   ════════════════════════════════════════════════════════════════════════════ */

const CUISINE_ALIASES: Record<string, string> = {
    italian: "Italian", pasta: "Italian", pizza: "Italian", trattoria: "Italian",
    japanese: "Japanese", sushi: "Japanese", omakase: "Japanese", sashimi: "Japanese", nikkei: "Japanese",
    french: "French", bistro: "French", parisian: "French", michelin: "French",
    vegetarian: "Vegetarian", vegan: "Vegetarian", "plant-based": "Vegetarian", plant: "Vegetarian", veggie: "Vegetarian",
    steak: "Steakhouse", steakhouse: "Steakhouse", beef: "Steakhouse", grill: "Steakhouse", meat: "Steakhouse",
};

const VIBE_HINTS = ["romantic", "rooftop", "view", "skyline", "quiet", "zen", "candle", "wine", "tasting", "organic", "outdoor", "date"];

export interface SearchResult {
    matches: RestaurantLite[];
    cuisine?: string;
    vibe?: string;
    /** True when the query only asked for "the best" with no other filter. */
    topRated: boolean;
}

export function searchRestaurants(input: string): SearchResult {
    const t = input.toLowerCase();
    const topRated = /\bbest\b|\btop\b|\bhighest\b|\bfavou?rite\b|\brecommend\b|\bsuggest\b/.test(t);
    const wantsLuxe = /\bluxur|\bsplurge|\bfine dining|\bupscale|\bspecial occasion|\bmichelin|\$\$\$\$/.test(t);
    const wantsValue = /\baffordable|\bcheap|\bbudget|\bcasual|\bmid-?range|\bnot too expensive/.test(t);

    let cuisine: string | undefined;
    for (const [alias, canonical] of Object.entries(CUISINE_ALIASES)) {
        if (t.includes(alias)) {
            cuisine = canonical;
            break;
        }
    }

    const vibe = VIBE_HINTS.find((v) => t.includes(v));

    // A named cuisine narrows the field outright — otherwise "best Japanese"
    // gets outvoted by a higher-rated French room.
    const pool = cuisine ? CATALOGUE.filter((r) => r.cuisine === cuisine) : CATALOGUE;

    const scored = (pool.length ? pool : CATALOGUE).map((r) => {
        let score = 0;
        const name = r.name.toLowerCase();

        if (t.includes(name)) score += 14;
        else if (name.split(/[^a-z]/).some((w) => w.length > 3 && t.includes(w))) score += 8;

        if (cuisine && r.cuisine === cuisine) score += 6;
        if (t.includes(r.cuisine.toLowerCase())) score += 4;

        for (const tag of r.tags) {
            if (t.includes(tag.toLowerCase())) score += 3;
        }
        if (vibe && r.tags.some((tag) => tag.toLowerCase().includes(vibe))) score += 3;
        if (vibe === "date" && r.tags.some((tag) => /romantic|candlelit/i.test(tag))) score += 3;

        if (t.includes(r.location.split(",")[0].toLowerCase())) score += 2;

        if (wantsLuxe) score += r.priceRange.length;
        if (wantsValue) score += 5 - r.priceRange.length;
        if (topRated) score += (r.rating - 4.5) * 8;

        return { r, score };
    });

    const hasFilter = Boolean(cuisine || vibe || wantsLuxe || wantsValue || topRated);
    const matches = scored
        .filter((s) => s.score > (hasFilter ? 0.5 : 3))
        .sort((a, b) => b.score - a.score || b.r.rating - a.r.rating)
        .slice(0, 3)
        .map((s) => s.r);

    return { matches, cuisine, vibe, topRated };
}

const ORDINALS: Array<[string, number]> = [
    ["first", 0], ["1st", 0], ["one on the left", 0],
    ["second", 1], ["2nd", 1], ["middle", 1],
    ["third", 2], ["3rd", 2],
    ["last", -1],
];

/** Resolves "there", "that one", "the first one" against the last results shown. */
export function resolveReference(input: string, ctx: EngineContext): RestaurantLite | undefined {
    const list = ctx.lastResults ?? [];
    if (!list.length) return undefined;
    const t = input.toLowerCase();

    for (const [word, index] of ORDINALS) {
        if (new RegExp(`\\b${word}\\b`).test(t)) return index === -1 ? list[list.length - 1] : list[index];
    }
    if (/\b(there|that one|that place|this one|the same|same place)\b/.test(t)) return list[0];
    return undefined;
}

/* ════════════════════════════════════════════════════════════════════════════
   Knowledge base
   ════════════════════════════════════════════════════════════════════════════ */

interface Topic {
    id: string;
    keys: string[];
    answer: string;
    chips?: string[];
}

const TOPICS: Topic[] = [
    {
        id: "hours",
        keys: ["hour", "open", "close", "timing", "last seating", "late"],
        answer:
            "Hours vary by venue. Most partners serve lunch 12:00–15:00 and dinner 18:30–23:00, with last seating an hour before close. The exact times and last seating are on each restaurant's page.",
        chips: ["Book a table", "Show me rooftop spots"],
    },
    {
        id: "cancel",
        keys: ["cancel", "modify", "change my booking", "reschedule", "amend"],
        answer:
            "You can change or cancel from your dashboard under My Bookings, up to two hours before the reservation. Deposit venues need six hours' notice for a full refund.",
        chips: ["My bookings", "Refund policy"],
    },
    {
        id: "dress",
        keys: ["dress", "attire", "wear", "jacket", "sneaker", "formal"],
        answer:
            "Smart casual is safe everywhere in the collection. A few of the tasting-menu rooms ask for a jacket in the evening — that's noted on the restaurant page under House Rules.",
        chips: ["Show fine dining", "Book a table"],
    },
    {
        id: "diet",
        keys: ["diet", "allerg", "vegan", "vegetarian", "gluten", "halal", "kosher", "nut", "shellfish"],
        answer:
            "Add allergies and dietary needs to the notes field when you book — the kitchen sees them before service. For severe allergies, say so and the restaurant will call you back to confirm.",
        chips: ["Show plant-based", "Book a table"],
    },
    {
        id: "events",
        keys: ["private", "event", "party", "group", "large", "buyout", "corporate", "birthday", "anniversar"],
        answer:
            "For parties over eight, or a full buy-out, send a request from the restaurant page and the venue's events lead replies within one business day. Most rooms need two weeks' notice.",
        chips: ["Show private dining", "Contact concierge"],
    },
    {
        id: "membership",
        keys: ["member", "club", "subscription", "tier", "perks", "loyalty"],
        answer:
            "Membership gets you priority release on hard-to-book tables, invitations to chef's-counter tastings, and a dedicated concierge line. It's month to month and you can pause it any time.",
        chips: ["Book a table", "What's included?"],
    },
    {
        id: "payment",
        keys: ["pay", "deposit", "card", "charge", "prepay", "bill", "cost", "price"],
        answer:
            "Most reservations are free to hold — no card needed. Tasting-menu venues take a deposit at booking, credited against your bill on the night. The page tells you before you confirm.",
        chips: ["Refund policy", "Show affordable spots"],
    },
    {
        id: "refund",
        keys: ["refund", "money back", "charged"],
        answer:
            "Cancel inside the window and the deposit returns to your original card automatically — usually within three to five business days. No form to fill in.",
        chips: ["Cancel a booking", "My bookings"],
    },
    {
        id: "location",
        keys: ["where", "near me", "location", "neighbourhood", "neighborhood", "address", "city", "parking", "transit"],
        answer:
            "Every restaurant in the collection is currently in Manhattan. Each page carries the exact address, nearest subway and whether valet is available. Search lets you filter by neighbourhood.",
        chips: ["Show me everything", "Book a table"],
    },
    {
        id: "kids",
        keys: ["kid", "child", "family", "highchair", "baby", "stroller"],
        answer:
            "Family-friendly rooms are marked on their page and can set up a high chair if you note it when booking. The counter-seating omakase rooms are 12 and over.",
        chips: ["Show family friendly", "Book a table"],
    },
    {
        id: "access",
        keys: ["wheelchair", "accessib", "step-free", "disabled", "ramp"],
        answer:
            "Step-free access and accessible restrooms are listed under House Rules on each page. Add a note to your booking and the host will hold a table with room to manoeuvre.",
        chips: ["Book a table", "Contact concierge"],
    },
    {
        id: "gift",
        keys: ["gift", "voucher", "certificate", "present"],
        answer:
            "Gift cards come in any amount, arrive by email straight away, and work at every restaurant in the collection. They don't expire.",
        chips: ["Show fine dining", "Membership perks"],
    },
    {
        id: "contact",
        keys: ["contact", "support", "human", "speak to", "phone", "email", "complain"],
        answer:
            "This chat reaches the concierge team directly. If you'd rather write, the support address is in the footer, and members get a phone line that's staffed until midnight.",
        chips: ["Book a table", "My bookings"],
    },
];

const CAPABILITIES =
    "Here's what I can do: find a restaurant by cuisine, price or mood, walk you through booking a table start to finish, pull up your existing reservations, and answer anything about hours, dress code, deposits or dietary needs.";

const DEFAULT_CHIPS = ["Book a table", "Best rated", "My bookings", "Dress code"];

/* ════════════════════════════════════════════════════════════════════════════
   Booking flow
   ════════════════════════════════════════════════════════════════════════════ */

const dateChips = () => {
    const today = startOfToday();
    return [0, 1, 2, 3].map((n) => formatDateLabel(toISODate(addDays(today, n))));
};

const guestChips = ["2 guests", "3 guests", "4 guests", "6 guests"];

function askNext(
    draft: BookingDraft,
    /** Candidates to offer when the restaurant is still unknown. */
    candidates?: RestaurantLite[],
): { draft: BookingDraft; message: OutMessage } {
    const restaurant = findBySlug(draft.slug);

    if (!draft.slug || !restaurant) {
        const options = candidates?.length ? candidates : CATALOGUE.slice(0, 3);
        const narrowed = Boolean(candidates?.length) && options.length < CATALOGUE.length;
        return {
            draft: { ...draft, awaiting: "restaurant" },
            message: {
                text: narrowed
                    ? `${options.length === 2 ? "Two" : "A few"} fit that description — which one?`
                    : "Which room would you like? Pick one below, or tell me a cuisine and I'll narrow it down.",
                restaurants: options,
                chips: narrowed
                    ? options.map((o) => o.name)
                    : ["Best rated", "Something romantic", "Rooftop"],
            },
        };
    }

    if (!draft.date) {
        return {
            draft: { ...draft, awaiting: "date" },
            message: {
                text: `${restaurant.name} it is. What day are you thinking?`,
                chips: dateChips(),
            },
        };
    }

    if (!draft.time) {
        const slots = restaurant.availableSlots.length ? restaurant.availableSlots : ["18:00", "19:00", "20:00"];
        return {
            draft: { ...draft, awaiting: "time" },
            message: {
                text: `${formatDateLabel(draft.date)} at ${restaurant.name}. These times are open:`,
                chips: slots.map(formatTime12),
            },
        };
    }

    if (!draft.guests) {
        return {
            draft: { ...draft, awaiting: "guests" },
            message: {
                text: "How many of you will there be?",
                chips: guestChips,
            },
        };
    }

    const ready: BookingDraft = { ...draft, name: restaurant.name, awaiting: "confirm" };
    return {
        draft: ready,
        message: {
            text: "Here's your table. Confirm and I'll take you to checkout.",
            draft: ready,
            chips: ["Confirm booking", "Change the time", "Start over"],
        },
    };
}

function bookingUrl(draft: BookingDraft) {
    const params = new URLSearchParams({
        date: draft.date ?? "",
        slot: draft.time ?? "",
        guests: String(draft.guests ?? 2),
    });
    return `/booking/${draft.slug}?${params.toString()}`;
}

/* ════════════════════════════════════════════════════════════════════════════
   Engine
   ════════════════════════════════════════════════════════════════════════════ */

const ABORT = /\b(never ?mind|forget it|stop|cancel that|start over|reset|nvm)\b/i;

export function greeting(ctx: EngineContext): OutMessage {
    const who = ctx.userName ? `, ${ctx.userName.split(" ")[0]}` : "";
    return {
        text: `Good to see you${who}. I'm the QuickDine concierge — I can find you a room, hold a table, or pull up a booking you've already made.`,
        chips: DEFAULT_CHIPS,
    };
}

export function respond(input: string, ctx: EngineContext): EngineResult {
    const text = input.trim();
    const t = text.toLowerCase();
    let draft = ctx.draft;

    // ── Escape hatch, available at any point ─────────────────────────────────
    if (ABORT.test(t)) {
        return {
            draft: null,
            messages: [{ text: "Cleared that. What would you like to do instead?", chips: DEFAULT_CHIPS }],
        };
    }

    // ── Mid-flow slot filling ────────────────────────────────────────────────
    if (draft?.awaiting) {
        if (draft.awaiting === "confirm") {
            if (/\b(confirm|yes|yep|book it|go ahead|do it|sounds good|perfect)\b/.test(t)) {
                if (!ctx.isAuthenticated) {
                    return {
                        draft,
                        action: { type: "auth" },
                        messages: [
                            {
                                text: "One step first — sign in so the table is held under your name. I've opened the sign-in panel and I'll keep this booking right here.",
                                chips: ["Confirm booking", "Start over"],
                            },
                        ],
                    };
                }
                const url = bookingUrl(draft);
                const label = `${draft.name} · ${formatDateLabel(draft.date!)} at ${formatTime12(draft.time!)} · ${draft.guests} ${
                    draft.guests === 1 ? "guest" : "guests"
                }`;
                return {
                    draft: null,
                    action: { type: "navigate", to: url },
                    messages: [
                        {
                            text: `Holding ${label}. Taking you to checkout to add your details — the table is yours once you confirm there.`,
                            chips: ["Book another table", "My bookings"],
                        },
                    ],
                };
            }

            if (/\b(change|different|another|edit)\b/.test(t)) {
                if (/\btime\b|\bslot\b|\bhour\b/.test(t)) {
                    const next = askNext({ ...draft, time: undefined, awaiting: null });
                    return { draft: next.draft, messages: [next.message] };
                }
                if (/\bdate\b|\bday\b/.test(t)) {
                    const next = askNext({ ...draft, date: undefined, time: undefined, awaiting: null });
                    return { draft: next.draft, messages: [next.message] };
                }
                if (/\bguest|\bpeople|\bparty|\bsize\b/.test(t)) {
                    const next = askNext({ ...draft, guests: undefined, awaiting: null });
                    return { draft: next.draft, messages: [next.message] };
                }
                return {
                    draft,
                    messages: [{ text: "Which part — the date, the time, or the party size?", chips: ["Change the date", "Change the time", "Change party size"] }],
                };
            }
        }

        // Try to read whatever the flow is waiting for out of this message.
        const next: BookingDraft = { ...draft };
        let filled = false;

        if (draft.awaiting === "restaurant") {
            const { matches } = searchRestaurants(text);
            const referenced = resolveReference(text, ctx);
            if (referenced && matches.length !== 1) {
                next.slug = referenced.slug;
                next.name = referenced.name;
                filled = true;
            } else if (matches.length === 1) {
                next.slug = matches[0].slug;
                next.name = matches[0].name;
                filled = true;
            } else if (matches.length > 1) {
                return {
                    draft: { ...draft, awaiting: "restaurant" },
                    messages: [
                        {
                            text: "A few fit that. Which one?",
                            restaurants: matches,
                            chips: matches.map((m) => m.name),
                        },
                    ],
                };
            }
        }

        if (draft.awaiting === "date" || (!next.date && parseDate(text))) {
            const date = parseDate(text);
            if (date) {
                next.date = date;
                filled = true;
            }
        }

        if (!next.time) {
            const time = parseTime(text);
            if (time) {
                next.time = time;
                filled = true;
            }
        }

        if (!next.guests) {
            const guests = parseGuests(text);
            if (guests) {
                next.guests = guests;
                filled = true;
            }
        }

        if (filled) {
            const step = askNext({ ...next, awaiting: null });
            return { draft: step.draft, messages: [step.message] };
        }

        // Couldn't read it — offer a nudge rather than dropping the flow.
        const nudge: Record<string, OutMessage> = {
            restaurant: { text: "I didn't catch which restaurant. Tap one of these, or name a cuisine.", restaurants: CATALOGUE.slice(0, 3), chips: ["Best rated", "Italian", "Japanese"] },
            date: { text: "I need a day to work with — something like \"Friday\", \"tomorrow\" or \"12 Sep\".", chips: dateChips() },
            time: { text: "Give me a time, like \"7pm\" or \"19:30\".", chips: (findBySlug(next.slug)?.availableSlots ?? ["18:00", "19:00", "20:00"]).map(formatTime12) },
            guests: { text: "How many seats should I hold?", chips: guestChips },
            confirm: { text: "Say the word and I'll hold it, or tell me what to change.", chips: ["Confirm booking", "Change the time", "Start over"] },
        };
        return { draft, messages: [nudge[draft.awaiting] ?? { text: CAPABILITIES, chips: DEFAULT_CHIPS }] };
    }

    // ── Fresh intents ────────────────────────────────────────────────────────

    if (/^(hi|hey|hello|yo|good (morning|afternoon|evening))\b/.test(t)) {
        return { draft: null, messages: [greeting(ctx)] };
    }

    if (/\b(thanks|thank you|cheers|appreciate)\b/.test(t)) {
        return {
            draft: null,
            messages: [{ text: "Any time. Anything else I can line up for you?", chips: DEFAULT_CHIPS }],
        };
    }

    if (/\b(bye|goodbye|see you|that's all|thats all)\b/.test(t)) {
        return { draft: null, messages: [{ text: "Enjoy your dinner. I'll be here when you need the next table.", chips: ["Book a table"] }] };
    }

    if (/\b(help|what can you do|options|menu of|capabilit)\b/.test(t)) {
        return { draft: null, messages: [{ text: CAPABILITIES, chips: DEFAULT_CHIPS }] };
    }

    // My bookings
    if (/\b(my booking|my reservation|upcoming|do i have|my table)\b/.test(t)) {
        if (!ctx.isAuthenticated) {
            return {
                draft: null,
                action: { type: "auth" },
                messages: [{ text: "Sign in and I'll pull up your reservations — the panel is open.", chips: ["Book a table"] }],
            };
        }
        const bookings: BookingLite[] = ctx.bookings ?? [];
        return {
            draft: null,
            messages: [
                {
                    text: bookings.length
                        ? `You have ${bookings.length} reservation${bookings.length === 1 ? "" : "s"} on the books.`
                        : "Nothing booked yet. Want me to find you a table?",
                    bookings,
                    chips: ["Book a table", "Cancellation policy"],
                },
            ],
        };
    }

    // Booking intent
    if (/\b(book|reserve|reservation|table|seat|hold a|get me in)\b/.test(t)) {
        const { matches } = searchRestaurants(text);
        const seed: BookingDraft = { awaiting: null };

        const referenced = resolveReference(text, ctx);

        if (matches.length === 1) {
            seed.slug = matches[0].slug;
            seed.name = matches[0].name;
        } else if (referenced) {
            seed.slug = referenced.slug;
            seed.name = referenced.name;
        } else if (ctx.routeSlug && findBySlug(ctx.routeSlug)) {
            seed.slug = ctx.routeSlug;
            seed.name = findBySlug(ctx.routeSlug)!.name;
        }

        const date = parseDate(text);
        if (date) seed.date = date;
        const time = parseTime(text);
        if (time) seed.time = time;
        const guests = parseGuests(text);
        if (guests) seed.guests = guests;

        const step = askNext(seed, matches);
        return { draft: step.draft, messages: [step.message] };
    }

    // Restaurant discovery
    const search = searchRestaurants(text);
    const looksLikeSearch =
        search.matches.length > 0 &&
        /\b(show|find|looking for|any|where|recommend|suggest|best|good|restaurant|place|spot|dinner|lunch|eat|food|cuisine|italian|japanese|sushi|french|steak|vegan|vegetarian|rooftop|romantic)\b/.test(t);

    if (looksLikeSearch) {
        const descriptor = search.cuisine
            ? `${search.cuisine.toLowerCase()} rooms`
            : search.vibe
              ? `${search.vibe} rooms`
              : "rooms";
        return {
            draft: null,
            messages: [
                {
                    text: search.topRated
                        ? `The highest-rated ${descriptor} in the collection right now:`
                        : `Three ${descriptor} worth your evening:`,
                    restaurants: search.matches,
                    chips: ["Book the first one", "Show something else", "Dress code"],
                },
            ],
        };
    }

    if (/\b(something else|other options|anything else|more options|show more|different)\b/.test(t)) {
        const seen = new Set((ctx.lastResults ?? []).map((r) => r.slug));
        const rest = CATALOGUE.filter((r) => !seen.has(r.slug)).sort((a, b) => b.rating - a.rating);
        if (rest.length) {
            return {
                draft: null,
                messages: [
                    {
                        text: "Then try these instead:",
                        restaurants: rest.slice(0, 3),
                        chips: ["Book the first one", "Best rated", "Dress code"],
                    },
                ],
            };
        }
    }

    if (/\bshow me everything\b|\ball restaurants\b|\bfull list\b|\bbrowse\b/.test(t)) {
        return {
            draft: null,
            action: { type: "navigate", to: "/search" },
            messages: [{ text: "Opening the full collection with filters for cuisine, price and neighbourhood.", chips: DEFAULT_CHIPS }],
        };
    }

    // Knowledge base
    const topic = TOPICS.find((topicItem) => topicItem.keys.some((key) => t.includes(key)));
    if (topic) {
        return { draft: null, messages: [{ text: topic.answer, chips: topic.chips ?? DEFAULT_CHIPS }] };
    }

    // Fallback — offer the nearest thing rather than a dead end.
    if (search.matches.length) {
        return {
            draft: null,
            messages: [
                {
                    text: "Not sure I follow, but these felt close to what you're after:",
                    restaurants: search.matches,
                    chips: DEFAULT_CHIPS,
                },
            ],
        };
    }

    return {
        draft: null,
        messages: [
            {
                text: `That one's outside what I know. ${CAPABILITIES}`,
                chips: DEFAULT_CHIPS,
            },
        ],
    };
}
