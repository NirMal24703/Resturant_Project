/**
 * Loader
 * ------
 * In-page loading state: three gold bubbles rising through a soft glow.
 * Deliberately quieter than the boot splash so it reads as "fetching",
 * not "starting up".
 */
export default function Loader({ text }: { text: string }) {
    return (
        <div className="bg-surface flex min-h-screen flex-col items-center justify-center gap-6">
            <div className="relative grid h-14 w-24 place-items-center">
                <span
                    className="pointer-events-none absolute inset-0 rounded-full blur-xl"
                    style={{ background: "radial-gradient(circle, rgba(233,192,90,0.28), transparent 70%)" }}
                />
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        className="animate-wobble absolute bottom-0 rounded-full"
                        style={{
                            left: `${18 + i * 26}px`,
                            width: 14 - i * 2,
                            height: 14 - i * 2,
                            background:
                                "radial-gradient(circle at 32% 28%, #fff6dc, #e9c05a 45%, rgba(169,121,15,0.15) 80%)",
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,.7)",
                            animation: `qdTypingBob 1.5s ${i * 0.18}s cubic-bezier(0.22,1,0.36,1) infinite, qdWobble 5s ease-in-out infinite`,
                        }}
                    />
                ))}
            </div>

            <p className="font-display text-on-surface/50 text-xs tracking-[0.35em] uppercase">{text}</p>
        </div>
    );
}
