/**
 * Request/response shapes for `/tenants/{t}/support/tickets*` — field names
 * verified against `services/api_php/src/Http/Handlers/SupportHandler.php`,
 * `src/Application/Support/SupportService.php` and
 * `src/Application/Support/SupportTicketStateMachine.php` (ground truth per
 * task brief).
 */

export type SupportCategory = 'billing' | 'technical' | 'content' | 'integrations' | 'account' | 'other';
export type SupportPriority = 'low' | 'normal' | 'high' | 'urgent';
export type SupportStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';

export const SUPPORT_CATEGORIES: SupportCategory[] = [
  'billing',
  'technical',
  'content',
  'integrations',
  'account',
  'other',
];
export const SUPPORT_PRIORITIES: SupportPriority[] = ['low', 'normal', 'high', 'urgent'];
export const SUPPORT_ALL_STATUSES: SupportStatus[] = [
  'open',
  'in_progress',
  'waiting_customer',
  'resolved',
  'closed',
];

/**
 * Mirrors `App\Application\Support\SupportTicketStateMachine::TRANSITIONS`
 * exactly, so the UI can grey out/hide a transition the backend would
 * reject with 409 `INVALID_STATE_TRANSITION` — this is UX convenience
 * only; the backend independently re-validates every transition.
 */
export const SUPPORT_STATUS_TRANSITIONS: Record<SupportStatus, SupportStatus[]> = {
  open: ['in_progress', 'resolved', 'closed'],
  in_progress: ['waiting_customer', 'resolved', 'closed'],
  waiting_customer: ['in_progress', 'resolved', 'closed'],
  resolved: ['in_progress', 'closed'],
  closed: ['open'],
};

export function canTransitionSupportStatus(from: SupportStatus, to: SupportStatus): boolean {
  return (SUPPORT_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  body: string;
  internal_only: boolean;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  tenant_id: string;
  requester_id: string;
  assignee_id: string | null;
  category: SupportCategory;
  priority: SupportPriority;
  status: SupportStatus;
  subject: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  age_seconds: number;
  time_since_last_response_seconds: number | null;
}

export interface SupportAttachment {
  id: string;
  ticket_id: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  download_url: string;
  created_at: string;
}

export interface SupportTicketCsat {
  rating: number;
  comment: string | null;
  rated_by: string | null;
  rated_at: string;
}

export interface RateSupportTicketRequest {
  rating: number;
  comment?: string;
}

export interface SupportTicketDetail extends SupportTicket {
  messages: SupportMessage[];
  attachments?: SupportAttachment[];
  csat?: SupportTicketCsat | null;
}

export interface SupportTicketListResponse {
  tickets: SupportTicket[];
}

export interface CreateSupportTicketRequest {
  category: SupportCategory;
  priority?: SupportPriority;
  subject: string;
  body: string;
}

export interface AddSupportMessageRequest {
  body: string;
  /** Always rejected (403 FORBIDDEN) for tenant members — see SupportService docblock. */
  internal_only?: boolean;
}

export interface ChangeSupportStatusRequest {
  status: SupportStatus;
}
