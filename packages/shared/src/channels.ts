/** The messaging platforms a tenant can connect. Mirrors the Prisma `ChannelType` enum. */
export type ChannelType = "whatsapp" | "facebook" | "instagram" | "email";

export const CHANNEL_TYPES: readonly ChannelType[] = ["whatsapp", "facebook", "instagram", "email"];

export const CHANNEL_LABELS: Record<ChannelType, string> = {
  whatsapp: "WhatsApp",
  facebook: "Facebook Messenger",
  instagram: "Instagram DM",
  email: "Email",
};

/** A one-word tag for inbox rows, where the full label is too long. */
export const CHANNEL_SHORT_LABELS: Record<ChannelType, string> = {
  whatsapp: "WhatsApp",
  facebook: "Messenger",
  instagram: "Instagram",
  email: "Email",
};

/**
 * Meta closes the free-form reply window 24 hours after the contact's last
 * message on WhatsApp, Messenger and Instagram alike. Email has no such rule —
 * you can answer a year-old thread.
 */
export function channelHasReplyWindow(type: ChannelType): boolean {
  return type !== "email";
}

/** How a connected account is named in lists: its number, its title, or its own id. */
export function describeChannel(channel: {
  type: ChannelType;
  displayPhoneNumber?: string | null;
  displayName?: string | null;
  externalId?: string | null;
}): string {
  return (
    channel.displayPhoneNumber ||
    channel.displayName ||
    channel.externalId ||
    CHANNEL_LABELS[channel.type]
  );
}
