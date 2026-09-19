import type { ViewStyle } from "react-native";
import type { LeadStatus } from "@digitel/shared";

/**
 * "Emerald fresh" — the same palette as the web dashboard's tailwind `brand`
 * and `ink` scales, so both apps read as one product.
 */
export const colors = {
  brand: "#059669",
  brandDark: "#047857",
  brandDeep: "#065F46",
  brandLight: "#34D399",
  brandSoft: "#ECFDF5",
  accent: "#6EE7B7",
  ink: "#0F172A",
  navy: "#0F172A",
  text: "#334155",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "#E2E8F0",
  surface: "#FFFFFF",
  background: "#F4F7F6",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
  warning: "#D97706",
  warningSoft: "#FFFBEB",
  success: "#059669",
  successSoft: "#ECFDF5",
  info: "#0284C7",
  infoSoft: "#F0F9FF",
  violet: "#7C3AED",
  violetSoft: "#F5F3FF",
};

/** Hero gradient: bright emerald to deep green. */
export const heroGradient = ["#10B981", "#059669", "#065F46"] as const;

export const radius = { sm: 10, md: 16, lg: 20, xl: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

/** Soft card elevation that reads the same on Android and iOS. */
export const shadow: ViewStyle = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

export const brandShadow: ViewStyle = {
  shadowColor: "#059669",
  shadowOpacity: 0.35,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 6,
};

export const STAGE_COLORS: Record<LeadStatus, { fg: string; bg: string }> = {
  new: { fg: colors.info, bg: colors.infoSoft },
  contacted: { fg: "#4F46E5", bg: "#EEF2FF" },
  interested: { fg: colors.warning, bg: colors.warningSoft },
  qualified: { fg: "#0D9488", bg: "#F0FDFA" },
  demo_scheduled: { fg: colors.violet, bg: colors.violetSoft },
  proposal: { fg: colors.brandDark, bg: colors.brandSoft },
  won: { fg: colors.brandDeep, bg: "#D1FAE5" },
  lost: { fg: colors.muted, bg: "#F1F5F9" },
};
