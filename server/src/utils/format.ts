// Times as the admin page shows them, in Vietnam's time zone.

export const time = (ms: number | null) =>
  ms == null
    ? '—'
    : new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, dateStyle: 'short', timeStyle: 'short' });

/** "5 phút trước", from the time of the page. */
export function ago(ms: number, now: number): string {
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
}
