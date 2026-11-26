/**
 * Response shape for `GET /tenants/{t}/whatsapp/templates` — field names
 * verified against
 * `services/api_php/src/Http/Handlers/WhatsAppTemplateHandler.php` and
 * `src/Application/Messaging/WhatsAppTemplateService.php`.
 *
 * There is no real WABA template-review process reachable from this
 * codebase (no real Meta Cloud API credentials — see
 * `docs/INTEGRATIONS.md`): the catalog is 3 deterministic mock-approved
 * templates seeded per tenant on first request. `mock_provider` is always
 * `true` on every row — the Angular UI MUST badge every row with it,
 * per blueprint §09 "Integration simulation requires visible
 * `MOCK_PROVIDER` badge in nonproduction previews."
 */
export interface WhatsAppTemplate {
  id: string;
  provider: 'whatsapp';
  external_template_id: string;
  category: string;
  language: string;
  status: string;
  variables: string[];
  mock_provider: true;
}

export interface WhatsAppTemplateListResponse {
  templates: WhatsAppTemplate[];
}
