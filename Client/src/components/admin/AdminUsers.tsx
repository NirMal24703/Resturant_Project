import { useMemo, useState } from "react";
import { Search, ShieldCheck, Store, UserRound } from "lucide-react";
import type { ApiUser, Role } from "../../api.ts";

interface AdminUsersProps {
    users: ApiUser[];
    currentUserId?: string;
    btnLoading: string | null;
    onChangeRole: (userId: string, role: Role) => Promise<void>;
}

const ROLE_OPTIONS: { value: Role; label: string; icon: typeof UserRound }[] = [
    { value: "user", label: "Guest", icon: UserRound },
    { value: "owner", label: "Partner", icon: Store },
    { value: "admin", label: "Admin", icon: ShieldCheck },
];

const ROLE_BADGE: Record<Role, string> = {
    user: "bg-surface text-black/55 border-outline-variant/30",
    owner: "bg-secondary-container text-on-secondary-container border-secondary/40",
    admin: "bg-primary text-on-primary border-primary",
};

export default function AdminUsers({ users, currentUserId, btnLoading, onChangeRole }: AdminUsersProps) {
    const [query, setQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState<Role | "all">("all");

    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return users.filter((u) => {
            if (roleFilter !== "all" && u.role !== roleFilter) return false;
            if (!needle) return true;
            return u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle);
        });
    }, [users, query, roleFilter]);

    return (
        <div className="space-y-6 text-left">
            <div className="space-y-2">
                <h3 className="font-display text-lg font-medium text-primary">Accounts & Access ({users.length})</h3>
                <p className="text-xs text-black/55 leading-relaxed">
                    Partner and administrator access is granted here. Everyone who signs up starts as a guest.
                </p>
            </div>

            <div className="flex flex-col md:flex-row gap-3 md:items-center">
                <div className="flex items-center gap-3 flex-1 bg-white border border-outline-variant/25 rounded-sm px-4 py-2.5">
                    <Search size={15} className="shrink-0 text-black/40" aria-hidden="true" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by name or email"
                        className="w-full min-w-0 bg-transparent text-sm leading-5 focus:outline-none"
                    />
                </div>

                <div className="flex gap-1.5 shrink-0">
                    {(["all", "user", "owner", "admin"] as const).map((value) => (
                        <button
                            key={value}
                            onClick={() => setRoleFilter(value)}
                            className={`px-3 py-2 text-[10px] font-medium tracking-wider uppercase rounded-sm border transition-colors cursor-pointer ${
                                roleFilter === value
                                    ? "bg-primary text-on-primary border-primary"
                                    : "bg-white text-black/55 border-outline-variant/25 hover:border-secondary/50"
                            }`}
                        >
                            {value === "all" ? "All" : ROLE_OPTIONS.find((r) => r.value === value)?.label}
                        </button>
                    ))}
                </div>
            </div>

            {visible.length === 0 ? (
                <div className="bg-white border border-outline-variant/10 p-12 text-center rounded-md">
                    <p className="text-xs text-black/55 italic">No accounts match that search.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {visible.map((account) => {
                        const isSelf = account._id === currentUserId;
                        const busy = btnLoading === account._id;

                        return (
                            <div
                                key={account._id}
                                className="bg-white border border-outline-variant/20 rounded-md p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                            >
                                <div className="flex items-center gap-4 min-w-0">
                                    <span className="size-10 shrink-0 rounded-full bg-secondary/15 border border-secondary/35 flex items-center justify-center text-sm uppercase text-secondary">
                                        {account.name.charAt(0)}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-sm text-on-surface truncate">
                                            {account.name}
                                            {isSelf && <span className="text-[10px] text-black/40 ml-2 uppercase tracking-wider">You</span>}
                                        </p>
                                        <p className="text-xs text-black/55 truncate">{account.email}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0 flex-wrap">
                                    <span
                                        className={`px-2.5 py-1 text-[9px] font-medium tracking-widest uppercase rounded-sm border ${ROLE_BADGE[account.role]}`}
                                    >
                                        {ROLE_OPTIONS.find((r) => r.value === account.role)?.label}
                                    </span>

                                    <div className="flex gap-1.5">
                                        {ROLE_OPTIONS.map(({ value, label, icon: Icon }) => (
                                            <button
                                                key={value}
                                                disabled={isSelf || busy || account.role === value}
                                                onClick={() => onChangeRole(account._id, value)}
                                                title={
                                                    isSelf
                                                        ? "You cannot change your own role"
                                                        : `Set ${account.name} to ${label}`
                                                }
                                                className="flex items-center gap-1.5 px-3 py-2 text-[9px] font-medium tracking-wider uppercase rounded-sm border border-outline-variant/30 text-black/55 hover:border-secondary hover:text-secondary transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:border-outline-variant/30 disabled:hover:text-black/55"
                                            >
                                                <Icon size={12} />
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
