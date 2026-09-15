export interface MetaWebhookPayload {
  object: string;
  entry: {
    id: string;
    changes: {
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
      };
    }[];
  }[];
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
}
