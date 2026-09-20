import { Alert, Linking, Platform, Share } from "react-native";
import { QUOTATION_STATUS_LABELS, type QuotationStatus } from "@digitel/shared";
import { ApiError, sendQuotation, updateQuotationStatus, type Quotation } from "./api";
import { formatRupees } from "./format";
import { colors } from "@/theme";

export const QUOTATION_COLORS: Record<QuotationStatus, { fg: string; bg: string }> = {
  draft: { fg: colors.muted, bg: "#F1F5F9" },
  sent: { fg: colors.info, bg: colors.infoSoft },
  accepted: { fg: colors.brandDeep, bg: "#D1FAE5" },
  rejected: { fg: colors.danger, bg: colors.dangerSoft },
};

export const quotationLabel = (status: QuotationStatus) => QUOTATION_STATUS_LABELS[status];

function notify(title: string, message: string) {
  if (Platform.OS === "web") globalThis.alert?.(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/**
 * Sends a quotation's PDF on WhatsApp through the workspace's number. When
 * that isn't possible (no chat with the customer in the last 24 hours, or no
 * WhatsApp number connected), offers to share it from the rep's own phone and
 * marks it sent once they do. Resolves with the latest quotation.
 */
export async function shareQuotation(quotation: Quotation): Promise<Quotation> {
  let result;
  try {
    result = await sendQuotation(quotation.id);
  } catch (err) {
    notify("Couldn't send", err instanceof ApiError ? err.message : "Something went wrong");
    return quotation;
  }
  if (result.delivered) {
    notify("Sent", `${quotation.number} is on its way to the customer's WhatsApp.`);
    return result.quotation;
  }

  const markSent = async () =>
    quotation.status === "draft" ? updateQuotationStatus(quotation.id, "sent").catch(() => quotation) : quotation;
  const message = `Quotation ${quotation.number} for ${formatRupees(quotation.totalPaise)}: ${result.pdfUrl}`;
  const shareLink = result.shareLink;

  const choice = await new Promise<"whatsapp" | "share" | "cancel">((resolve) => {
    if (Platform.OS === "web") {
      if (shareLink && globalThis.confirm?.(`${result.message}\n\nOpen WhatsApp to share it yourself?`)) resolve("whatsapp");
      else resolve("cancel");
      return;
    }
    Alert.alert("Share it yourself", result.message, [
      ...(shareLink ? [{ text: "Open WhatsApp", onPress: () => resolve("whatsapp" as const) }] : []),
      { text: "Share link…", onPress: () => resolve("share" as const) },
      { text: "Not now", style: "cancel" as const, onPress: () => resolve("cancel" as const) },
    ]);
  });

  if (choice === "whatsapp" && shareLink) {
    await Linking.openURL(shareLink);
    return markSent();
  }
  if (choice === "share") {
    const shared = await Share.share({ message });
    if (shared.action === Share.sharedAction) return markSent();
  }
  return quotation;
}
