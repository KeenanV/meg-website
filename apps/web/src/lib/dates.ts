const formatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
});
/** Calendar dates stay on their recorded day in every developer/build timezone. */
export function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && date.toISOString().slice(0, 10) !== value) return '';
  return formatter.format(date);
}
