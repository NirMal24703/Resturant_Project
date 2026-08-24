/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
    loginUser,
    registerUser,
    getMe,
    getToken,
    setToken as persistToken,
    clearToken,
    type ApiUser,
} from "../api.ts";

interface AppContextType {
    user: ApiUser | null;
    token: string | null;
    loading: boolean;
    isAuthenticated: boolean;
    isAuthModalOpen: boolean;
    authError: string | null;
    setAuthModalOpen: (open: boolean) => void;
    login: (email: string, password: string) => Promise<boolean>;
    register: (name: string, email: string, password: string, phone?: string, role?: string) => Promise<boolean>;
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
            persistToken(issued);
            setTokenState(issued);
            setUser(account);
            return true;
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : "Sign in failed.");
            return false;
        }
    }, []);

    const register = useCallback(
        async (name: string, email: string, password: string, phone?: string, role?: string): Promise<boolean> => {
            setAuthError(null);
            try {
                const { token: issued, user: account } = await registerUser({ name, email, password, phone, role });
                persistToken(issued);
                setTokenState(issued);
                setUser(account);
                return true;
            } catch (error) {
                setAuthError(error instanceof Error ? error.message : "Sign up failed.");
                return false;
            }
        },
        [],
    );

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
        setAuthModalOpen,
        login,
        register,
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
