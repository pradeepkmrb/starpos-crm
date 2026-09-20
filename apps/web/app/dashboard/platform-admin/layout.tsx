"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, getAccessToken, me } from "../../../lib/api";
import { PageSkeleton } from "../../../components/PageSkeleton";

const TABS = [
  { href: "/dashboard/platform-admin", label: "Meta Setup" },
  { href: "/dashboard/platform-admin/tenants", label: "Customers" },
  { href: "/dashboard/platform-admin/channels", label: "Connections" },
  { href: "/dashboard/platform-admin/subscriptions", label: "Billing" },
];

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    me()
      .then((res) => {
        if (!res.isPlatformAdmin) {
          router.push("/dashboard");
          return;
        }
        setAuthorized(true);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
        }
      })
      .finally(() => setChecked(true));
  }, [router]);

  if (!checked) return <PageSkeleton />;
  if (!authorized) return null;

  return (
    <div>
      <h1 className="page-title">Agency Console</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage the shared Meta App credentials, customers, connections, and billing across the whole
        agency.
      </p>

      <nav className="mt-4 flex gap-1 border-b border-slate-200">
        {TABS.map((tab) => {
          const active =
            tab.href === "/dashboard/platform-admin" ? pathname === tab.href : pathname?.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`border-b-2 px-3 py-2 text-sm font-medium ${
                active ? "border-brand-800 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6">{children}</div>
    </div>
  );
}
