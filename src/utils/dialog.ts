import { Accessor, createEffect, onCleanup } from 'solid-js';

export function createDialogFocus(
  open: Accessor<boolean>,
  element: Accessor<HTMLElement | undefined>,
  onEscape?: () => void,
) {
  createEffect(() => {
    if (!open()) return;
    const previous = document.activeElement;
    let disposed = false;
    let release = () => {};

    queueMicrotask(() => {
      if (disposed) return;
      const dialog = element();
      if (!dialog) return;
      const background: { element: HTMLElement; inert: boolean }[] = [];
      let branch: HTMLElement = dialog;
      while (branch.parentElement) {
        for (const sibling of branch.parentElement.children) {
          if (sibling instanceof HTMLElement && sibling !== branch) {
            background.push({ element: sibling, inert: sibling.hasAttribute('inert') });
            sibling.setAttribute('inert', '');
          }
        }
        branch = branch.parentElement;
      }

      const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]'
      )).filter((control) => {
        if (control.tabIndex < 0 || control.matches(':disabled') || control.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
        for (let node: HTMLElement | null = control; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (node === dialog) break;
        }
        return true;
      });
      const focusFirst = () => (controls()[0] ?? dialog).focus();
      const keydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onEscape?.();
        } else if (event.key === 'Tab') {
          const items = controls();
          const first = items[0];
          const last = items[items.length - 1];
          const active = document.activeElement;
          if (!first) {
            event.preventDefault();
            dialog.focus();
          } else if (event.shiftKey && (active === first || !items.includes(active as HTMLElement))) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && (active === last || !items.includes(active as HTMLElement))) {
            event.preventDefault();
            first.focus();
          }
        }
      };
      const focusin = (event: FocusEvent) => {
        if (event.target instanceof Node && !dialog.contains(event.target)) focusFirst();
      };
      document.addEventListener('keydown', keydown, true);
      document.addEventListener('focusin', focusin);
      focusFirst();
      release = () => {
        document.removeEventListener('keydown', keydown, true);
        document.removeEventListener('focusin', focusin);
        for (const item of background) {
          if (!item.inert) item.element.removeAttribute('inert');
        }
      };
    });

    onCleanup(() => {
      disposed = true;
      release();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    });
  });
}
