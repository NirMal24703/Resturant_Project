import { useLayoutEffect } from "react";


export default function useScrollReveal(deps: unknown[] = [], selector = "main > section, main > div[data-reveal]") {
    useLayoutEffect(() => {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
        if (!nodes.length) return;

        if (reduced || typeof IntersectionObserver === "undefined") {
            nodes.forEach((el) => el.setAttribute("data-reveal", "shown"));
            return;
        }

        nodes.forEach((el) => {
            if (el.getAttribute("data-reveal") !== "shown") el.setAttribute("data-reveal", "");
        });

        let fired = false;
        const observer = new IntersectionObserver(
            (entries) => {
                fired = true;
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    entry.target.setAttribute("data-reveal", "shown");
                    observer.unobserve(entry.target);
                }
            },
            { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
        );

        nodes.forEach((el) => observer.observe(el));

        // True failsafe: if the observer never fired at all, something is wrong
        // with it — reveal everything. If it did fire, leave the rest to scroll,
        // otherwise the timer would defeat the reveal it's meant to protect.
        const failsafe = window.setTimeout(() => {
            if (!fired) nodes.forEach((el) => el.setAttribute("data-reveal", "shown"));
        }, 1500);

        return () => {
            observer.disconnect();
            window.clearTimeout(failsafe);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
