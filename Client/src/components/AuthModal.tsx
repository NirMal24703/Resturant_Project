import React, { useState } from "react";
import { useAppContext } from "../context/AppContext.tsx";
import { X, Mail, Lock, User, Phone } from "lucide-react";

const FIELD_ROW =
    "flex items-center gap-3 border-b border-outline-variant/60 focus-within:border-secondary transition-colors";
const FIELD_LABEL = "block text-left text-[10px] font-medium text-black/55 tracking-wider uppercase";
const FIELD_ICON = "shrink-0 text-black/55";
const FIELD_INPUT = "w-full min-w-0 bg-transparent py-2.5 text-sm leading-5 focus:outline-none";

export default function AuthModal() {
    const { isAuthModalOpen, setAuthModalOpen, login, register, authError, user } = useAppContext();
    const [isLoginTab, setIsLoginTab] = useState<boolean>(true);

    // Form states
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [phone, setPhone] = useState("");

    const [formLoading, setFormLoading] = useState(false);

    if (!isAuthModalOpen) return null;

    const resetForm = () => {
        setName("");
        setEmail("");
        setPassword("");
        setPhone("");
    };

    const handleClose = () => {
        resetForm();
        setAuthModalOpen(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormLoading(true);

        let success: boolean;

        if (isLoginTab) {
            success = await login(email, password);
        } else {
            success = await register(name, email, password, phone);
        }

        setFormLoading(false);
        if (success) {
            handleClose();
        }
    };

    const tabClass = (active: boolean) =>
        `flex-1 py-5 text-center text-xs font-medium tracking-widest transition-soft cursor-pointer ${
            active
                ? "text-primary border-b-2 border-primary bg-surface-container-lowest"
                : "text-black/55 hover:text-primary bg-surface-container-low/50 border-b-2 border-transparent"
        }`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={handleClose}></div>

            {/* Modal Container */}
            <div className="relative w-full max-w-md bg-white border border-outline-variant/30 ambient-shadow rounded-lg overflow-hidden z-10 flex flex-col animate-panel-in">
                {/* Close Button */}
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 text-black/55 hover:text-primary transition-colors cursor-pointer"
                    aria-label="Close"
                >
                    <X size={20} />
                </button>

                {/* Header Tabs */}
                <div className="flex border-b border-outline-variant/20">
                    <button onClick={() => setIsLoginTab(true)} className={tabClass(isLoginTab)}>
                        SIGN IN
                    </button>
                    <button onClick={() => setIsLoginTab(false)} className={tabClass(!isLoginTab)}>
                        SIGN UP
                    </button>
                </div>

                {/* Form Content */}
                <form onSubmit={handleSubmit} className="p-8 space-y-6 flex-1 flex flex-col justify-between">
                    <div>
                        <div className="text-center mb-8">
                            <h2 className="font-display text-2xl font-medium text-primary tracking-tight">Welcome to QuickDine</h2>
                            <p className="text-xs text-black/55 mt-2 leading-relaxed">
                                Access your exclusive reservations and curated dining profile.
                            </p>
                        </div>

                        {user && (
                            <div className="mb-5 border border-secondary/30 bg-secondary/5 px-4 py-3 rounded-sm">
                                <p className="text-xs text-black/55 leading-relaxed">
                                    Signed in as <span className="text-secondary">{user.name}</span>. Continuing will switch this
                                    device to the new account.
                                </p>
                            </div>
                        )}

                        {/* Server-side failures: wrong password, duplicate email, API down. */}
                        {authError && (
                            <div className="mb-5 border border-error/30 bg-error-container/30 px-4 py-3 rounded-sm">
                                <p className="text-xs text-error leading-relaxed">{authError}</p>
                            </div>
                        )}

                        <div className="space-y-5">
                            {/* Name Field (Register Only) */}
                            {!isLoginTab && (
                                <div className="space-y-1.5">
                                    <label htmlFor="qd-auth-name" className={FIELD_LABEL}>
                                        FULL NAME
                                    </label>
                                    <div className={FIELD_ROW}>
                                        <User size={16} className={FIELD_ICON} aria-hidden="true" />
                                        <input
                                            id="qd-auth-name"
                                            type="text"
                                            required={!isLoginTab}
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="Sarah Jenkins"
                                            autoComplete="name"
                                            className={FIELD_INPUT}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Email Field */}
                            <div className="space-y-1.5">
                                <label htmlFor="qd-auth-email" className={FIELD_LABEL}>
                                    EMAIL ADDRESS
                                </label>
                                <div className={FIELD_ROW}>
                                    <Mail size={16} className={FIELD_ICON} aria-hidden="true" />
                                    <input
                                        id="qd-auth-email"
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                        className={FIELD_INPUT}
                                    />
                                </div>
                            </div>

                            {/* Phone Field (Register Only) */}
                            {!isLoginTab && (
                                <div className="space-y-1.5">
                                    <label htmlFor="qd-auth-phone" className={FIELD_LABEL}>
                                        PHONE NUMBER (OPTIONAL)
                                    </label>
                                    <div className={FIELD_ROW}>
                                        <Phone size={16} className={FIELD_ICON} aria-hidden="true" />
                                        <input
                                            id="qd-auth-phone"
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="+1 (555) 000-0000"
                                            autoComplete="tel"
                                            className={FIELD_INPUT}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Password Field */}
                            <div className="space-y-1.5">
                                <label htmlFor="qd-auth-password" className={FIELD_LABEL}>
                                    PASSWORD
                                </label>
                                <div className={FIELD_ROW}>
                                    <Lock size={16} className={FIELD_ICON} aria-hidden="true" />
                                    <input
                                        id="qd-auth-password"
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        autoComplete={isLoginTab ? "current-password" : "new-password"}
                                        className={FIELD_INPUT}
                                    />
                                </div>
                            </div>

                            {!isLoginTab && (
                                <p className="text-[11px] text-black/55 leading-relaxed pt-1">
                                    Running a restaurant? Create your account first, then ask a QuickDine administrator to upgrade
                                    you to partner access.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Submit Buttons */}
                    <div className="mt-8">
                        <button
                            type="submit"
                            disabled={formLoading}
                            className="w-full bg-primary hover:bg-secondary text-white py-3.5 px-4 text-xs font-medium tracking-widest uppercase focus:outline-none transition-colors disabled:opacity-75 cursor-pointer"
                        >
                            {formLoading ? "PROCESSING..." : isLoginTab ? "LOGIN" : "CREATE ACCOUNT"}
                        </button>

                        <p className="text-center text-[11px] text-black/45 mt-4 leading-relaxed">
                            By signing in, you agree to our{" "}
                            <a href="#" className="underline hover:text-primary">
                                Terms of Service
                            </a>
                            .
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
}
