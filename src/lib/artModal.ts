/** Plain left-click opens modal; modified click / middle-click follow href (new tab). */
export function openModalUnlessModifiedClick(
  e: React.MouseEvent<HTMLAnchorElement>,
  open: () => void
): void {
  if (e.defaultPrevented) return;
  if (e.button !== 0) return;
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  open();
}
