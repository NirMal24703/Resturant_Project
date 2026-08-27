import { useCallback, useEffect, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Home from "./pages/Home.tsx";
import Search from "./pages/Search.tsx";
import RestaurantDetail from "./pages/RestaurantDetail.tsx";
import BookingConfirmation from "./pages/BookingConfirmation.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import OwnerDashboard from "./pages/owner/OwnerDashboard.tsx";
import AdminDashboard from "./pages/admin/AdminDashboard.tsx";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import ScrollToTop from "./components/ScrollToTop.tsx";
import Chatbot from "./components/Chatbot.tsx";
import SplashScreen from "./components/effects/SplashScreen.tsx";
import GoldCursor from "./components/effects/GoldCursor.tsx";
import AccountSwitch from "./components/effects/AccountSwitch.tsx";
import useScrollReveal from "./hooks/useScrollReveal.ts";
import { Toaster } from "react-hot-toast";

const BOOT_KEY = "qd:booted";

/** The splash plays once per browser session, not on every client-side nav. */
function alreadyBooted() {
    try {
        return sessionStorage.getItem(BOOT_KEY) === "1";
    } catch {
        return false;
    }
}

export default function App() {
    const location = useLocation();
    const [booting, setBooting] = useState(() => !alreadyBooted());

    useScrollReveal([location.pathname, booting]);

    // Hold the page still while the opening sequence plays.
    useEffect(() => {
        if (!booting) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, [booting]);

    const finishBoot = useCallback(() => {
        try {
            sessionStorage.setItem(BOOT_KEY, "1");
        } catch {
          
        }
        setBooting(false);
    }, []);

    return (
        <>
            {booting && <SplashScreen onDone={finishBoot} />}

            <GoldCursor size={25} />

            <AccountSwitch />

            <Toaster
                position="bottom-right"
                toastOptions={{
                    style: {
                        background: "#0b0a08",
                        color: "#e9c05a",
                        fontFamily: "Outfit, sans-serif",
                        fontSize: "12px",
                        letterSpacing: "0.02em",
                        borderRadius: "999px",
                        padding: "10px 16px",
                        border: "1px solid rgba(233, 192, 90, 0.35)",
                        boxShadow: "0 18px 40px -18px rgba(0,0,0,.8)",
                    },
                }}
            />
            <ScrollToTop />
            <Chatbot />

            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/search" element={<Search />} />
                <Route path="/restaurant/:slug" element={<RestaurantDetail />} />
                <Route
                    path="/booking/:slug"
                    element={
                        <ProtectedRoute>
                            <BookingConfirmation />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute>
                            <Dashboard />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/owner/dashboard"
                    element={
                        <ProtectedRoute allowedRoles={["owner"]}>
                            <OwnerDashboard />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admin/dashboard"
                    element={
                        <ProtectedRoute allowedRoles={["admin"]}>
                            <AdminDashboard />
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </>
    );
}
