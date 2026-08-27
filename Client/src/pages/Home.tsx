import { useState, useEffect } from "react";
import Navbar from "../components/Navbar.tsx";
import Footer from "../components/Footer.tsx";
import AuthModal from "../components/AuthModal.tsx";
import Hero from "../components/home/Hero.tsx";
import CuisineBrowse from "../components/home/CuisineBrowse.tsx";
import TrendingRow from "../components/home/TrendingRow.tsx";
import MembershipSection from "../components/home/MembershipSection.tsx";
import NewsletterCTA from "../components/home/NewsletterCTA.tsx";
import { getFeaturedRestaurants, type Restaurant } from "../api.ts";

export default function Home() {
    const [trending, setTrending] = useState<Restaurant[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const fetchTrending = async () => {
            try {
                const featured = await getFeaturedRestaurants(6);
                if (!cancelled) setTrending(featured);
            } catch {
                // The home page still reads fine without the trending row, so
                // a failed fetch just leaves it empty rather than blocking.
                if (!cancelled) setTrending([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchTrending();
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="min-h-screen bg-surface flex flex-col pt-0">
            <Navbar />
            <AuthModal />
            <main className="flex-1">
                <Hero />
                <CuisineBrowse />
                <TrendingRow trending={trending} loading={loading} />
                <MembershipSection />
                <NewsletterCTA />
            </main>
            <Footer />
        </div>
    );
}
