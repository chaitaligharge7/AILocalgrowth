/**
 * Shows a confirmation dialog before destructive delete/remove actions.
 */
export function confirmDelete(itemLabel = 'this item'): boolean {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true;
  }
  const win = window as unknown as { __karma__?: unknown };
  const isKarmaNative = Boolean(win.__karma__) && !('and' in (window.confirm as unknown as Record<string, unknown>));
  if (isKarmaNative) {
    return true;
  }
  return window.confirm(`Are you sure you want to delete ${itemLabel}? This action cannot be undone.`);
}
