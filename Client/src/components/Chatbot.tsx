import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";

interface Message {
    id: number;
    text: string;
    from: "bot" | "user";
    time: string;
}

const quickReplies = ["Reservations", "Opening hours", "Cancellation", "Dress code", "Private events", "Dietary needs"];

const responseMap: Record<string, string> = {
    reservation:
        "You can reserve a table directly from any restaurant page using the booking widget, or tell me the city and date and I can point you in the right direction.",
    book: "To book a table, open a restaurant's page, choose your date, time and party size, then confirm your reservation.",
    hour: "Most of our partner restaurants are open for lunch from 12:00 to 15:00 and dinner from 18:30 to 23:00, though hours vary by venue.",
    open: "Opening hours vary by restaurant. Check the restaurant's detail page for exact timings and last seating.",
    cancel: "You can cancel or modify a booking from your dashboard under My Bookings, up to a few hours before your reservation time.",
    dress: "Most of our fine dining partners suggest smart casual to formal attire. Individual dress codes are listed on each restaurant page.",
    event: "For private dining and events, use the contact option on the restaurant page or submit a request through your dashboard.",
    diet: "Let the restaurant know about allergies or dietary preferences in the booking notes, and their kitchen will accommodate where possible.",
    vegan: "Many of our partner restaurants offer vegan and vegetarian tasting menus, noted on their restaurant page under cuisine details.",
    payment: "Reservations don't require prepayment for most venues, though some premium experiences may need a deposit at booking.",
    refund: "Refunds for prepaid or deposit bookings are processed automatically once a cancellation is confirmed in your dashboard.",
    member: "Our membership tier gives you priority reservations, curated invites and exclusive tasting events at partner restaurants.",
    contact: "You can reach our concierge team any time through this chat, or the support details listed in the footer.",
    location: "Use the search page to filter restaurants by city, cuisine or neighborhood to find something near you.",
};

const defaultReply =
    "I can help with reservations, hours, cancellations, dress code, private events and dietary needs. Ask me anything about your dining experience.";

function getBotReply(input: string): string {
    const text = input.toLowerCase();
    const match = Object.keys(responseMap).find((key) => text.includes(key));
    return match ? responseMap[match] : defaultReply;
}

function timeNow() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Chatbot() {
    const [open, setOpen] = useState(false);
    const [unread, setUnread] = useState(1);
    const [typing, setTyping] = useState(false);
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 1,
            from: "bot",
            text: "Welcome to QuickDine. I'm your dining concierge — ask me about reservations, hours, dress code or anything else.",
            time: timeNow(),
        },
    ]);
    const bodyRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, typing]);

    const handleToggle = () => {
        setOpen((prev) => !prev);
        setUnread(0);
    };

    const sendMessage = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;

        const userMsg: Message = { id: Date.now(), from: "user", text: trimmed, time: timeNow() };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setTyping(true);

        setTimeout(() => {
            const botMsg: Message = { id: Date.now() + 1, from: "bot", text: getBotReply(trimmed), time: timeNow() };
            setMessages((prev) => [...prev, botMsg]);
            setTyping(false);
            if (!open) setUnread((prev) => prev + 1);
        }, 700 + Math.random() * 400);
    };

    return (
        <div className="fixed bottom-35 right-6 z-50 flex flex-col items-end gap-4">
            {open && (
                <div className="w-[340px] max-w-[88vw] h-[480px] max-h-[75vh] bg-surface-container-lowest border border-secondary/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-slide-up">
                    <div className="bg-primary text-on-primary px-5 py-4 flex items-center justify-between shrink-0">
                        <div>
                            <p className="font-display text-base leading-tight">Dining Concierge</p>
                            <p className="text-[11px] uppercase tracking-widest opacity-70">Always here to help</p>
                        </div>
                        <button
                            onClick={handleToggle}
                            aria-label="Close chat"
                            className="p-1.5 rounded-full hover:bg-on-primary/10 transition-colors cursor-pointer"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 bg-surface-container-low">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                    msg.from === "user"
                                        ? "bg-secondary text-on-secondary self-end rounded-br-sm"
                                        : "bg-surface-container-lowest border border-outline-variant/30 text-on-surface self-start rounded-bl-sm"
                                }`}
                            >
                                {msg.text}
                                <span className="block text-[10px] opacity-60 mt-1">{msg.time}</span>
                            </div>
                        ))}

                        {typing && (
                            <div className="self-start bg-surface-container-lowest border border-outline-variant/30 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                                <span className="size-1.5 rounded-full bg-secondary animate-bounce-subtle" />
                                <span className="size-1.5 rounded-full bg-secondary animate-bounce-subtle [animation-delay:.15s]" />
                                <span className="size-1.5 rounded-full bg-secondary animate-bounce-subtle [animation-delay:.3s]" />
                            </div>
                        )}
                    </div>

                    <div className="px-3 pt-3 flex gap-2 flex-wrap shrink-0 border-t border-outline-variant/20 bg-surface-container-lowest">
                        {quickReplies.map((reply) => (
                            <button
                                key={reply}
                                onClick={() => sendMessage(reply)}
                                className="text-[11px] px-3 py-1.5 rounded-full border border-secondary/40 text-secondary hover:bg-secondary hover:text-on-secondary transition-colors cursor-pointer"
                            >
                                {reply}
                            </button>
                        ))}
                    </div>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            sendMessage(input);
                        }}
                        className="flex items-center gap-2 p-3 shrink-0 bg-surface-container-lowest"
                    >
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Type a message..."
                            className="flex-1 bg-surface-container-low border border-outline-variant/30 rounded-full px-4 py-2.5 text-sm text-on-surface placeholder:text-black/55 focus:outline-none focus:border-secondary"
                        />
                        <button
                            type="submit"
                            aria-label="Send message"
                            className="size-10 rounded-full bg-secondary text-on-secondary flex items-center justify-center shrink-0 hover:opacity-90 transition-opacity cursor-pointer"
                        >
                            <Send size={16} />
                        </button>
                    </form>
                </div>
            )}

            <button
                onClick={handleToggle}
                aria-label="Open chat"
                className="relative size-20 rounded-full bg-gradient-to-br from-secondary to-primary text-on-secondary shadow-xl border border-secondary/50 flex items-center justify-center hover:-translate-y-1 transition-transform cursor-pointer"
            >
                {open ? <X size={22} /> : <MessageCircle size={22} />}
                {!open && unread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-error text-on-error text-[11px] font-semibold flex items-center justify-center">
                        {unread}
                    </span>
                )}
            </button>
        </div>
    );
}
