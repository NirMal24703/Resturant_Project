import { useEffect, useRef } from "react";

/**
 * GoldCursor
 * ----------
 * Replaces the system cursor with a liquid-gold bubble that wobbles as it
 * moves (iOS-style specular glass) and sheds gold glitter proportional to
 * pointer speed.
 *
 * Everything scales off `size`, which defaults to 25px — change that one
 * number (or the --qd-cursor-size CSS variable) to retune the whole effect.
 *
 * Automatically disables itself on touch devices and when the visitor has
 * asked for reduced motion.
 */

const DEFAULT_SIZE = 25;

/** Trailing ghost bubbles that produce the wave/liquid tail. */
const TRAIL_LENGTH = 6;
/** Hard ceiling on live glitter particles — keeps the frame budget safe. */
const MAX_SPARKS = 150;

interface Spark {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    span: number;
    size: number;
    rot: number;
    spin: number;
    /** 0 = four-point sparkle, 1 = round dust mote */
    kind: 0 | 1;
    warm: number;
}

interface Props {
    /** Diameter of the gold bubble in CSS pixels. */
    size?: number;
}

export default function GoldCursor({ size = DEFAULT_SIZE }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sizeRef = useRef(size);
    sizeRef.current = size;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (!finePointer.matches || reducedMotion.matches) return;

        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) return;

        const root = document.documentElement;
        root.classList.add("qd-cursor-on");

        // ── State ────────────────────────────────────────────────────────────
        const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const pos = { x: target.x, y: target.y };
        const vel = { x: 0, y: 0 };
        const trail: { x: number; y: number }[] = Array.from({ length: TRAIL_LENGTH }, () => ({ ...pos }));
        const sparks: Spark[] = [];

        let hovering = false;
        let pressed = false;
        let visible = false;
        let opacity = 0;
        let hoverAmount = 0;
        let pressAmount = 0;
        let ringPhase = -1;
        let ringX = 0;
        let ringY = 0;
        let clock = 0;
        let raf = 0;
        let lastFrame = performance.now();

        // ── Canvas sizing ────────────────────────────────────────────────────
        let dpr = Math.min(window.devicePixelRatio || 1, 2);

        const resize = () => {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.floor(window.innerWidth * dpr);
            canvas.height = Math.floor(window.innerHeight * dpr);
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
        };
        resize();

        // ── Glitter ──────────────────────────────────────────────────────────
        const spawnSpark = (x: number, y: number, energy: number, burst = false) => {
            if (sparks.length >= MAX_SPARKS) return;
            const unit = sizeRef.current / DEFAULT_SIZE;
            const angle = Math.random() * Math.PI * 2;
            const speed = burst ? 0.9 + Math.random() * 2.6 : Math.random() * 0.55;

            sparks.push({
                x: x + (Math.random() - 0.5) * sizeRef.current * 0.7,
                y: y + (Math.random() - 0.5) * sizeRef.current * 0.7,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 0.1,
                life: 1,
                span: burst ? 0.75 + Math.random() * 0.5 : 0.55 + Math.random() * 0.75,
                size: (burst ? 2.6 : 1.8) * unit + Math.random() * 4.2 * unit * (0.5 + energy * 0.5),
                rot: Math.random() * Math.PI,
                spin: (Math.random() - 0.5) * 0.09,
                kind: Math.random() > 0.42 ? 0 : 1,
                warm: Math.random(),
            });
        };

        const drawSpark = (s: Spark) => {
            const fade = s.life * s.life;
            const r = s.size * (0.35 + s.life * 0.75);

            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(s.rot);
            ctx.globalCompositeOperation = "lighter";

            const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.4);
            glow.addColorStop(0, `rgba(255, 244, 208, ${0.62 * fade})`);
            glow.addColorStop(0.4, `rgba(233, 192, 90, ${0.3 * fade})`);
            glow.addColorStop(1, "rgba(169, 121, 15, 0)");
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2);
            ctx.fill();

            const core = ctx.createLinearGradient(-r, -r, r, r);
            core.addColorStop(0, `rgba(255, 252, 236, ${0.95 * fade})`);
            core.addColorStop(0.5, `rgba(255, 214, 120, ${0.9 * fade})`);
            core.addColorStop(1, `rgba(${200 + s.warm * 40}, 150, 40, ${0.7 * fade})`);
            ctx.fillStyle = core;

            if (s.kind === 0) {
                // Four-point sparkle: concave diamond drawn with quadratics.
                ctx.beginPath();
                ctx.moveTo(0, -r);
                ctx.quadraticCurveTo(0, 0, r, 0);
                ctx.quadraticCurveTo(0, 0, 0, r);
                ctx.quadraticCurveTo(0, 0, -r, 0);
                ctx.quadraticCurveTo(0, 0, 0, -r);
                ctx.closePath();
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        };

        // ── The bubble ───────────────────────────────────────────────────────
        /** Traces a wobbling circle. `wave` drives how liquid the edge reads. */
        const bubblePath = (r: number, t: number, wave: number) => {
            const steps = 60;
            ctx.beginPath();
            for (let i = 0; i <= steps; i++) {
                const a = (i / steps) * Math.PI * 2;
                const wobble =
                    Math.sin(a * 3 + t * 2.3) * 0.055 +
                    Math.sin(a * 5 - t * 1.6) * 0.032 +
                    Math.sin(a * 2 + t * 3.4) * 0.022;
                const rr = r * (1 + wobble * wave);
                const px = Math.cos(a) * rr;
                const py = Math.sin(a) * rr;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
        };

        const drawBubble = (
            x: number,
            y: number,
            r: number,
            t: number,
            stretch: number,
            angle: number,
            alpha: number,
            wave: number,
            glass: boolean,
        ) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            // Squash along the axis of travel — the iOS liquid-drag feel.
            ctx.scale(1 + stretch, 1 / (1 + stretch * 0.85));
            ctx.globalAlpha = alpha;
            ctx.globalCompositeOperation = "lighter";

            // Ambient halo
            const halo = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 3.1);
            halo.addColorStop(0, `rgba(233, 192, 90, ${0.2 * alpha})`);
            halo.addColorStop(1, "rgba(233, 192, 90, 0)");
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(0, 0, r * 3.1, 0, Math.PI * 2);
            ctx.fill();

            // Body
            bubblePath(r, t, wave);
            const body = ctx.createRadialGradient(-r * 0.34, -r * 0.44, r * 0.05, 0, 0, r * 1.18);
            body.addColorStop(0, "rgba(255, 253, 242, 0.96)");
            body.addColorStop(0.3, "rgba(255, 219, 133, 0.8)");
            body.addColorStop(0.68, "rgba(217, 174, 63, 0.44)");
            body.addColorStop(1, "rgba(150, 102, 15, 0)");
            ctx.fillStyle = body;
            ctx.fill();

            if (glass) {
                // Meniscus rim
                ctx.strokeStyle = "rgba(255, 238, 186, 0.55)";
                ctx.lineWidth = Math.max(0.8, r * 0.07);
                ctx.stroke();

                // Specular highlight
                ctx.beginPath();
                ctx.ellipse(-r * 0.33, -r * 0.4, r * 0.3, r * 0.19, -0.6, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(255, 255, 250, 0.85)";
                ctx.fill();

                // Bounce light along the lower edge
                ctx.beginPath();
                ctx.ellipse(r * 0.2, r * 0.42, r * 0.26, r * 0.1, 0.5, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(255, 226, 150, 0.4)";
                ctx.fill();
            }

            ctx.restore();
        };

        // ── Loop ─────────────────────────────────────────────────────────────
        const frame = (now: number) => {
            const dt = Math.min((now - lastFrame) / 16.667, 3);
            lastFrame = now;
            clock += dt * 0.045;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

            // Spring toward the pointer
            const stiffness = 0.19;
            const damping = 0.74;
            vel.x = (vel.x + (target.x - pos.x) * stiffness) * damping;
            vel.y = (vel.y + (target.y - pos.y) * stiffness) * damping;
            pos.x += vel.x * dt;
            pos.y += vel.y * dt;

            const speed = Math.hypot(vel.x, vel.y);
            const angle = speed > 0.1 ? Math.atan2(vel.y, vel.x) : 0;
            const stretch = Math.min(speed / 38, 0.55);
            const wave = 0.6 + Math.min(speed / 22, 1.9);

            hoverAmount += ((hovering ? 1 : 0) - hoverAmount) * 0.14 * dt;
            pressAmount += ((pressed ? 1 : 0) - pressAmount) * 0.22 * dt;
            opacity += ((visible ? 1 : 0) - opacity) * 0.15 * dt;

            // Trail follows with progressive lag
            trail.unshift({ x: pos.x, y: pos.y });
            trail.length = TRAIL_LENGTH;

            const base = sizeRef.current / 2;
            const radius = base * (1 + hoverAmount * 0.65) * (1 - pressAmount * 0.28);

            // Glitter emission scales with speed
            const energy = Math.min(speed / 26, 1);
            if (opacity > 0.05) {
                const count = Math.min(5, Math.floor(energy * 6));
                for (let i = 0; i < count; i++) {
                    const lerp = i / Math.max(count, 1);
                    spawnSpark(pos.x - vel.x * lerp * 2, pos.y - vel.y * lerp * 2, energy);
                }
                if (energy > 0.05 && Math.random() < 0.5) spawnSpark(pos.x, pos.y, energy);
            }

            // Advance + draw glitter
            for (let i = sparks.length - 1; i >= 0; i--) {
                const s = sparks[i];
                s.x += s.vx * dt;
                s.y += s.vy * dt;
                s.vy -= 0.014 * dt; // gold drifts up, like it's catching light
                s.vx *= 0.965;
                s.vy *= 0.965;
                s.rot += s.spin * dt;
                s.life -= (0.017 / s.span) * dt;
                if (s.life <= 0) {
                    sparks.splice(i, 1);
                    continue;
                }
                ctx.globalAlpha = opacity;
                drawSpark(s);
            }
            ctx.globalAlpha = 1;

            // Click shockwave
            if (ringPhase >= 0) {
                ringPhase += 0.045 * dt;
                if (ringPhase >= 1) {
                    ringPhase = -1;
                } else {
                    const e = 1 - Math.pow(1 - ringPhase, 3);
                    ctx.save();
                    ctx.globalCompositeOperation = "lighter";
                    ctx.beginPath();
                    ctx.arc(ringX, ringY, base + e * base * 6, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(255, 224, 150, ${(1 - ringPhase) * 0.55 * opacity})`;
                    ctx.lineWidth = 2 * (1 - ringPhase) + 0.4;
                    ctx.stroke();
                    ctx.restore();
                }
            }

            // Wave tail
            for (let i = TRAIL_LENGTH - 1; i >= 1; i--) {
                const p = trail[i];
                const fall = 1 - i / TRAIL_LENGTH;
                drawBubble(
                    p.x,
                    p.y,
                    radius * (0.32 + fall * 0.62),
                    clock - i * 0.16,
                    stretch * 0.7,
                    angle,
                    fall * 0.3 * opacity,
                    wave * 1.3,
                    false,
                );
            }

            // The bubble itself
            drawBubble(pos.x, pos.y, radius, clock, stretch, angle, opacity, wave, true);

            // Hover ring — a thin gold contour when over something clickable
            if (hoverAmount > 0.02) {
                ctx.save();
                ctx.translate(pos.x, pos.y);
                ctx.globalCompositeOperation = "lighter";
                bubblePath(radius * 1.75, clock * 0.7, 0.8);
                ctx.strokeStyle = `rgba(255, 232, 168, ${0.45 * hoverAmount * opacity})`;
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.restore();
            }

            // Precision core sits at the true pointer position
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.beginPath();
            ctx.arc(target.x, target.y, 1.6, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 250, 230, ${0.9 * opacity})`;
            ctx.fill();
            ctx.restore();

            raf = requestAnimationFrame(frame);
        };

        // ── Events ───────────────────────────────────────────────────────────
        const interactiveSelector =
            'a, button, input, select, textarea, label, summary, [role="button"], [role="tab"], [contenteditable="true"], [data-cursor="grow"]';

        const onMove = (e: PointerEvent) => {
            target.x = e.clientX;
            target.y = e.clientY;
            if (!visible) {
                // Teleport on first sight so it doesn't fly in from the centre.
                pos.x = e.clientX;
                pos.y = e.clientY;
                for (const p of trail) {
                    p.x = e.clientX;
                    p.y = e.clientY;
                }
                visible = true;
            }
            const el = e.target as Element | null;
            hovering = !!el?.closest?.(interactiveSelector);
        };

        const onDown = (e: PointerEvent) => {
            pressed = true;
            ringPhase = 0;
            ringX = e.clientX;
            ringY = e.clientY;
            for (let i = 0; i < 22; i++) spawnSpark(e.clientX, e.clientY, 1, true);
        };

        const onUp = () => {
            pressed = false;
        };

        const onLeave = () => {
            visible = false;
        };

        const onEnter = () => {
            visible = true;
        };

        const onPointerKindChange = () => {
            if (!finePointer.matches) {
                visible = false;
                root.classList.remove("qd-cursor-on");
            } else {
                root.classList.add("qd-cursor-on");
            }
        };

        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("pointerdown", onDown, { passive: true });
        window.addEventListener("pointerup", onUp, { passive: true });
        document.addEventListener("pointerleave", onLeave);
        document.addEventListener("pointerenter", onEnter);
        window.addEventListener("resize", resize);
        finePointer.addEventListener("change", onPointerKindChange);

        raf = requestAnimationFrame(frame);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerdown", onDown);
            window.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointerleave", onLeave);
            document.removeEventListener("pointerenter", onEnter);
            window.removeEventListener("resize", resize);
            finePointer.removeEventListener("change", onPointerKindChange);
            root.classList.remove("qd-cursor-on");
        };
    }, []);

    return <canvas ref={canvasRef} className="qd-cursor-canvas" aria-hidden="true" />;
}
