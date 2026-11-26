/**
 * Formats a UTC ISO-8601 instant as a local wall-clock time + an explicit
 * timezone label (blueprint §3.1 Calendar spec "timezone visible" — e.g.
 * "10:30 AM IST"), so a calendar entry is never shown as a bare UTC
 * instant or an ambiguous local time with no zone marker.
 *
 * `Intl.DateTimeFormat`'s `timeZoneName: 'short'` reliably returns
 * recognizable abbreviations for most zones, but commonly renders
 * `Asia/Kolkata` as a generic UTC offset ("GMT+5:30") rather than "IST" —
 * the explicit lookup below overrides exactly the zones the blueprint and
 * this product (India-first, Asia/Kolkata default) actually need.
 */
const KNOWN_ABBREVIATIONS: Record<string, string> = {
  'Asia/Kolkata': 'IST',
  'Asia/Calcutta': 'IST',
  UTC: 'UTC',
  Etc_UTC: 'UTC',
};

export function timezoneAbbreviation(timezone: string): string {
  if (KNOWN_ABBREVIATIONS[timezone]) {
    return KNOWN_ABBREVIATIONS[timezone];
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'short' }).formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart?.value ?? timezone;
  } catch {
    return timezone;
  }
}

/** e.g. `formatLocalWithZone('2026-12-10T05:00:00Z', 'Asia/Kolkata')` -> `"10:30 AM IST"`. */
export function formatLocalWithZone(utcIso: string, timezone: string): string {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) {
    return utcIso;
  }
  let time: string;
  try {
    time = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    time = date.toISOString();
  }
  return `${time} ${timezoneAbbreviation(timezone)}`;
}

/** e.g. `"10 Dec 2026, 10:30 AM IST"` — used where the date itself (not only the time) must be shown. */
export function formatLocalDateTimeWithZone(utcIso: string, timezone: string): string {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) {
    return utcIso;
  }
  let dateTime: string;
  try {
    dateTime = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    dateTime = date.toISOString();
  }
  return `${dateTime} ${timezoneAbbreviation(timezone)}`;
}
