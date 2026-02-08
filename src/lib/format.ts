/**
 * Format an ISO date string for display in thread lists (e.g. "Feb 8, 2025").
 */
export function formatThreadDate(created_at: string): string {
  try {
    return new Date(created_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}
