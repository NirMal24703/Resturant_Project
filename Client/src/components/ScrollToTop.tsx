import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export default function ScrollToTop() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const handleScroll = () => setVisible(window.scrollY > 400);
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const scrollUp = () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    return (
        <button
            onClick={scrollUp}
            aria-label="Scroll to top"
            className={`fixed bottom-25 right-6 z-40 size-20 rounded-full bg-primary text-on-primary border border-secondary/40 flex items-center justify-center shadow-lg transition-all duration-300 cursor-pointer hover:bg-secondary hover:text-on-secondary hover:-translate-y-1 ${
                visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"
            }`}
        >
            <ArrowUp size={18} />
        </button>
    );
}
