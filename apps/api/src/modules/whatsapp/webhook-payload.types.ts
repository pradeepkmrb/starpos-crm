export interface MetaWebhookPayload {
  /**
   * Which product sent this: "whatsapp_business_account", "page" (Messenger)
   * or "instagram". All three are delivered to the same webhook URL because
   * they belong to the same Meta app.
   */
  object: string;
  entry: {
    id: string;
    changes?: {
      field: string;
      value: {
        metadata?: { display_phone_number: string; phone_number_id: string };
        messages?: MetaInboundMessage[];
        statuses?: MetaStatusUpdate[];
        message_template_id?: string;
        message_template_name?: string;
        message_template_language?: string;
        event?: string;
      };
    }[];
    /** Messenger and Instagram put their events here rather than under `changes`. */
    messaging?: MetaMessagingEvent[];
  }[];
}

export interface MetaTemplateStatusUpdate {
  message_template_id: string;
  message_template_name?: string;
  message_template_language?: string;
  event?: string;
}

export interface MetaInboundMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

export interface MetaStatusUpdate {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
}

/**
 * One Messenger or Instagram event. Exactly one of message/postback/delivery/read
 * is present per event, and `sender`/`recipient` swap roles depending on the
 * direction — for an inbound message the recipient is our own Page or Instagram
 * account, which is how the channel is resolved.
 */
export interface MetaMessagingEvent {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    /** True on the copy Meta echoes back of a message the Page itself sent. */
    is_echo?: boolean;
    attachments?: { type?: string }[];
  };
  postback?: { mid?: string; title?: string; payload?: string };
  delivery?: { mids?: string[]; watermark?: number };
  read?: { watermark?: number };
}
