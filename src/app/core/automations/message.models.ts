/**
 * Response shape for `GET /tenants/{t}/messages` — field names verified
 * against `services/api_php/src/Http/Handlers/MessageHandler.php` and
 * `src/Application/Messaging/MessageService.php`.
 *
 * `cost` is always provider-reported by the mock WhatsApp adapter, never a
 * hardcoded constant (blueprint §07 "never assume a fixed message
 * pricing") — the Angular UI MUST label it simulated/mock, not a real
 * charge.
 */
export interface MessageDelivery {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  provider: string;
  template_id: string | null;
  external_message_id: string | null;
  status: string;
  cost: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageListResponse {
  messages: MessageDelivery[];
}

export interface MessageListFilters {
  status?: string;
  lead_id?: string;
}
