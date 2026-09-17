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
        // Meta lead ads (field: "leadgen") — a Page-level change, so it
        // carries no phone number metadata.
        leadgen_id?: string;
        form_id?: string;
        page_id?: string;
        ad_id?: string;
        created_time?: number;
        // Coexistence numbers (WhatsApp Business app + Cloud API) only.
        state_sync?: MetaStateSyncItem[];
        history?: MetaHistoryChunk[];
        message_echoes?: MetaCoexistenceMessage[];
      };
    }[];
    /** Messenger and Instagram put their events here rather than under `changes`. */
    messaging?: MetaMessagingEvent[];
  }[];
}

/** `smb_app_state_sync`: a contact from the business's WhatsApp Business app. */
export interface MetaStateSyncItem {
  type: string;
  action?: "add" | "remove" | string;
  contact?: { full_name?: string; first_name?: string; phone_number?: string };
  metadata?: { timestamp?: string };
}

/**
 * A message from `history` or `smb_message_echoes`. Echoes carry `to` (the
 * customer); history messages don't — their thread id is the customer.
 */
export interface MetaCoexistenceMessage {
  id: string;
  from: string;
  to?: string;
  timestamp?: string;
  type?: string;
  text?: { body: string };
  history_context?: { status?: string };
}

/** `history`: one chunk of the WhatsApp Business app's past chats, or why sharing was refused. */
export interface MetaHistoryChunk {
  metadata?: { phase?: number; chunk_order?: number; progress?: number };
  threads?: { id: string; messages?: MetaCoexistenceMessage[] }[];
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
}

export interface MetaLeadgenNotification {
  leadgen_id: string;
  form_id?: string;
  page_id?: string;
  ad_id?: string;
  created_time?: number;
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
  /** Present on "failed": why Meta could not deliver a message it had accepted. */
  errors?: {
    code?: number;
    title?: string;
    message?: string;
    error_data?: { details?: string };
  }[];
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
