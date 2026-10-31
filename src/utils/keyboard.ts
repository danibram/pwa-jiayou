/** Page shortcuts leave focused controls and open dialogs to handle their own keys. */
export function shouldHandleShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return false;
  const target = event.target;
  if (target instanceof Element && target.closest(
    'button, a, input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="tab"], [role="checkbox"]'
  )) return false;
  return !document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]');
}
