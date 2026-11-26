/**
 * Returns today's local date in `YYYY-MM-DD` format for `<input type="date" [min]="...">`
 * so past (back) dates cannot be selected.
 */
export function localTodayDateString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns current local date-time in `YYYY-MM-DDTHH:mm` format for `<input type="datetime-local" [min]="...">`
 * so past (back) date-times cannot be selected.
 */
export function localNowDateTimeString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
