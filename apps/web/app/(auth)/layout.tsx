import Link from "next/link";
import { BrandLockupOnDark, BrandLogo, CheckIcon, TrendUpIcon } from "../../components/icons";

const POINTS = [
  "Broadcasts, inbox and flows on your own WhatsApp number",
  "A sales pipeline your team can work from their phones",
  "Visit check-ins, follow-ups and targets in one place",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-500 via-brand-700 to-ink-950 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-leaf-500/20" />

        <Link href="/" className="relative">
          <BrandLockupOnDark markClassName="h-11 w-11" textClassName="text-2xl" />
        </Link>

        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">
            More leads. More sales. A stronger tomorrow.
          </h2>
          <ul className="mt-8 space-y-3">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3 text-brand-50">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-leaf-500">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                {point}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex items-center gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-leaf-500">
              <TrendUpIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm text-brand-100">Monthly target</p>
              <p className="text-xl font-bold">₹3,20,000 of ₹5,00,000</p>
              <div className="mt-2 h-1.5 w-56 rounded-full bg-white/20">
                <div className="h-1.5 w-[64%] rounded-full bg-leaf-400" />
              </div>
            </div>
          </div>
        </div>
        <p className="relative mt-10 text-xs text-brand-100/80">Track · Engage · Convert · Grow</p>
      </div>

      <div className="flex flex-col items-center justify-center bg-canvas px-4 py-12">
        <Link href="/" className="mb-8 lg:hidden">
          <BrandLogo className="h-12" />
        </Link>
        <div className="card w-full max-w-md p-8 sm:p-10">{children}</div>
      </div>
    </div>
  );
}
