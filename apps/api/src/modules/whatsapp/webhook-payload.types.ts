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
      };
    }[];
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
