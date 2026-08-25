import Link from "next/link";
import { BrandMark } from "../../components/icons";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <Link href="/" className="mb-6 flex items-center gap-2">
        <BrandMark className="h-8 w-8 text-brand-800" />
        <span className="text-lg font-bold tracking-tight text-slate-900">Digitel</span>
      </Link>
      <div className="w-full max-w-sm card p-8">{children}</div>
    </div>
  );
}
