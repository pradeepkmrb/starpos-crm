"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearTokens, getAccessToken, me, type AuthTenant, type AuthUser } from "../../lib/api";
import type { TenantRole } from "@digitel/shared";
import {
  BoltIcon,
  BrandMark,
  ChartIcon,
  ChatIcon,
  CreditCardIcon,
  HomeIcon,
  LogoutIcon,
  MegaphoneIcon,
  UsersIcon,
} from "../../components/icons";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: HomeIcon },
  { href: "/dashboard/analytics", label: "Analytics", icon: ChartIcon },
  { href: "/dashboard/channels", label: "WhatsApp Channels", icon: ChatIcon },
  { href: "/dashboard/contacts", label: "Contacts", icon: UsersIcon },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: MegaphoneIcon },
  { href: "/dashboard/automations", label: "Automations", icon: BoltIcon },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCardIcon },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);
  const [role, setRole] = useState<TenantRole | null>(null);

  useEffect(() => {
    if (!getAccessToken()) return;
    me()
      .then((res) => {
        setUser(res.user);
        setTenant(res.tenant);
        setRole(res.role);
      })
      .catch(() => {
        // individual pages already handle 401 redirects; the sidebar just
        // stays in its loading state if this races with a bad token
      });
  }, [pathname]);

  function logout() {
    clearTokens();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <BrandMark className="h-8 w-8 text-brand-800" />
          <span className="text-lg font-bold tracking-tight text-slate-900">Digitel</span>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/dashboard" ? pathname === item.href : pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={`nav-link ${active ? "nav-link-active" : ""}`}>
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          {tenant && user && role && (
            <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2">
              <p className="truncate text-sm font-semibold text-slate-900">{tenant.name}</p>
              <p className="truncate text-xs text-slate-500">
                {user.email} · <span className="font-medium">{role}</span>
              </p>
            </div>
          )}
          <button onClick={logout} className="nav-link w-full">
            <LogoutIcon className="h-5 w-5 shrink-0" />
            Log out
          </button>
        </div>
      </aside>

      <div className="md:pl-64">
        <header className="border-b border-slate-200 bg-white md:hidden">
          <div className="flex items-center gap-2 px-4 py-3">
            <BrandMark className="h-6 w-6 text-brand-800" />
            <span className="font-bold text-slate-900">Digitel</span>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {NAV_ITEMS.map((item) => {
              const active =
                item.href === "/dashboard" ? pathname === item.href : pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
                    active ? "bg-brand-50 text-brand-800" : "text-slate-500"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
