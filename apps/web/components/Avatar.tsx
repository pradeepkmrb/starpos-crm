const AVATAR_COLORS = [
  "from-brand-400 to-brand-600",
  "from-sky-400 to-sky-600",
  "from-violet-400 to-violet-600",
  "from-amber-400 to-amber-600",
  "from-rose-400 to-rose-600",
  "from-teal-400 to-cyan-600",
];

/** Initials on a colour picked from the name, so the same person always looks the same. */
export function Avatar({ name, size = "h-10 w-10 text-sm" }: { name: string; size?: string }) {
  const initials =
    name
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "#";
  const hash = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white ${size} ${
        AVATAR_COLORS[hash % AVATAR_COLORS.length]
      }`}
    >
      {initials}
    </span>
  );
}
