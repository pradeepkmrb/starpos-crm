import type { LeadStatus } from "@digitel/shared";

/** Digitel's brand teal, matching the web dashboard's tailwind `brand` scale. */
export const colors = {
  brand: "#128C7E",
  brandDark: "#0B5E55",
  brandSoft: "#E7F6F3",
  accent: "#25D366",
  ink: "#0F172A",
  text: "#334155",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "#E2E8F0",
  surface: "#FFFFFF",
  background: "#F8FAFC",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  warning: "#B45309",
  warningSoft: "#FEF3C7",
  success: "#15803D",
  successSoft: "#DCFCE7",
  info: "#1D4ED8",
  infoSoft: "#DBEAFE",
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const STAGE_COLORS: Record<LeadStatus, { fg: string; bg: string }> = {
  new: { fg: colors.info, bg: colors.infoSoft },
  contacted: { fg: colors.warning, bg: colors.warningSoft },
  interested: { fg: colors.warning, bg: colors.warningSoft },
  qualified: { fg: colors.success, bg: colors.successSoft },
  demo_scheduled: { fg: colors.brandDark, bg: colors.brandSoft },
  proposal: { fg: colors.brandDark, bg: colors.brandSoft },
  won: { fg: colors.success, bg: colors.successSoft },
  lost: { fg: colors.danger, bg: colors.dangerSoft },
};
