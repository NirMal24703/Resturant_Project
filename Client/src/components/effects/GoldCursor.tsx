import { useEffect, useRef } from "react";

const DEFAULT_SIZE = 25;

const SNAP_SELECTOR =
    'a, button, summary, select, [role="button"], [role="tab"], [role="menuitem"], [data-cursor="grow"]';

const TEXT_SELECTOR =
    'input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"]';

const MAX_SNAP_WIDTH = 460;
const MAX_SNAP_HEIGHT = 150;

const MODE_FREE = 0;
const MODE_SNAP = 1;
const MODE_TEXT = 2;

interface Props {
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

        let tint = { r: 169, g: 121, b: 15 };

        const readTheme = () => {
            tint = root.classList.contains("dark") ? { r: 233, g: 192, b: 90 } : { r: 169, g: 121, b: 15 };
        };
        readTheme();

        const themeWatcher = new MutationObserver(readTheme);
        themeWatcher.observe(root, { attributes: true, attributeFilter: ["class"] });

        const gold = (alpha: number) => `rgba(${tint.r}, ${tint.g}, ${tint.b}, ${alpha})`;

        const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const dot = { ...pointer };
        const frame = { x: pointer.x, y: pointer.y, w: sizeRef.current, h: sizeRef.current, r: sizeRef.current / 2 };
        const vel = { x: 0, y: 0 };

        let mode: number = MODE_FREE;
        let snapEl: Element | null = null;
        let snapRadius = 0;
        let caretHeight = 18;

        let snapAmount = 0;
        let pressAmount = 0;
        let angle = 0;
        let opacity = 0;

        let pressed = false;
        let visible = false;

        let ring = -1;
        const ringBox = { x: 0, y: 0, w: 0, h: 0, r: 0 };

        let raf = 0;
        let lastFrame = performance.now();

        let dpr = Math.min(window.devicePixelRatio || 1, 2);

        const resize = () => {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.floor(window.innerWidth * dpr);
            canvas.height = Math.floor(window.innerHeight * dpr);
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
        };
        resize();

        const approach = (current: number, goal: number, rate: number, dt: number) =>
            current + (goal - current) * (1 - Math.pow(1 - rate, dt));

        const traceBox = (x: number, y: number, w: number, h: number, r: number) => {
            const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
            ctx.beginPath();
            if (typeof ctx.roundRect === "function") {
                ctx.roundRect(x - w / 2, y - h / 2, w, h, radius);
                return;
            }
            const left = x - w / 2;
            const top = y - h / 2;
            ctx.moveTo(left + radius, top);
            ctx.arcTo(left + w, top, left + w, top + h, radius);
            ctx.arcTo(left + w, top + h, left, top + h, radius);
            ctx.arcTo(left, top + h, left, top, radius);
            ctx.arcTo(left, top, left + w, top, radius);
            ctx.closePath();
        };

        const readRadius = (el: Element) => {
            const declared = window.getComputedStyle(el).borderTopLeftRadius;
            const parsed = Number.parseFloat(declared);
            return Number.isFinite(parsed) ? parsed : 0;
        };

        const evaluateTarget = (el: Element | null) => {
            const caret = el?.closest?.(TEXT_SELECTOR) ?? null;
            if (caret) {
                mode = MODE_TEXT;
                snapEl = null;
                const fontSize = Number.parseFloat(window.getComputedStyle(caret).fontSize);
                caretHeight = (Number.isFinite(fontSize) ? fontSize : 14) * 1.45;
                return;
            }

            const control = el?.closest?.(SNAP_SELECTOR) ?? null;
            if (control) {
                const rect = control.getBoundingClientRect();
                if (rect.width > 0 && rect.width <= MAX_SNAP_WIDTH && rect.height > 0 && rect.height <= MAX_SNAP_HEIGHT) {
                    mode = MODE_SNAP;
                    snapEl = control;
                    snapRadius = readRadius(control);
                    return;
                }
            }

            mode = MODE_FREE;
            snapEl = null;
        };

        const render = (now: number) => {
            const dt = Math.min((now - lastFrame) / 16.667, 3);
            lastFrame = now;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

            const previousX = dot.x;
            const previousY = dot.y;
            dot.x = approach(dot.x, pointer.x, 0.42, dt);
            dot.y = approach(dot.y, pointer.y, 0.42, dt);
            vel.x = dot.x - previousX;
            vel.y = dot.y - previousY;

            const speed = Math.hypot(vel.x, vel.y);
            const base = sizeRef.current;

            let goalX = pointer.x;
            let goalY = pointer.y;
            let goalW: number;
            let goalH: number;
            let goalR: number;
            let goalAngle = angle;

            if (mode === MODE_SNAP && snapEl) {
                const rect = snapEl.getBoundingClientRect();
                const pad = 7;
                goalW = rect.width + pad * 2;
                goalH = rect.height + pad * 2;
                goalR = snapRadius + pad;
                goalX = rect.left + rect.width / 2 + (pointer.x - (rect.left + rect.width / 2)) * 0.07;
                goalY = rect.top + rect.height / 2 + (pointer.y - (rect.top + rect.height / 2)) * 0.07;
                goalAngle = 0;
            } else if (mode === MODE_TEXT) {
                goalW = 2;
                goalH = caretHeight;
                goalR = 1;
                goalAngle = 0;
            } else {
                const stretch = Math.min(speed / 42, 0.42);
                goalW = base * (1 + stretch);
                goalH = base * (1 - stretch * 0.6);
                goalR = Math.min(goalW, goalH) / 2;
                if (speed > 0.35) goalAngle = Math.atan2(vel.y, vel.x);
            }

            snapAmount = approach(snapAmount, mode === MODE_SNAP ? 1 : 0, 0.18, dt);
            pressAmount = approach(pressAmount, pressed ? 1 : 0, 0.3, dt);
            opacity = approach(opacity, visible ? 1 : 0, 0.16, dt);

            let delta = goalAngle - angle;
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            angle = approach(angle, angle + delta, mode === MODE_FREE ? 0.28 : 0.4, dt);

            frame.x = approach(frame.x, goalX, mode === MODE_SNAP ? 0.26 : 0.36, dt);
            frame.y = approach(frame.y, goalY, mode === MODE_SNAP ? 0.26 : 0.36, dt);
            frame.w = approach(frame.w, goalW, 0.22, dt);
            frame.h = approach(frame.h, goalH, 0.22, dt);
            frame.r = approach(frame.r, goalR, 0.22, dt);

            if (opacity <= 0.004) {
                raf = requestAnimationFrame(render);
                return;
            }

            const squeeze = 1 - pressAmount * 0.12;
            const w = frame.w * squeeze;
            const h = frame.h * squeeze;

            if (ring >= 0) {
                ring += 0.055 * dt;
                if (ring >= 1) {
                    ring = -1;
                } else {
                    const eased = 1 - Math.pow(1 - ring, 3);
                    ctx.save();
                    ctx.globalAlpha = (1 - ring) * 0.5 * opacity;
                    traceBox(
                        ringBox.x,
                        ringBox.y,
                        ringBox.w + eased * 46,
                        ringBox.h + eased * 46,
                        ringBox.r + eased * 22,
                    );
                    ctx.strokeStyle = gold(0.9);
                    ctx.lineWidth = 1.4 * (1 - ring) + 0.3;
                    ctx.stroke();
                    ctx.restore();
                }
            }

            ctx.save();
            ctx.globalAlpha = opacity;
            ctx.translate(frame.x, frame.y);
            ctx.rotate(angle);

            if (mode === MODE_TEXT) {
                traceBox(0, 0, w, h, frame.r);
                ctx.fillStyle = gold(0.5 + Math.abs(Math.sin(now / 420)) * 0.45);
                ctx.fill();
            } else {
                if (snapAmount > 0.01) {
                    traceBox(0, 0, w, h, frame.r);
                    ctx.fillStyle = gold(0.09 * snapAmount);
                    ctx.fill();
                }

                ctx.shadowColor = gold(0.45);
                ctx.shadowBlur = 14;
                traceBox(0, 0, w, h, frame.r);
                ctx.strokeStyle = gold(0.55 + snapAmount * 0.4);
                ctx.lineWidth = 1.4;
                ctx.stroke();
                ctx.shadowBlur = 0;

                if (snapAmount > 0.05) {
                    const arm = Math.min(11, Math.min(w, h) * 0.3);
                    const inset = Math.max(0, frame.r * 0.42);
                    ctx.strokeStyle = gold(0.9 * snapAmount);
                    ctx.lineWidth = 1.8;
                    ctx.lineCap = "round";
                    ctx.beginPath();
                    for (const sx of [-1, 1]) {
                        for (const sy of [-1, 1]) {
                            const cx = (sx * w) / 2;
                            const cy = (sy * h) / 2;
                            ctx.moveTo(cx - sx * inset, cy);
                            ctx.lineTo(cx - sx * inset - sx * arm, cy);
                            ctx.moveTo(cx, cy - sy * inset);
                            ctx.lineTo(cx, cy - sy * inset - sy * arm);
                        }
                    }
                    ctx.stroke();
                }
            }

            ctx.restore();

            const dotAlpha = (1 - snapAmount) * (mode === MODE_TEXT ? 0 : 1) * opacity;
            if (dotAlpha > 0.01) {
                ctx.save();
                ctx.globalAlpha = dotAlpha;
                ctx.beginPath();
                ctx.arc(pointer.x, pointer.y, 2.6 * (1 - pressAmount * 0.35), 0, Math.PI * 2);
                ctx.fillStyle = gold(0.95);
                ctx.fill();
                ctx.restore();
            }

            raf = requestAnimationFrame(render);
        };

        const onMove = (e: PointerEvent) => {
            pointer.x = e.clientX;
            pointer.y = e.clientY;

            if (!visible) {
                dot.x = e.clientX;
                dot.y = e.clientY;
                frame.x = e.clientX;
                frame.y = e.clientY;
                visible = true;
            }

            evaluateTarget(e.target as Element | null);
        };

        const onScroll = () => {
            if (!visible) return;
            evaluateTarget(document.elementFromPoint(pointer.x, pointer.y));
        };

        const onDown = () => {
            pressed = true;
            ring = 0;
            ringBox.x = frame.x;
            ringBox.y = frame.y;
            ringBox.w = frame.w;
            ringBox.h = frame.h;
            ringBox.r = frame.r;
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
        window.addEventListener("scroll", onScroll, { passive: true, capture: true });
        document.addEventListener("pointerleave", onLeave);
        document.addEventListener("pointerenter", onEnter);
        window.addEventListener("resize", resize);
        finePointer.addEventListener("change", onPointerKindChange);

        raf = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(raf);
            themeWatcher.disconnect();
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerdown", onDown);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("scroll", onScroll, true);
            document.removeEventListener("pointerleave", onLeave);
            document.removeEventListener("pointerenter", onEnter);
            window.removeEventListener("resize", resize);
            finePointer.removeEventListener("change", onPointerKindChange);
            root.classList.remove("qd-cursor-on");
        };
    }, []);

    return <canvas ref={canvasRef} className="qd-cursor-canvas" aria-hidden="true" />;
}
