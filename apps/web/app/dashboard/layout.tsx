"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { TenantRole } from "@digitel/shared";
import {
  clearTokens,
  getAccessToken,
  getFieldSummary,
  me,
  type AuthTenant,
  type AuthUser,
} from "../../lib/api";
import {
  BellIcon,
  BrandMark,
  ChevronDownIcon,
  CloseIcon,
  CollapseIcon,
  ExpandIcon,
  LogoutIcon,
  MenuIcon,
  PlusIcon,
  SearchIcon,
} from "../../components/icons";
import {
  AGENCY_NAV_ITEM,
  NAV_GROUPS,
  QUICK_ACTIONS,
  announceQuickAction,
  isNavActive,
  type NavGroup,
} from "../../components/nav";
import { CommandPalette } from "../../components/CommandPalette";
import { ToastProvider } from "../../components/Toaster";

const COLLAPSED_KEY = "digitel_sidebar_collapsed";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);
  const [role, setRole] = useState<TenantRole | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [overdue, setOverdue] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menu, setMenu] = useState<"user" | "new" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // storage blocked: default to expanded
    }
  }, []);

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
        // pages handle 401 redirects themselves
      });
    getFieldSummary()
      .then((s) => setOverdue(s.overdueCount))
      .catch(() => setOverdue(0));
  }, [pathname]);

  // Close drawers and menus on navigation.
  useEffect(() => {
    setDrawerOpen(false);
    setMenu(null);
  }, [pathname]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        // not persisted; fine
      }
      return !c;
    });
  }

  const groups: NavGroup[] = isPlatformAdmin
    ? [...NAV_GROUPS, { label: "Agency", items: [AGENCY_NAV_ITEM] }]
    : NAV_GROUPS;
  const allPages = groups.flatMap((g) => g.items);
  const current = [...allPages].sort((a, b) => b.href.length - a.href.length).find((i) => isNavActive(pathname, i.href));
  const displayName = user?.name ?? user?.email ?? "";

  function logout() {
    clearTokens();
    router.push("/login");
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-canvas">
        {/* Desktop sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-30 hidden flex-col bg-ink-900 transition-[width] duration-200 md:flex ${
            collapsed ? "w-[76px]" : "w-64"
          }`}
        >
          <Sidebar groups={groups} pathname={pathname} collapsed={collapsed} tenant={tenant} role={role} />
          <button
            type="button"
            onClick={toggleCollapsed}
            className="mx-3 mb-3 flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-300 hover:bg-white/5 hover:text-white"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ExpandIcon className="h-5 w-5" /> : <CollapseIcon className="h-5 w-5" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </aside>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-ink-950/50" onClick={() => setDrawerOpen(false)} />
            <aside className="relative flex h-full w-72 flex-col bg-ink-900">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="absolute right-3 top-5 rounded-lg p-1.5 text-ink-300 hover:bg-white/10"
                aria-label="Close menu"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
              <Sidebar groups={groups} pathname={pathname} collapsed={false} tenant={tenant} role={role} />
            </aside>
          </div>
        )}

        <div className={`transition-[padding] duration-200 ${collapsed ? "md:pl-[76px]" : "md:pl-64"}`}>
          <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
            <div className="flex items-center gap-3 px-4 py-3 md:px-8">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 md:hidden"
                aria-label="Open menu"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-slate-900">{current?.label ?? "Digitel"}</p>
                {tenant && <p className="hidden truncate text-xs text-slate-500 sm:block">{tenant.name}</p>}
              </div>

              <button
                type="button"
                onClick={openPalette}
                className="hidden h-10 w-64 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400 transition-colors hover:border-slate-300 hover:bg-white lg:flex"
              >
                <SearchIcon className="h-4 w-4" />
                <span className="flex-1 text-left">Search…</span>
                <kbd className="rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-400">
                  Ctrl K
                </kbd>
              </button>
              <button
                type="button"
                onClick={openPalette}
                className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
                aria-label="Search"
              >
                <SearchIcon className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-1 sm:gap-2" ref={menuRef}>
                <div className="relative">
                  <button type="button" onClick={() => setMenu(menu === "new" ? null : "new")} className="btn-primary px-3 sm:px-4">
                    <PlusIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">New</span>
                  </button>
                  {menu === "new" && (
                    <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-pop">
                      {QUICK_ACTIONS.map((action) => {
                        const Icon = action.icon;
                        return (
                          <Link
                            key={action.href}
                            href={action.href}
                            onClick={() => announceQuickAction(action.href)}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-800"
                          >
                            <Icon className="h-4 w-4" />
                            {action.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Link
                  href="/dashboard/follow-ups"
                  className="relative rounded-xl p-2 text-slate-600 hover:bg-slate-100"
                  aria-label={overdue ? `${overdue} overdue follow-ups` : "Follow-ups"}
                  title={overdue ? `${overdue} overdue follow-ups` : "No overdue follow-ups"}
                >
                  <BellIcon className="h-5 w-5" />
                  {overdue > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                      {overdue > 9 ? "9+" : overdue}
                    </span>
                  )}
                </Link>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenu(menu === "user" ? null : "user")}
                    className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 hover:bg-slate-100"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-xs font-bold text-white">
                      {displayName.charAt(0).toUpperCase() || "?"}
                    </span>
                    <span className="hidden max-w-[10rem] truncate text-sm font-semibold text-slate-700 sm:inline">
                      {displayName}
                    </span>
                    <ChevronDownIcon className="hidden h-4 w-4 text-slate-400 sm:block" />
                  </button>
                  {menu === "user" && (
                    <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-pop">
                      <div className="px-3 py-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                        <p className="truncate text-xs text-slate-500">
                          {tenant?.name}
                          {role ? ` · ${role}` : ""}
                        </p>
                      </div>
                      <div className="my-1 h-px bg-slate-100" />
                      <button
                        type="button"
                        onClick={logout}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-red-50 hover:text-red-700"
                      >
                        <LogoutIcon className="h-4 w-4" />
                        Log out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>

        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          pages={allPages}
          actions={QUICK_ACTIONS}
        />
      </div>
    </ToastProvider>
  );
}

function Sidebar({
  groups,
  pathname,
  collapsed,
  tenant,
  role,
}: {
  groups: NavGroup[];
  pathname: string | null;
  collapsed: boolean;
  tenant: AuthTenant | null;
  role: TenantRole | null;
}) {
  return (
    <>
      <Link href="/dashboard" className={`flex items-center gap-2.5 py-5 ${collapsed ? "justify-center px-0" : "px-5"}`}>
        <BrandMark className="h-9 w-9 shrink-0" />
        {!collapsed && <span className="text-xl font-extrabold tracking-tight text-white">Digitel</span>}
      </Link>

      <nav className={`flex-1 overflow-y-auto pb-4 ${collapsed ? "px-3" : "px-3"}`}>
        {groups.map((group, i) => (
          <div key={group.label ?? `group-${i}`}>
            {group.label &&
              (collapsed ? <div className="mx-3 my-3 h-px bg-white/10" /> : <p className="nav-section-label">{group.label}</p>)}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isNavActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`nav-link ${active ? "nav-link-active" : ""} ${collapsed ? "justify-center px-0" : ""}`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {!collapsed && item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {tenant && !collapsed && (
        <div className="mx-3 mb-2 rounded-2xl bg-white/5 p-3">
          <p className="truncate text-sm font-semibold text-white">{tenant.name}</p>
          <p className="text-xs capitalize text-ink-300">{role ?? "member"}</p>
        </div>
      )}
    </>
  );
}
