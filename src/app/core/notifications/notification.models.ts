/**
 * Request/response shapes for `/tenants/{t}/notifications*` — field names
 * verified against `services/api_php/src/Http/Handlers/NotificationHandler.php`
 * and `src/Application/Notifications/NotificationService.php`.
 */

export interface AppNotification {
  id: string;
  tenant_id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  notifications: AppNotification[];
}
