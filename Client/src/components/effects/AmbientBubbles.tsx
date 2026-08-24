import { useEffect, useRef } from "react";

/**
 * AmbientBubbles
 * --------------
 * A very quiet layer of gold bubbles drifting upward behind the interface.
 * Kept near the threshold of perception on purpose — it should read as warm
 * light in the room, never as decoration competing with content.
 *
 * Pauses when the tab is hidden and skips entirely under reduced motion.
 */

interface Bubble {
    x: number;
    y: number;
    r: number;
    speed: number;
    drift: number;
    phase: number;
    alpha: number;
}

interface Props {
    /** How many bubbles to keep alive. */
    count?: number;
    /**
     * Positioning class. Defaults to the full-viewport layer; pass
     * `qd-ambient qd-ambient--inset` to scope the field to a section.
     */
    className?: string;
}

export default function AmbientBubbles({ count = 16, className = "qd-ambient" }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let dpr = Math.min(window.devicePixelRatio || 1, 2);
        let width = window.innerWidth;
        let height = window.innerHeight;
        let raf = 0;
        let clock = 0;
        let lastFrame = performance.now();

        const resize = () => {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
        };

        const seed = (b: Partial<Bubble> = {}, fromBottom = false): Bubble => ({
            x: Math.random() * width,
            y: fromBottom ? height + Math.random() * 120 : Math.random() * height,
            r: 8 + Math.random() * 46,
            speed: 0.12 + Math.random() * 0.32,
            drift: 0.15 + Math.random() * 0.4,
            phase: Math.random() * Math.PI * 2,
            alpha: 0.05 + Math.random() * 0.11,
            ...b,
        });

        resize();
        const bubbles: Bubble[] = Array.from({ length: count }, () => seed());

        const frame = (now: number) => {
            const dt = Math.min((now - lastFrame) / 16.667, 3);
            lastFrame = now;
            clock += dt * 0.01;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, width, height);

            for (let i = 0; i < bubbles.length; i++) {
                const b = bubbles[i];
                b.y -= b.speed * dt;
                b.x += Math.sin(clock + b.phase) * b.drift * dt;

                if (b.y + b.r < -40) {
                    bubbles[i] = seed({}, true);
                    continue;
                }

                const g = ctx.createRadialGradient(
                    b.x - b.r * 0.32,
                    b.y - b.r * 0.34,
                    b.r * 0.05,
                    b.x,
                    b.y,
                    b.r,
                );
                g.addColorStop(0, `rgba(255, 248, 226, ${b.alpha * 1.5})`);
                g.addColorStop(0.55, `rgba(233, 192, 90, ${b.alpha * 0.6})`);
                g.addColorStop(1, "rgba(169, 121, 15, 0)");

                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
                ctx.fillStyle = g;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(233, 192, 90, ${b.alpha * 0.55})`;
                ctx.lineWidth = 0.7;
                ctx.stroke();
            }

            raf = requestAnimationFrame(frame);
        };

        const start = () => {
            lastFrame = performance.now();
            raf = requestAnimationFrame(frame);
        };

        const onVisibility = () => {
            cancelAnimationFrame(raf);
            if (!document.hidden) start();
        };

        start();
        window.addEventListener("resize", resize);
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", resize);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [count]);

    return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
