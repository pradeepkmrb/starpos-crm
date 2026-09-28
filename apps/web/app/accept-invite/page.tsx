"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, acceptInvite } from "../../lib/api";
import { BrandLogo } from "../../components/icons";

function AcceptInviteForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [form, setForm] = useState({ name: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await acceptInvite({ token, name: form.name || undefined, password: form.password || undefined });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <Link href="/" className="mb-6">
        <BrandLogo className="h-10" />
      </Link>
      <div className="w-full max-w-sm card p-8">
        {!token ? (
          <p className="text-sm text-red-600">Missing invite token.</p>
        ) : (
          <>
            <h1 className="text-xl font-bold text-slate-900">Accept invite</h1>
            <p className="mt-1 text-sm text-slate-500">
              If you&apos;re new here, set a name and password. Existing accounts can leave these blank.
            </p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <label className="block">
                <span className="field-label">Name (new accounts only)</span>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="field-label">Password (new accounts only)</span>
                <input
                  type="password"
                  minLength={8}
                  className="input"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Joining…" : "Accept & join"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptInviteForm />
    </Suspense>
  );
}
