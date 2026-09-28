import type { ViewStyle } from "react-native";
import type { LeadStatus } from "@starpos-crm/shared";

/**
 * StarPOS blue and green, taken from the logo — the same palette as the web
 * dashboard's tailwind `brand`, `leaf` and `ink` scales, so both apps read
 * as one product.
 */
export const colors = {
  brand: "#034694",
  brandDark: "#033A7A",
  brandDeep: "#042F63",
  brandLight: "#4A86CF",
  brandSoft: "#EEF5FC",
  green: "#00A03A",
  greenDark: "#006E29",
  greenSoft: "#EBF9F0",
  accent: "#2BB962",
  ink: "#0F172A",
  navy: "#062147",
  text: "#334155",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "#E2E8F0",
  surface: "#FFFFFF",
  background: "#F3F6FB",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
  warning: "#D97706",
  warningSoft: "#FFFBEB",
  success: "#00A03A",
  successSoft: "#EBF9F0",
  info: "#0284C7",
  infoSoft: "#F0F9FF",
  violet: "#7C3AED",
  violetSoft: "#F5F3FF",
};

/** Hero gradient: bright StarPOS blue to deep navy. */
export const heroGradient = ["#1A63B5", "#034694", "#042F63"] as const;

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
  shadowColor: "#034694",
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
  won: { fg: colors.greenDark, bg: "#CFF1DC" },
  lost: { fg: colors.muted, bg: "#F1F5F9" },
};
