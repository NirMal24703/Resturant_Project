import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAppContext } from "../context/AppContext.tsx";
import { useTheme } from "../context/ThemeContext.tsx";
import { Menu, X, LogOut, LayoutDashboard, ShieldCheck, Sun, Moon } from "lucide-react";

export default function Navbar() {
    const { user, logout, setAuthModalOpen } = useAppContext();
    const { theme, toggleTheme } = useTheme();
    const [scrolled, setScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const navigate = useNavigate();
    const location = useLocation();

    const isHome = location.pathname === "/";
    const solid = scrolled || !isHome;

    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 30) setScrolled(true);
            else setScrolled(false);
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        setMobileMenuOpen(false);
        setDropdownOpen(false);
    }, [location]);

    const handleDashboardClick = () => {
        if (!user) {
            setAuthModalOpen(true);
        } else {
            navigate("/dashboard");
        }
    };

    const linkColor = (active: boolean) => {
        if (active) return "text-secondary border-secondary";
        return solid ? "text-on-surface/60 hover:text-secondary border-transparent" : "text-white/85 hover:text-white border-transparent";
    };

    return (
        <nav
            className={`fixed top-0 w-full z-40 transition-all duration-300 ${
                solid
                    ? "bg-surface-container-lowest/95 backdrop-blur-md h-16 shadow-sm border-b border-secondary/20"
                    : "bg-transparent h-20 border-b border-transparent"
            }`}
        >
            <div className="max-w-7xl mx-auto flex justify-between items-center h-full px-6 md:px-10">
                <div className="flex items-center gap-12">
                    <Link to="/" className="flex items-center gap-2.5">
                        <span className="font-display text-xl md:text-2xl tracking-wide gold-text">QuickDine</span>
                    </Link>

                    <div className="hidden md:flex gap-8 items-center">
                        <Link to="/" className={`text-sm transition-colors pb-1 border-b-2 cursor-pointer ${linkColor(location.pathname === "/")}`}>
                            Discover
                        </Link>
                        <Link
                            to="/search"
                            className={`text-sm transition-colors pb-1 border-b-2 cursor-pointer ${linkColor(location.pathname.startsWith("/search"))}`}
                        >
                            Restaurants
                        </Link>
                        <button
                            onClick={handleDashboardClick}
                            className={`text-sm transition-colors pb-1 border-b-2 cursor-pointer text-left ${linkColor(location.pathname === "/dashboard")}`}
                        >
                            My Bookings
                        </button>
                    </div>
                </div>

                <div className="hidden md:flex items-center gap-5">
                    <button
                        onClick={toggleTheme}
                        aria-label="Toggle theme"
                        className={`size-9 rounded-full flex items-center justify-center border transition-colors cursor-pointer ${
                            solid ? "border-secondary/40 text-secondary hover:bg-secondary/10" : "border-white/30 text-white hover:bg-white/10"
                        }`}
                    >
                        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                    </button>

                    {user ? (
                        <div className="relative">
                            <button
                                onClick={() => setDropdownOpen(!dropdownOpen)}
                                className={`flex items-center gap-2 text-sm transition-colors cursor-pointer ${solid ? "text-secondary" : "text-white"}`}
                            >
                                <span className="size-7 rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center text-xs uppercase">
                                    {user.name.charAt(0)}
                                </span>
                                <span className="max-w-[120px] truncate">{user.name.split(" ")[0]}</span>
                            </button>

                            {dropdownOpen && (
                                <div className="absolute right-0 mt-2 w-56 bg-surface-container-lowest border border-secondary/20 ambient-shadow rounded-lg py-2 z-50 animate-fade-slide-up">
                                    <div className="px-4 py-2 border-b border-outline-variant/10">
                                        <p className="text-sm text-on-surface truncate">{user.name}</p>
                                        <p className="text-xs text-black/55 truncate">{user.email}</p>
                                    </div>
                                    <button
                                        onClick={handleDashboardClick}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-black/55 hover:text-secondary hover:bg-surface transition-colors cursor-pointer text-left"
                                    >
                                        <LayoutDashboard size={14} />
                                        My Bookings
                                    </button>

                                    {user.role === "admin" && (
                                        <Link
                                            to="/admin/dashboard"
                                            className="flex items-center gap-3 px-4 py-2.5 text-xs text-black/55 hover:text-secondary hover:bg-surface transition-colors cursor-pointer"
                                        >
                                            <ShieldCheck size={14} />
                                            Admin Panel
                                        </Link>
                                    )}

                                    {user.role === "owner" && (
                                        <Link
                                            to="/owner/dashboard"
                                            className="flex items-center gap-3 px-4 py-2.5 text-xs text-black/55 hover:text-secondary hover:bg-surface transition-colors cursor-pointer"
                                        >
                                            <ShieldCheck size={14} />
                                            Owner Panel
                                        </Link>
                                    )}

                                    <button
                                        onClick={logout}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-error hover:bg-error-container/20 transition-colors border-t border-outline-variant/10 text-left cursor-pointer"
                                    >
                                        <LogOut size={14} /> Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={() => setAuthModalOpen(true)}
                                className={`text-sm transition-colors cursor-pointer ${solid ? "text-on-surface/60 hover:text-secondary" : "text-white/85 hover:text-white"}`}
                            >
                                Sign In
                            </button>
                            <button
                                onClick={() => setAuthModalOpen(true)}
                                className={`text-xs font-medium tracking-wider uppercase px-5 py-2.5 transition-soft cursor-pointer rounded-sm ${
                                    solid
                                        ? "bg-primary text-on-primary hover:bg-secondary hover:text-on-secondary"
                                        : "bg-white text-black hover:bg-secondary hover:text-on-secondary"
                                }`}
                            >
                                Sign Up
                            </button>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2 md:hidden">
                    <button
                        onClick={toggleTheme}
                        aria-label="Toggle theme"
                        className={`size-9 rounded-full flex items-center justify-center border transition-colors cursor-pointer ${
                            solid ? "border-secondary/40 text-secondary" : "border-white/30 text-white"
                        }`}
                    >
                        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className={`p-2 transition-colors cursor-pointer ${solid ? "text-on-surface" : "text-white"}`}
                        aria-label="Toggle Menu"
                    >
                        {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>
            </div>

            {mobileMenuOpen && (
                <div className="md:hidden fixed inset-x-0 top-16 bg-surface-container-lowest border-b border-secondary/20 py-6 px-6 z-50 ambient-shadow flex flex-col gap-5 animate-fade-slide-up">
                    <Link to="/" className="text-base text-on-surface hover:text-secondary">
                        Discover
                    </Link>
                    <Link to="/search" className="text-base text-on-surface hover:text-secondary">
                        Restaurants
                    </Link>
                    <button onClick={handleDashboardClick} className="text-base text-on-surface hover:text-secondary text-left cursor-pointer">
                        Reservations
                    </button>

                    <div className="border-t border-outline-variant/10 my-2"></div>

                    {user ? (
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-3">
                                <span className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center text-secondary text-sm uppercase">
                                    {user.name.charAt(0)}
                                </span>
                                <div>
                                    <p className="text-sm text-on-surface">{user.name}</p>
                                    <p className="text-xs text-black/55">{user.email}</p>
                                </div>
                            </div>
                            <Link to="/dashboard" className="text-sm font-medium text-black/55 hover:text-secondary">
                                My Bookings
                            </Link>
                            {user.role === "admin" && (
                                <Link to="/admin/dashboard" className="text-sm font-medium text-black/55 hover:text-secondary">
                                    Admin Console
                                </Link>
                            )}
                            {user.role === "owner" && (
                                <Link to="/owner/dashboard" className="text-sm font-medium text-black/55 hover:text-secondary">
                                    Owner Console
                                </Link>
                            )}
                            <button onClick={logout} className="text-sm font-medium text-error text-left cursor-pointer">
                                Sign Out
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => setAuthModalOpen(true)}
                                className="w-full border border-secondary/40 text-center py-3 text-sm font-medium text-on-surface hover:border-secondary cursor-pointer rounded-sm"
                            >
                                Sign In
                            </button>
                            <button
                                onClick={() => setAuthModalOpen(true)}
                                className="w-full bg-primary text-on-primary text-center py-3 text-xs font-medium tracking-widest uppercase hover:bg-secondary hover:text-on-secondary cursor-pointer rounded-sm"
                            >
                                Sign Up
                            </button>
                        </div>
                    )}
                </div>
            )}
        </nav>
    );
}
