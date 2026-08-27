import { useEffect, useState, type CSSProperties } from "react";
import { useAppContext, type AccountTransition } from "../../context/AppContext.tsx";

const HOLD_MS = 1550;
const EXIT_MS = 520;
const MOTE_COUNT = 22;
const GOLDEN_ANGLE = 2.399963;

const ROLE_LABEL: Record<string, string> = {
    user: "Guest",
    owner: "Restaurant Partner",
    admin: "Administrator",
};

const MOTES = Array.from({ length: MOTE_COUNT }, (_, i) => {
    const angle = i * GOLDEN_ANGLE;
    const reach = 72 + ((i * 37) % 104);
    return {
        x: `${Math.round(Math.cos(angle) * reach)}px`,
        y: `${Math.round(Math.sin(angle) * reach * 0.62)}px`,
        size: 3 + ((i * 13) % 9) * 0.5,
        delay: 240 + ((i * 53) % 300),
    };
});

function initial(name: string) {
    return name.trim().charAt(0) || "Q";
}

export default function AccountSwitch() {
    const { accountTransition, clearAccountTransition } = useAppContext();
    const [exiting, setExiting] = useState<AccountTransition | null>(null);

    useEffect(() => {
        if (!accountTransition) return;

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            const skip = window.setTimeout(clearAccountTransition, 350);
            return () => window.clearTimeout(skip);
        }

        const restoreOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const exit = window.setTimeout(() => setExiting(accountTransition), HOLD_MS);
        const done = window.setTimeout(clearAccountTransition, HOLD_MS + EXIT_MS);

        return () => {
            window.clearTimeout(exit);
            window.clearTimeout(done);
            document.body.style.overflow = restoreOverflow;
        };
    }, [accountTransition, clearAccountTransition]);

    if (!accountTransition) return null;

    const { kind, from, to } = accountTransition;
    const switching = kind === "switch" && !!from;
    const leaving = exiting === accountTransition;

    return (
        <div className={`qd-handover ${leaving ? "qd-handover--out" : ""}`} role="status" aria-live="polite">
            <div className="qd-handover__veil" />

            <div className="qd-handover__stage">
                <span className="qd-handover__halo" />

                <svg className="qd-handover__ring" viewBox="0 0 140 140" aria-hidden="true">
                    <defs>
                        <linearGradient id="qdHandoverArc" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#a9790f" />
                            <stop offset="45%" stopColor="#e9c05a" />
                            <stop offset="100%" stopColor="#fff4d2" />
                        </linearGradient>
                    </defs>
                    <circle className="qd-handover__ring-track" cx="70" cy="70" r="62" />
                    <circle className="qd-handover__ring-arc" cx="70" cy="70" r="62" />
                </svg>

                {MOTES.map((mote, i) => (
                    <span
                        key={i}
                        className="qd-handover__mote"
                        style={
                            {
                                width: mote.size,
                                height: mote.size,
                                animationDelay: `${mote.delay}ms`,
                                "--qd-mote-x": mote.x,
                                "--qd-mote-y": mote.y,
                            } as CSSProperties
                        }
                    />
                ))}

                <div className="qd-handover__discs">
                    {switching && from && <span className="qd-handover__disc qd-handover__disc--out">{initial(from.name)}</span>}
                    <span className={`qd-handover__disc qd-handover__disc--in ${switching ? "" : "qd-handover__disc--solo"}`}>
                        {initial(to.name)}
                    </span>
                </div>
            </div>

            <div className="qd-handover__copy">
                <p className="qd-handover__eyebrow">{switching ? "Handing over the table" : "Setting your table"}</p>

                <h2 className="qd-handover__name">
                    {Array.from(to.name).map((char, i) => (
                        <span key={i} style={{ animationDelay: `${640 + i * 34}ms` }}>
                            {char}
                        </span>
                    ))}
                </h2>

                <p className="qd-handover__meta">
                    {ROLE_LABEL[to.role] ?? to.role} · {to.email}
                </p>
            </div>
        </div>
    );
}
