import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    ArrowDown,
    Calendar,
    Check,
    ChevronRight,
    Eraser,
    Maximize2,
    MessageCircle,
    Minimize2,
    Send,
    Sparkles,
    Star,
    Users,
    X,
} from "lucide-react";
import { useAppContext } from "../context/AppContext.tsx";
import { formatDateLabel, formatTime12, greeting, hydrateCatalogue, respond } from "./chat/chatEngine.ts";
import type { BookingDraft, BookingLite, Message, OutMessage, RestaurantLite } from "./chat/types.ts";
import { getMyBookings, getRestaurants } from "../api.ts";

const STORAGE_KEY = "qd:concierge:v1";
const MAX_STORED = 60;

let seq = 0;
const nextId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

const timeStamp = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

interface Persisted {
    messages: Message[];
    draft: BookingDraft | null;
}

function loadPersisted(): Persisted | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Persisted;
        if (!Array.isArray(parsed.messages) || !parsed.messages.length) return null;
        return parsed;
    } catch {
        return null;
    }
}

export default function Chatbot() {
    const { user, isAuthenticated, setAuthModalOpen } = useAppContext();

    // The assistant answers from live data: the approved venue list, and the
    // signed-in diner's own reservations.
    const bookingsRef = useRef<BookingLite[]>([]);

    useEffect(() => {
        let cancelled = false;
        getRestaurants({ limit: 60 })
            .then((venues) => {
                if (!cancelled) hydrateCatalogue(venues);
            })
            .catch(() => {
                // Offline API: the bot simply has nothing to recommend.
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        if (!isAuthenticated) {
            bookingsRef.current = [];
            return;
        }
        getMyBookings()
            .then((rows) => {
                if (cancelled) return;
                bookingsRef.current = rows.map((b) => ({
                    bookingId: b.bookingId,
                    name: b.restaurant?.name ?? "Removed restaurant",
                    slug: b.restaurant?.slug ?? "",
                    image: b.restaurant?.image ?? "",
                    date: String(b.date).slice(0, 10),
                    time: b.time,
                    guests: b.guests,
                    status: b.status,
                }));
            })
            .catch(() => {
                bookingsRef.current = [];
            });
        return () => {
            cancelled = true;
        };
    }, [isAuthenticated]);
    const navigate = useNavigate();
    const location = useLocation();

    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [unread, setUnread] = useState(1);
    const [typing, setTyping] = useState(false);
    const [input, setInput] = useState("");
    const [atBottom, setAtBottom] = useState(true);
    const [draft, setDraft] = useState<BookingDraft | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);

    const bodyRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const openRef = useRef(open);
    openRef.current = open;
    /** Cards from the last bot reply, so follow-ups like "book the first one" work. */
    const lastResultsRef = useRef<RestaurantLite[]>([]);

    const routeSlug = useMemo(() => {
        const match = location.pathname.match(/^\/(?:restaurant|booking)\/([^/]+)/);
        return match?.[1];
    }, [location.pathname]);

    // ── Boot: restore or greet ───────────────────────────────────────────────
    useEffect(() => {
        const saved = loadPersisted();
        if (saved) {
            setMessages(saved.messages);
            setDraft(saved.draft);
            setUnread(0);
            const shown = [...saved.messages].reverse().find((m) => m.restaurants?.length);
            if (shown?.restaurants) lastResultsRef.current = shown.restaurants;
            return;
        }
        const hello = greeting({ isAuthenticated, userName: user?.name, draft: null });
        setMessages([{ id: nextId(), from: "bot", ts: Date.now(), ...hello }]);
    }, [isAuthenticated, user?.name]);

    useEffect(() => {
        if (!messages.length) return;
        try {
            const payload: Persisted = { messages: messages.slice(-MAX_STORED), draft };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
            /* storage blocked or full — the chat still works in memory */
        }
    }, [messages, draft]);

    // ── Autoscroll ───────────────────────────────────────────────────────────
    const scrollToEnd = useCallback((smooth = true) => {
        const el = bodyRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    }, []);

    useEffect(() => {
        if (open && atBottom) scrollToEnd();
    }, [messages, typing, open, atBottom, scrollToEnd]);

    const onScroll = () => {
        const el = bodyRef.current;
        if (!el) return;
        setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
    };

    // ── Keyboard ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && openRef.current) setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    useEffect(() => {
        if (!open) return;
        setUnread(0);
        const id = window.setTimeout(() => inputRef.current?.focus(), 320);
        return () => window.clearTimeout(id);
    }, [open]);

    // ── Sending ──────────────────────────────────────────────────────────────
    const send = useCallback(
        (value: string) => {
            const trimmed = value.trim();
            if (!trimmed || typing) return;

            setMessages((prev) => [...prev, { id: nextId(), from: "user", text: trimmed, ts: Date.now() }]);
            setInput("");
            setAtBottom(true);
            setTyping(true);

            const delay = 420 + Math.min(trimmed.length * 12, 520);
            window.setTimeout(() => {
                const result = respond(trimmed, {
                    isAuthenticated,
                    userName: user?.name,
                    routeSlug,
                    draft,
                    lastResults: lastResultsRef.current,
                    bookings: bookingsRef.current,
                });

                const shown = [...result.messages].reverse().find((m) => m.restaurants?.length);
                if (shown?.restaurants) lastResultsRef.current = shown.restaurants;

                setDraft(result.draft);
                setTyping(false);
                setMessages((prev) => [
                    ...prev,
                    ...result.messages.map((m: OutMessage) => ({
                        id: nextId(),
                        from: "bot" as const,
                        ts: Date.now(),
                        ...m,
                    })),
                ]);
                if (!openRef.current) setUnread((n) => n + result.messages.length);

                if (result.action?.type === "auth") setAuthModalOpen(true);
                if (result.action?.type === "navigate") {
                    const to = result.action.to;
                    window.setTimeout(() => navigate(to), 500);
                }
            }, delay);
        },
        [draft, isAuthenticated, navigate, routeSlug, setAuthModalOpen, typing, user?.name],
    );

    const clearChat = () => {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
        setDraft(null);
        lastResultsRef.current = [];
        const hello = greeting({ isAuthenticated, userName: user?.name, draft: null });
        setMessages([{ id: nextId(), from: "bot", ts: Date.now(), ...hello }]);
    };

    const lastBot = [...messages].reverse().find((m) => m.from === "bot");
    const chips = !typing && lastBot?.chips ? lastBot.chips : [];

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
            {open && (
                <div
                    className={`lux-glass animate-panel-in relative flex flex-col overflow-hidden rounded-[28px] ${
                        expanded ? "h-[76vh] w-[min(94vw,30rem)]" : "h-[min(32rem,72vh)] w-[min(92vw,23rem)]"
                    }`}
                    style={{ transition: "width .5s var(--qd-ease-silk), height .5s var(--qd-ease-silk)" }}
                    role="dialog"
                    aria-label="Dining concierge"
                >
                    {/* Header */}
                    <header className="border-secondary/20 flex shrink-0 items-center gap-3 border-b px-4 py-3.5">
                        <span
                            className="animate-wobble relative grid size-10 shrink-0 place-items-center rounded-full"
                            style={{
                                background: "radial-gradient(circle at 32% 28%, #fff6dc, #e9c05a 45%, #a9790f 100%)",
                                boxShadow: "0 6px 18px -6px rgba(169,121,15,.7), inset 0 1px 0 rgba(255,255,255,.6)",
                            }}
                        >
                            <svg viewBox="0 0 280 280" className="size-5" fill="none" aria-hidden="true">
                                <path
                                    d="M140 90.7C118.8 90.7 98.4 99.2 83.4 114.2 68.4 129.1 60 149.5 60 170.7l27.1 6.3c34.8 8 71 8 105.8 0l27.1-6.3c0-21.2-8.4-41.6-23.4-56.5-15-15-35.4-23.5-56.6-23.5zm0 0V60m-18.5 0h37M60 206.7l27.1 6.3c34.8 8 71 8 105.8 0l27.1-6.3"
                                    stroke="#1a1508"
                                    strokeWidth={16}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </span>

                        <div className="min-w-0 flex-1">
                            <p className="font-display text-on-surface truncate text-[15px] leading-tight">
                                Dining Concierge
                            </p>
                            <p className="text-secondary/80 flex items-center gap-1.5 text-[10px] tracking-[0.16em] uppercase">
                                <span
                                    className="size-1.5 rounded-full bg-emerald-400"
                                    style={{ animation: "qdBreathe 2.4s ease-in-out infinite" }}
                                />
                                {draft?.awaiting ? "Holding a table" : "Online"}
                            </p>
                        </div>

                        <button
                            onClick={clearChat}
                            aria-label="Clear conversation"
                            title="Clear conversation"
                            className="bubble-tap text-on-surface/45 hover:text-secondary hover:bg-secondary/10 grid size-8 cursor-pointer place-items-center rounded-full"
                        >
                            <Eraser size={15} />
                        </button>
                        <button
                            onClick={() => setExpanded((v) => !v)}
                            aria-label={expanded ? "Shrink panel" : "Expand panel"}
                            title={expanded ? "Shrink panel" : "Expand panel"}
                            className="bubble-tap text-on-surface/45 hover:text-secondary hover:bg-secondary/10 hidden size-8 cursor-pointer place-items-center rounded-full sm:grid"
                        >
                            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                        </button>
                        <button
                            onClick={() => setOpen(false)}
                            aria-label="Close chat"
                            className="bubble-tap text-on-surface/45 hover:text-secondary hover:bg-secondary/10 grid size-8 cursor-pointer place-items-center rounded-full"
                        >
                            <X size={17} />
                        </button>
                    </header>

                    {/* Transcript */}
                    <div
                        ref={bodyRef}
                        onScroll={onScroll}
                        role="log"
                        aria-live="polite"
                        className="scroll-thin flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-4"
                    >
                        {messages.map((msg) => (
                            <MessageRow key={msg.id} msg={msg} onSend={send} navigate={navigate} />
                        ))}

                        {typing && (
                            <div className="animate-bubble-in border-outline-variant/25 bg-surface-container-lowest/80 flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-md border px-4 py-3">
                                {[0, 1, 2].map((i) => (
                                    <span
                                        key={i}
                                        className="bg-secondary size-1.5 rounded-full"
                                        style={{ animation: `qdTypingBob 1.1s ${i * 0.14}s ease-in-out infinite` }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {!atBottom && (
                        <button
                            onClick={() => scrollToEnd()}
                            className="bg-primary text-on-primary bubble-tap absolute bottom-32 left-1/2 z-10 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] shadow-lg"
                        >
                            <ArrowDown size={12} /> Latest
                        </button>
                    )}

                    {/* Suggested replies */}
                    {chips.length > 0 && (
                        <div className="scroll-thin border-outline-variant/15 flex shrink-0 gap-2 overflow-x-auto border-t px-3 py-2.5">
                            {chips.map((chip, i) => (
                                <button
                                    key={chip}
                                    onClick={() => send(chip)}
                                    className="border-secondary/40 text-secondary hover:bg-secondary hover:text-on-secondary bubble-tap animate-bubble-in shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-[11px] whitespace-nowrap"
                                    style={{ animationDelay: `${i * 45}ms` }}
                                >
                                    {chip}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Composer */}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            send(input);
                        }}
                        className="border-outline-variant/15 flex shrink-0 items-center gap-2 border-t p-3"
                    >
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={
                                draft?.awaiting === "date"
                                    ? "Try “Friday” or “tomorrow”…"
                                    : "Ask about a table, a room, a rule…"
                            }
                            aria-label="Message the concierge"
                            className="bg-surface-container-low/60 border-outline-variant/30 text-on-surface placeholder:text-on-surface/35 focus:border-secondary min-w-0 flex-1 rounded-full border px-4 py-2.5 text-sm focus:shadow-[0_0_0_3px_rgba(233,192,90,0.3)] focus:outline-none focus-visible:outline-none"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || typing}
                            aria-label="Send message"
                            className="text-on-secondary bubble-tap grid size-10 shrink-0 cursor-pointer place-items-center rounded-full disabled:cursor-default disabled:opacity-35"
                            style={{
                                background: "linear-gradient(140deg, #f0cf74, #d9ae3f 55%, #a9790f)",
                                boxShadow: "0 8px 20px -8px rgba(169,121,15,.8), inset 0 1px 0 rgba(255,255,255,.5)",
                            }}
                        >
                            <Send size={15} />
                        </button>
                    </form>
                </div>
            )}

            {/* Launcher */}
            <button
                onClick={() => setOpen((v) => !v)}
                aria-label={open ? "Close concierge" : "Open concierge"}
                aria-expanded={open}
                className="group bubble-motion relative grid size-16 cursor-pointer place-items-center rounded-full"
                style={{
                    background: "radial-gradient(circle at 32% 26%, #fff6dc, #e9c05a 42%, #a9790f 78%, #6e4e0a 100%)",
                    boxShadow:
                        "0 18px 34px -12px rgba(169,121,15,.75), inset 0 2px 0 rgba(255,255,255,.55), inset 0 -6px 14px rgba(110,78,10,.5)",
                }}
            >
                <span
                    className="pointer-events-none absolute inset-0 rounded-full"
                    style={{
                        boxShadow: "0 0 0 1px rgba(233,192,90,.5)",
                        animation: "qdBreathe 3.4s ease-in-out infinite",
                    }}
                />
                <span className="text-[#1a1508] transition-transform duration-500 ease-[cubic-bezier(0.34,1.42,0.5,1)] group-hover:rotate-12">
                    {open ? <X size={22} /> : <MessageCircle size={22} />}
                </span>

                {!open && unread > 0 && (
                    <span className="bg-error text-on-error animate-bubble-in absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full text-[11px] font-semibold">
                        {unread}
                    </span>
                )}
            </button>
        </div>
    );
}


function MessageRow({
    msg,
    onSend,
    navigate,
}: {
    msg: Message;
    onSend: (v: string) => void;
    navigate: (to: string) => void;
}) {
    const isUser = msg.from === "user";

    return (
        <div className={`animate-bubble-in flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}>
            <div
                className={`max-w-[86%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                    isUser
                        ? "text-on-secondary rounded-br-md"
                        : "border-outline-variant/25 bg-surface-container-lowest/85 text-on-surface rounded-bl-md border"
                }`}
                style={
                    isUser
                        ? {
                              background: "linear-gradient(140deg, #f0cf74, #d9ae3f 60%, #a9790f)",
                              boxShadow: "0 8px 18px -10px rgba(169,121,15,.85), inset 0 1px 0 rgba(255,255,255,.45)",
                          }
                        : undefined
                }
            >
                {msg.text}
                <span className="mt-1 block text-[10px] opacity-55">{timeStamp(msg.ts)}</span>
            </div>

            {/* Restaurant results */}
            {msg.restaurants?.length ? (
                <div className="scroll-thin -mx-1 flex w-full gap-2 overflow-x-auto px-1 pb-1">
                    {msg.restaurants.map((r) => (
                        <article
                            key={r.slug}
                            className="lux-glass gold-sheen bubble-motion w-[190px] shrink-0 overflow-hidden rounded-2xl"
                        >
                            <div className="relative h-[84px] overflow-hidden">
                                <img src={r.image} alt="" className="size-full object-cover" loading="lazy" />
                                <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-[#ffe7a3] backdrop-blur-sm">
                                    <Star size={9} className="fill-current" />
                                    {r.rating}
                                </span>
                            </div>
                            <div className="p-2.5">
                                <p className="font-display text-on-surface truncate text-[13px]">{r.name}</p>
                                <p className="text-on-surface/50 mt-0.5 truncate text-[10px] tracking-wide uppercase">
                                    {r.cuisine} · {r.priceRange} · {r.location.split(",")[0]}
                                </p>
                                <div className="mt-2 flex gap-1.5">
                                    <button
                                        onClick={() => navigate(`/restaurant/${r.slug}`)}
                                        className="border-outline-variant/40 text-on-surface/70 hover:border-secondary hover:text-secondary bubble-tap flex-1 cursor-pointer rounded-full border py-1 text-[10px]"
                                    >
                                        View
                                    </button>
                                    <button
                                        onClick={() => onSend(`Book a table at ${r.name}`)}
                                        className="bg-secondary text-on-secondary bubble-tap flex flex-1 cursor-pointer items-center justify-center gap-0.5 rounded-full py-1 text-[10px] font-medium"
                                    >
                                        Book <ChevronRight size={10} />
                                    </button>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            ) : null}

            {/* Existing reservations */}
            {msg.bookings?.length ? (
                <div className="flex w-full flex-col gap-1.5">
                    {msg.bookings.map((b) => (
                        <button
                            key={b.bookingId}
                            onClick={() => navigate("/dashboard")}
                            className="lux-glass bubble-motion flex w-full cursor-pointer items-center gap-2.5 rounded-2xl p-2 text-left"
                        >
                            <img
                                src={b.image}
                                alt=""
                                className="size-10 shrink-0 rounded-xl object-cover"
                                loading="lazy"
                            />
                            <span className="min-w-0 flex-1">
                                <span className="font-display text-on-surface block truncate text-[12px]">{b.name}</span>
                                <span className="text-on-surface/50 block truncate text-[10px]">
                                    {formatDateLabel(b.date)} · {formatTime12(b.time)} · {b.guests} guests
                                </span>
                            </span>
                            <span className="text-secondary shrink-0 rounded-full border border-current px-2 py-0.5 text-[9px] tracking-wider uppercase">
                                {b.status}
                            </span>
                        </button>
                    ))}
                </div>
            ) : null}

            {/* Booking summary */}
            {msg.draft?.slug ? (
                <div className="lux-glass w-full rounded-2xl p-3">
                    <p className="text-secondary flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase">
                        <Sparkles size={11} /> Table on hold
                    </p>
                    <p className="font-display text-on-surface mt-1.5 text-[15px]">{msg.draft.name}</p>
                    <div className="text-on-surface/60 mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]">
                        <span className="flex items-center gap-1.5">
                            <Calendar size={11} className="text-secondary" />
                            {msg.draft.date ? formatDateLabel(msg.draft.date) : "—"}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Check size={11} className="text-secondary" />
                            {msg.draft.time ? formatTime12(msg.draft.time) : "—"}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Users size={11} className="text-secondary" />
                            {msg.draft.guests} {msg.draft.guests === 1 ? "guest" : "guests"}
                        </span>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
