/**
 * Request/response shapes for `/tenants/{t}/automations` — field names
 * verified against `services/api_php/src/Http/Handlers/AutomationHandler.php`
 * and `src/Application/Messaging/AutomationService.php` (ground truth per
 * task brief).
 */

export type AutomationTrigger =
  | 'lead.created'
  | 'lead.follow_up'
  | 'lead.status_changed'
  | 'whatsapp.inbound_reply'
  | 'lead.owner_alert';

export const AUTOMATION_TRIGGERS: AutomationTrigger[] = [
  'lead.created',
  'lead.follow_up',
  'lead.status_changed',
  'whatsapp.inbound_reply',
  'lead.owner_alert',
];

/**
 * Wired triggers (all queued through the same consent/quiet-hours/quota-guarded
 * outbox worker — `docs/ADR/0051-whatsapp-backlog-slices.md`): `lead.created`,
 * `lead.follow_up` (delayed by `rules_json.delay_hours`), `lead.status_changed`
 * (optionally scoped by `rules_json.to_status`) and `whatsapp.inbound_reply`.
 * `lead.owner_alert` is stored but never fires — there is no owner
 * WhatsApp opt-in model.
 */
export const AUTOMATION_TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  'lead.created': 'Lead created — welcome message',
  'lead.follow_up': 'Follow-up — sent some hours after a lead is created',
  'lead.status_changed': 'Lead moved to a pipeline stage',
  'whatsapp.inbound_reply': 'Auto-reply to an inbound WhatsApp message',
  'lead.owner_alert': 'Owner alert (stored only — never fires, no owner opt-in model)',
};

export interface Automation {
  id: string;
  tenant_id: string;
  trigger_code: AutomationTrigger;
  template_id: string | null;
  rules_json: Record<string, unknown> | null;
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AutomationListResponse {
  automations: Automation[];
}

export interface CreateAutomationRequest {
  trigger_code: AutomationTrigger;
  /** Required by the backend for every sending trigger; must reference this tenant's own `approved` WhatsApp template. */
  template_id?: string;
  rules_json?: Record<string, unknown>;
  enabled?: boolean;
}

export interface UpdateAutomationRequest {
  template_id?: string | null;
  rules_json?: Record<string, unknown> | null;
  enabled?: boolean;
}
