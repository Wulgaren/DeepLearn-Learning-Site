/**
 * Format an ISO date string for display in thread lists (e.g. "Feb 8, 2025, 2:30 PM").
 */
export function formatThreadDate(created_at: string): string {
  try {
    return new Date(created_at).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
