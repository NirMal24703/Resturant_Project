import { useEffect, useMemo, useRef, useState } from "react";

/**
 * SplashScreen
 * ------------
 * The opening sequence: the cloche mark draws itself in gold, gold bubbles
 * rise past it, the wordmark settles letter by letter, and the whole thing
 * lifts away on a light bloom.
 *
 * Click or press any key to skip.
 */

const WORD = "QuickDine";
const BUBBLE_COUNT = 22;

interface Props {
    /** How long the sequence runs before it starts dissolving, in ms. */
    duration?: number;
    onDone: () => void;
}

export default function SplashScreen({ duration = 2100, onDone }: Props) {
    const [progress, setProgress] = useState(0);
    const [leaving, setLeaving] = useState(false);
    const doneRef = useRef(false);

    const bubbles = useMemo(
        () =>
            Array.from({ length: BUBBLE_COUNT }, (_, i) => ({
                id: i,
                left: Math.random() * 100,
                size: 6 + Math.random() * 46,
                delay: Math.random() * 2.4,
                duration: 5 + Math.random() * 6,
                drift: (Math.random() - 0.5) * 130,
                alpha: 0.08 + Math.random() * 0.3,
            })),
        [],
    );

    useEffect(() => {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const span = reduced ? 350 : duration;
        const start = performance.now();
        let raf = 0;

        const finish = () => {
            if (doneRef.current) return;
            doneRef.current = true;
            setProgress(1);
            setLeaving(true);
            window.setTimeout(onDone, reduced ? 60 : 720);
        };

        const tick = (now: number) => {
            const t = Math.min((now - start) / span, 1);
            // Ease-out so the meter races then settles — reads as "almost there".
            setProgress(1 - Math.pow(1 - t, 2.4));
            if (t < 1) raf = requestAnimationFrame(tick);
            else finish();
        };
        raf = requestAnimationFrame(tick);

        const skip = () => finish();
        window.addEventListener("keydown", skip);
        window.addEventListener("pointerdown", skip);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("keydown", skip);
            window.removeEventListener("pointerdown", skip);
        };
    }, [duration, onDone]);

    return (
        <div
            className={`fixed inset-0 z-[9998] flex items-center justify-center overflow-hidden bg-[#050403] transition-[opacity,transform,filter] duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] ${
                leaving ? "pointer-events-none scale-[1.08] opacity-0 blur-md" : "opacity-100"
            }`}
            role="status"
            aria-label="Loading QuickDine"
        >
            {/* Warm floor glow */}
            <div
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        "radial-gradient(130% 85% at 50% 112%, rgba(217,174,63,0.32), transparent 62%), radial-gradient(75% 60% at 50% 40%, rgba(233,192,90,0.2), transparent 72%)",
                }}
            />

            {/* Rising bubbles */}
            <div className="pointer-events-none absolute inset-0">
                {bubbles.map((b) => (
                    <span
                        key={b.id}
                        className="absolute bottom-[-14vh] rounded-full animate-wobble"
                        style={
                            {
                                left: `${b.left}%`,
                                width: b.size,
                                height: b.size,
                                background:
                                    "radial-gradient(circle at 32% 28%, rgba(255,250,232,0.85), rgba(233,192,90,0.35) 46%, rgba(169,121,15,0.05) 72%)",
                                boxShadow: "inset 0 0 8px rgba(255,240,200,0.5)",
                                animation: `qdRise ${b.duration}s linear ${b.delay}s infinite, qdWobble 6s ease-in-out infinite`,
                                "--qd-drift": `${b.drift}px`,
                                "--qd-bubble-alpha": b.alpha,
                            } as React.CSSProperties
                        }
                    />
                ))}
            </div>

            {/* Expanding ring on exit */}
            {leaving && (
                <span
                    className="pointer-events-none absolute size-[40vmax] rounded-full border border-[#ffe7a3]"
                    style={{ animation: "qdRingOut 0.75s cubic-bezier(0.22,1,0.36,1) forwards" }}
                />
            )}

            <div className="relative flex flex-col items-center px-8">
                {/* Cloche mark — pathLength="1" lets the stroke draw itself */}
                <svg viewBox="0 0 280 280" className="size-20 md:size-24" fill="none" aria-hidden="true">
                    <defs>
                        <linearGradient id="qd-splash-gold" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#a9790f" />
                            <stop offset="45%" stopColor="#f0cf74" />
                            <stop offset="60%" stopColor="#fff4d2" />
                            <stop offset="100%" stopColor="#a9790f" />
                        </linearGradient>
                    </defs>
                    <path
                        pathLength={1}
                        d="M140 90.7435C118.783 90.7435 98.4344 99.1636 83.4315 114.152C68.4285 129.14 60 149.468 60 170.664L87.0787 176.942C121.893 185.008 158.094 185.008 192.908 176.942L220 170.664C220 149.468 211.571 129.14 196.569 114.152C181.566 99.1636 161.217 90.7435 140 90.7435ZM140 90.7435V60M121.535 60H158.478M60 206.685L87.0787 212.951C121.893 221.016 158.094 221.016 192.908 212.951L220 206.685"
                        stroke="url(#qd-splash-gold)"
                        strokeWidth={12}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                            strokeDasharray: 1,
                            strokeDashoffset: 1,
                            animation: "qdDrawStroke 1.5s cubic-bezier(0.22,1,0.36,1) 0.12s forwards",
                            filter: "drop-shadow(0 0 12px rgba(233,192,90,0.45))",
                        }}
                    />
                </svg>

                {/* Wordmark */}
                <h1
                    className="font-display mt-7 flex text-4xl tracking-[0.06em] md:text-6xl"
                    style={{ perspective: "600px" }}
                    aria-label={WORD}
                >
                    {WORD.split("").map((letter, i) => (
                        <span
                            key={`${letter}-${i}`}
                            aria-hidden="true"
                            className="inline-block"
                            style={{
                                background:
                                    "linear-gradient(105deg, #c9982c 0%, #f0cf74 34%, #fffaf0 50%, #f0cf74 66%, #c9982c 100%)",
                                backgroundSize: "200% 100%",
                                WebkitBackgroundClip: "text",
                                backgroundClip: "text",
                                color: "transparent",
                                animation: `qdLetterSettle 0.85s cubic-bezier(0.22,1,0.36,1) ${0.5 + i * 0.06}s both, qdSheenSweep 2.6s linear ${
                                    0.9 + i * 0.02
                                }s infinite`,
                            }}
                        >
                            {letter}
                        </span>
                    ))}
                </h1>

                <p
                    className="mt-3 text-[10px] tracking-[0.42em] text-[#e9c05a]/70 uppercase md:text-[11px]"
                    style={{ animation: "qdBubbleIn 0.7s cubic-bezier(0.22,1,0.36,1) 1.15s both" }}
                >
                    Reserve the table you meant to book
                </p>

                {/* Progress meter */}
                <div
                    className="mt-10 h-[2px] w-52 overflow-hidden rounded-full bg-[#e9c05a]/12 md:w-64"
                    style={{ animation: "qdBubbleIn 0.6s cubic-bezier(0.22,1,0.36,1) 1.3s both" }}
                >
                    <i
                        className="block h-full origin-left bg-gradient-to-r from-[#a9790f] via-[#ffe7a3] to-[#a9790f]"
                        style={{
                            transform: `scaleX(${progress})`,
                            boxShadow: "0 0 10px rgba(255,231,163,0.8)",
                        }}
                    />
                </div>

                <span className="mt-4 font-mono text-[10px] tracking-[0.3em] text-[#e9c05a]/35 tabular-nums">
                    {String(Math.round(progress * 100)).padStart(3, "0")}
                </span>
            </div>
        </div>
    );
}
