import Link from "next/link";
import { PLAN_DEFINITIONS, formatPaiseAsInr, UNLIMITED } from "@starpos-crm/shared";
import {
  BoltIcon,
  BrandMark,
  CalendarIcon,
  ChartIcon,
  CheckIcon,
  FunnelIcon,
  MapPinIcon,
  MegaphoneIcon,
  PhoneIcon,
  PlusIcon,
  PresentationIcon,
  TrophyIcon,
} from "../components/icons";

const FEATURES = [
  {
    icon: MegaphoneIcon,
    tint: "bg-brand-50 text-brand-600",
    title: "WhatsApp broadcasts",
    body: "Send approved templates to thousands of customers from your own number, and see who read them.",
  },
  {
    icon: BoltIcon,
    tint: "bg-amber-50 text-amber-600",
    title: "Flows and auto-replies",
    body: "Answer keywords and greet new contacts instantly, day or night.",
  },
  {
    icon: FunnelIcon,
    tint: "bg-violet-50 text-violet-600",
    title: "Sales pipeline",
    body: "Leads from ads, walk-ins and chats on one board. Drag a deal forward when it moves.",
  },
  {
    icon: MapPinIcon,
    tint: "bg-red-50 text-red-600",
    title: "Field team app",
    body: "Reps call, check in at visits and log follow-ups from their phone. You see it live.",
  },
  {
    icon: CalendarIcon,
    tint: "bg-sky-50 text-sky-600",
    title: "Follow-ups that happen",
    body: "Today, upcoming and overdue in one list, so no enquiry goes cold.",
  },
  {
    icon: ChartIcon,
    tint: "bg-teal-50 text-teal-600",
    title: "Insights",
    body: "Delivery and read rates, calls, visits and closings, per rep and per month.",
  },
];

export default function HomePage() {
  const plans = Object.values(PLAN_DEFINITIONS);

  return (
    <main className="bg-canvas">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-9 w-9" />
          <span className="text-xl font-extrabold tracking-tight text-slate-900">StarPOS CRM</span>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/login" className="btn-ghost">
            Log in
          </Link>
          <Link href="/register" className="btn-primary">
            Start free
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-24 pt-8 lg:grid-cols-2 lg:pt-16">
        <div>
          <span className="badge badge-success">WhatsApp marketing + sales CRM</span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-6xl">
            More leads. <span className="text-brand-600">More sales.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-slate-600">
            Reach customers on WhatsApp with your own Meta API, then work every lead to a close — from the
            dashboard and from your team&apos;s phones.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-base">
              Start free
            </Link>
            <Link href="/login" className="btn-secondary px-6 py-3 text-base">
              Log in
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-slate-600">
            {["Free plan forever", "Your own WhatsApp number", "Android app for reps"].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckIcon className="h-4 w-4 text-brand-600" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto">
          <div className="absolute -inset-10 rounded-full bg-brand-200/40 blur-3xl" />
          <PhoneMock />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Everything from first message to closed deal</h2>
          <p className="mt-3 text-slate-500">One product for your marketing and your field sales team.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-hover p-6">
              <span className={`icon-chip h-12 w-12 ${f.tint}`}>
                <f.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200/70 bg-white py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Simple, transparent pricing</h2>
            <p className="mt-2 text-slate-500">Start free and upgrade as you grow.</p>
          </div>

          <div className="mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-3">
            {plans.map((plan) => {
              const popular = plan.code === "professional";
              return (
                <div
                  key={plan.code}
                  className={`relative rounded-2.5xl p-7 ${
                    popular
                      ? "bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-brand"
                      : "card"
                  }`}
                >
                  {popular && (
                    <span className="absolute -top-3 left-7 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-950">
                      Most popular
                    </span>
                  )}
                  <h3 className={`text-lg font-bold ${popular ? "text-white" : "text-slate-900"}`}>{plan.name}</h3>
                  <p className={`mt-3 text-4xl font-extrabold ${popular ? "text-white" : "text-slate-900"}`}>
                    {formatPaiseAsInr(plan.priceInPaise)}
                    <span className={`text-base font-medium ${popular ? "text-brand-100" : "text-slate-500"}`}>/month</span>
                  </p>
                  <ul className={`mt-6 space-y-2.5 text-sm ${popular ? "text-brand-50" : "text-slate-600"}`}>
                    {[
                      `${plan.maxContacts === UNLIMITED ? "Unlimited" : plan.maxContacts.toLocaleString("en-IN")} contacts`,
                      `${plan.maxChannels === UNLIMITED ? "Unlimited" : plan.maxChannels} WhatsApp ${plan.maxChannels === 1 ? "number" : "numbers"}`,
                      `${plan.maxAutomations === UNLIMITED ? "Unlimited" : plan.maxAutomations} ${plan.maxAutomations === 1 ? "flow" : "flows"}`,
                      "Sales CRM and field app",
                      plan.aiAutoReply ? "AI auto-reply" : null,
                    ]
                      .filter(Boolean)
                      .map((line) => (
                        <li key={line} className="flex items-center gap-2">
                          <CheckIcon className={`h-4 w-4 shrink-0 ${popular ? "text-white" : "text-brand-600"}`} />
                          {line}
                        </li>
                      ))}
                  </ul>
                  <Link
                    href="/register"
                    className={`mt-7 w-full ${
                      popular
                        ? "inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-brand-700 hover:bg-brand-50"
                        : "btn-secondary"
                    }`}
                  >
                    Get started
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200/70 bg-white py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 text-sm text-slate-400">
          <span className="flex items-center gap-2">
            <BrandMark className="h-6 w-6" />
            StarPOS CRM
          </span>
          <span>© {new Date().getFullYear()} StarPOS CRM</span>
        </div>
      </footer>
    </main>
  );
}

/** A static picture of the rep's home screen in the mobile app. */
function PhoneMock() {
  const tiles = [
    { icon: PhoneIcon, label: "Calls", value: "18", tint: "bg-red-50 text-red-600" },
    { icon: MapPinIcon, label: "Visits", value: "6", tint: "bg-amber-50 text-amber-600" },
    { icon: PresentationIcon, label: "Demos", value: "3", tint: "bg-sky-50 text-sky-600" },
    { icon: TrophyIcon, label: "Closings", value: "2", tint: "bg-brand-50 text-brand-600" },
  ];
  return (
    <div className="relative w-[300px] rounded-[2.75rem] border-[10px] border-ink-900 bg-canvas shadow-pop">
      <div className="px-5 pb-6 pt-7">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-bold text-white">
            V
          </span>
          <div>
            <p className="text-xs text-slate-500">Good morning</p>
            <p className="font-bold text-slate-900">Vijay</p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-4 text-white">
          <p className="text-xs text-brand-100">Monthly target</p>
          <p className="text-2xl font-extrabold">₹5,00,000</p>
          <div className="mt-3 h-1.5 rounded-full bg-white/25">
            <div className="h-1.5 w-[64%] rounded-full bg-white" />
          </div>
          <p className="mt-2 text-xs text-brand-50">₹3,20,000 achieved · 64%</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-2xl bg-white p-3 shadow-card">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.tint}`}>
                <t.icon className="h-4 w-4" />
              </span>
              <p className="mt-2 text-lg font-extrabold text-slate-900">{t.value}</p>
              <p className="text-xs text-slate-500">{t.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-2xl bg-white p-3 shadow-card">
          <p className="text-xs font-bold text-slate-900">Today&apos;s activities</p>
          {[
            ["Call · Spice Villa", "10:30 AM"],
            ["Visit · Urban Bites", "12:00 PM"],
          ].map(([what, when]) => (
            <div key={what} className="mt-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-brand-500" />
              <span className="flex-1 text-xs text-slate-700">{what}</span>
              <span className="text-[11px] text-slate-400">{when}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-around rounded-b-[2rem] border-t border-slate-200 bg-white py-3 text-slate-400">
        <span className="h-2 w-6 rounded-full bg-brand-600" />
        <span className="h-2 w-6 rounded-full bg-slate-200" />
        <span className="-mt-8 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-brand">
          <PlusIcon className="h-6 w-6" />
        </span>
        <span className="h-2 w-6 rounded-full bg-slate-200" />
        <span className="h-2 w-6 rounded-full bg-slate-200" />
      </div>
    </div>
  );
}
