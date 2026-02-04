export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err != null) return String(err);
  return 'Something went wrong';
}
