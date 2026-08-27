/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
    clearToken,
    getMe,
    getToken,
    loginUser,
    registerUser,
    setToken as persistToken,
    updateProfile as updateProfileRequest,
    type ApiUser,
} from "../api.ts";

export interface AccountTransition {
    kind: "switch" | "welcome";
    from: { name: string; email: string } | null;
    to: { name: string; email: string; role: string };
}

interface AppContextType {
    user: ApiUser | null;
    token: string | null;
    loading: boolean;
    isAuthenticated: boolean;
    isAuthModalOpen: boolean;
    authError: string | null;
    accountTransition: AccountTransition | null;
    clearAccountTransition: () => void;
    setAuthModalOpen: (open: boolean) => void;
    login: (email: string, password: string) => Promise<boolean>;
    register: (name: string, email: string, password: string, phone?: string, role?: string) => Promise<boolean>;
    updateProfile: (changes: { name?: string; phone?: string }) => Promise<boolean>;
    logout: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

interface Props {
    children: React.ReactNode;
}

export const AppContextProvider = ({ children }: Props) => {
    const [user, setUser] = useState<ApiUser | null>(null);
    const [token, setTokenState] = useState<string | null>(() => getToken());
    const [loading, setLoading] = useState<boolean>(true);
    const [isAuthModalOpen, setAuthModalOpen] = useState<boolean>(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [accountTransition, setAccountTransition] = useState<AccountTransition | null>(null);

    const previousUser = useRef<ApiUser | null>(null);

    useEffect(() => {
        previousUser.current = user;
    }, [user]);

    const announceArrival = useCallback((account: ApiUser) => {
        const outgoing = previousUser.current;
        const switching = !!outgoing && outgoing._id !== account._id;

        setAccountTransition({
            kind: switching ? "switch" : "welcome",
            from: switching && outgoing ? { name: outgoing.name, email: outgoing.email } : null,
            to: { name: account.name, email: account.email, role: account.role },
        });
    }, []);

    const clearAccountTransition = useCallback(() => setAccountTransition(null), []);

    // On boot, exchange any stored token for the real account. An expired or
    // tampered token is discarded rather than trusted.
    useEffect(() => {
        let cancelled = false;

        const restore = async () => {
            if (!token) {
                setUser(null);
                setLoading(false);
                return;
            }
            try {
                const me = await getMe();
                if (!cancelled) setUser(me);
            } catch {
                if (!cancelled) {
                    clearToken();
                    setTokenState(null);
                    setUser(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        restore();
        return () => {
            cancelled = true;
        };
    }, [token]);

    const login = useCallback(async (email: string, password: string): Promise<boolean> => {
        setAuthError(null);
        try {
            const { token: issued, user: account } = await loginUser({ email, password });
            announceArrival(account);
            persistToken(issued);
            setTokenState(issued);
            setUser(account);
            return true;
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : "Sign in failed.");
            return false;
        }
    }, [announceArrival]);

    const register = useCallback(
        async (name: string, email: string, password: string, phone?: string, role?: string): Promise<boolean> => {
            setAuthError(null);
            try {
                const { token: issued, user: account } = await registerUser({ name, email, password, phone, role });
                announceArrival(account);
                persistToken(issued);
                setTokenState(issued);
                setUser(account);
                return true;
            } catch (error) {
                setAuthError(error instanceof Error ? error.message : "Sign up failed.");
                return false;
            }
        },
        [announceArrival],
    );

    const updateProfile = useCallback(async (changes: { name?: string; phone?: string }): Promise<boolean> => {
        setAuthError(null);
        try {
            setUser(await updateProfileRequest(changes));
            return true;
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : "Could not save your profile.");
            return false;
        }
    }, []);

    const logout = useCallback(() => {
        clearToken();
        setTokenState(null);
        setUser(null);
        window.location.href = "/";
    }, []);

    const value: AppContextType = {
        user,
        token,
        loading,
        isAuthenticated: !!user,
        isAuthModalOpen,
        authError,
        accountTransition,
        clearAccountTransition,
        setAuthModalOpen,
        login,
        register,
        updateProfile,
        logout,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error("useAppContext must be used within AppContextProvider");
    }
    return context;
};
