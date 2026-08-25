import Link from "next/link";
import { PLAN_DEFINITIONS, formatPaiseAsInr, UNLIMITED } from "@digitel/shared";
import { BoltIcon, BrandMark, ChartIcon, MegaphoneIcon, UsersIcon } from "../components/icons";

const FEATURES = [
  {
    icon: MegaphoneIcon,
    title: "Bulk campaigns",
    body: "Import a contact list and send a templated broadcast to thousands of customers in minutes.",
  },
  {
    icon: BoltIcon,
    title: "Automations",
    body: "Auto-reply to keywords or greet new contacts instantly, day or night.",
  },
  {
    icon: ChartIcon,
    title: "Analytics",
    body: "Track delivery, read, and failure rates across every channel in one dashboard.",
  },
  {
    icon: UsersIcon,
    title: "Team access",
    body: "Invite your team with owner, admin, agent, and viewer roles built in.",
  },
];

export default function HomePage() {
  const plans = Object.values(PLAN_DEFINITIONS);

  return (
    <main>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <BrandMark className="h-8 w-8 text-brand-800" />
          <span className="text-lg font-bold tracking-tight text-slate-900">Digitel</span>
        </div>
        <div className="flex shrink-0 gap-3">
          <Link href="/login" className="btn-secondary">
            Log in
          </Link>
          <Link href="/register" className="btn-primary">
            Start free
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-10 sm:pt-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="badge badge-success">Bring your own Meta WhatsApp API</span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Scale your business with WhatsApp
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Connect your own Meta WhatsApp Business API and unlock bulk messaging, automation,
            and analytics — all from one dashboard.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-base">
              Start free trial
            </Link>
            <Link href="/login" className="btn-secondary px-6 py-3 text-base">
              Log in
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-800">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-3 font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Simple, transparent pricing</h2>
            <p className="mt-2 text-slate-500">Start free and scale as you grow.</p>
          </div>

          <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-3">
            {plans.map((plan) => {
              const popular = plan.code === "professional";
              return (
                <div
                  key={plan.code}
                  className={`card-hover relative rounded-xl border p-6 ${
                    popular ? "border-brand-700 shadow-card-hover" : "border-slate-200 shadow-card"
                  }`}
                >
                  {popular && (
                    <span className="badge badge-success absolute -top-3 left-1/2 -translate-x-1/2">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                  <p className="mt-2 text-3xl font-bold text-slate-900">
                    {formatPaiseAsInr(plan.priceInPaise)}
                    <span className="text-base font-normal text-slate-500">/month</span>
                  </p>
                  <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
                    <li>
                      {plan.maxContacts === UNLIMITED ? "Unlimited" : plan.maxContacts.toLocaleString()} contacts
                    </li>
                    <li>
                      {plan.maxChannels === UNLIMITED ? "Unlimited" : plan.maxChannels} WhatsApp channel(s)
                    </li>
                    <li>
                      {plan.maxAutomations === UNLIMITED ? "Unlimited" : plan.maxAutomations} automation(s)
                    </li>
                    <li>{plan.aiAutoReply ? "AI auto-reply included" : "No AI auto-reply"}</li>
                  </ul>
                  <Link
                    href="/register"
                    className={`mt-6 block ${popular ? "btn-primary" : "btn-secondary"}`}
                  >
                    Get started
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} Digitel
      </footer>
    </main>
  );
}
