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
  DocumentIcon,
  FunnelIcon,
  HomeIcon,
  LogoutIcon,
  MegaphoneIcon,
  ShieldIcon,
  SlidersIcon,
  UsersIcon,
} from "../../components/icons";

interface NavItem {
  href: string;
  label: string;
  icon: typeof HomeIcon;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ href: "/dashboard", label: "Home", icon: HomeIcon }] },
  {
    label: "Engage",
    items: [
      { href: "/dashboard/channels", label: "Connections", icon: ChatIcon },
      { href: "/dashboard/inbox", label: "Inbox", icon: ChatIcon },
      { href: "/dashboard/contacts", label: "Audience", icon: UsersIcon },
      { href: "/dashboard/templates", label: "Message Library", icon: DocumentIcon },
      { href: "/dashboard/campaigns", label: "Broadcasts", icon: MegaphoneIcon },
      { href: "/dashboard/automations", label: "Flows", icon: BoltIcon },
    ],
  },
  {
    label: "CRM",
    items: [
      { href: "/dashboard/leads", label: "Leads", icon: FunnelIcon },
      { href: "/dashboard/lead-fields", label: "Lead Fields", icon: SlidersIcon },
      { href: "/dashboard/lead-sources", label: "Meta Ads", icon: MegaphoneIcon },
    ],
  },
  { label: "Insights", items: [{ href: "/dashboard/analytics", label: "Insights", icon: ChartIcon }] },
  {
    label: "Workspace",
    items: [
      { href: "/dashboard/team", label: "Workspace", icon: UsersIcon },
      { href: "/dashboard/billing", label: "Plan & Usage", icon: CreditCardIcon },
    ],
  },
];

const AGENCY_NAV_ITEM: NavItem = { href: "/dashboard/platform-admin", label: "Agency Console", icon: ShieldIcon };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) return;
    me()
      .then((res) => {
        setUser(res.user);
        setTenant(res.tenant);
        setRole(res.role);
        setIsPlatformAdmin(res.isPlatformAdmin);
      })
      .catch(() => {
        // individual pages already handle 401 redirects; the shell just
        // stays in its loading state if this races with a bad token
      });
  }, [pathname]);

  const groups = isPlatformAdmin
    ? [...NAV_GROUPS, { label: "Agency", items: [AGENCY_NAV_ITEM] }]
    : NAV_GROUPS;
  const flatItems = groups.flatMap((g) => g.items);

  function isActive(href: string) {
    return href === "/dashboard" ? pathname === href : pathname?.startsWith(href);
  }

  function logout() {
    clearTokens();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-ink-900 md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <BrandMark className="h-8 w-8 text-brand-400" />
          <span className="font-display text-lg font-semibold tracking-tight text-white">Digitel</span>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {groups.map((group, i) => (
            <div key={group.label ?? `group-${i}`}>
              {group.label && <p className="nav-section-label">{group.label}</p>}
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-link ${isActive(item.href) ? "nav-link-active" : ""}`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
            <div className="flex items-center gap-2 md:hidden">
              <BrandMark className="h-6 w-6 text-brand-800" />
              <span className="font-display font-semibold text-slate-900">Digitel</span>
            </div>
            <div className="hidden md:block">
              {tenant && (
                <p className="text-sm font-medium text-slate-900">
                  {tenant.name}
                  {role && <span className="ml-2 badge badge-neutral capitalize">{role}</span>}
                </p>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-800 text-xs font-semibold text-white">
                  {(user?.name ?? user?.email ?? "?").charAt(0).toUpperCase()}
                </span>
                <span className="hidden sm:inline">{user?.name ?? user?.email}</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-card-hover">
                  <div className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500 sm:hidden">
                    {user?.name ?? user?.email}
                  </div>
                  <button
                    onClick={logout}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <LogoutIcon className="h-4 w-4" />
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
            {flatItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
                  isActive(item.href) ? "bg-brand-50 text-brand-800" : "text-slate-500"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
