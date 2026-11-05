import { createSignal, JSX, onCleanup, onMount, ParentComponent } from 'solid-js';
import { Portal } from 'solid-js/web';
import { createDialogFocus } from '../utils/dialog';

interface DrawerProps {
  /** Called once the panel has slid away. The caller unmounts the drawer then. */
  onClose: () => void;
  /** Hands the caller a dismiss that slides the panel out first, for its own close buttons. */
  dismissRef?: (dismiss: () => void) => void;
  'aria-labelledby'?: string;
  class?: string;
  style?: JSX.CSSProperties;
}

/** Past this share of its height, letting go closes the panel. */
const CLOSE_THRESHOLD = 0.25;
/** A downward flick faster than this (px/ms) closes it whatever the distance. */
const FLICK_VELOCITY = 0.4;
const DURATION = 500;

/**
 * A bottom sheet that slides up, follows the finger and closes on a drag down,
 * while the page behind it shrinks back a little. Rendered on body, since the
 * page's transform would otherwise move a fixed panel with it.
 */
const Drawer: ParentComponent<DrawerProps> = (props) => {
  let container: HTMLDivElement | undefined;
  let panel: HTMLDivElement | undefined;
  const [shown, setShown] = createSignal(false);
  const [offset, setOffset] = createSignal(0);
  const [dragging, setDragging] = createSignal(false);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.getElementById('root');
  let disposed = false;

  /** 1 when the panel is fully up, 0 when it is gone. */
  const progress = () => {
    if (!shown()) return 0;
    const height = panel?.offsetHeight || 1;
    return Math.max(0, Math.min(1, 1 - offset() / height));
  };

  const transition = () => (dragging() || reduced ? 'none' : `${DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`);

  // The page behind scales by the same progress as the panel, so it eases back as you drag.
  const paintBackground = () => {
    if (!root || disposed) return;
    const p = progress();
    const scale = 1 - (26 / window.innerWidth) * p;
    root.style.transition = transition() === 'none' ? 'none' : `transform ${transition()}, border-radius ${transition()}`;
    root.style.transformOrigin = `center ${window.scrollY}px`;
    root.style.transform = p > 0 ? `translateY(${14 * p}px) scale(${scale})` : '';
    root.style.borderRadius = p > 0 ? `${12 * p}px` : '';
    root.style.clipPath = p > 0 ? `inset(${window.scrollY}px 0 0 0 round ${12 * p}px)` : '';
  };

  let closing = false;
  const dismiss = () => {
    if (closing) return;
    closing = true;
    setDragging(false);
    setShown(false);
    paintBackground();
    setTimeout(() => props.onClose(), reduced ? 0 : DURATION);
  };
  props.dismissRef?.(dismiss);
  // The backdrop lives inside the container, so making the container the dialog keeps it out of the inert set.
  createDialogFocus(() => true, () => container, dismiss);

  onMount(() => {
    document.documentElement.dataset.drawerOpen = '';
    // Reading the height lays the panel out below the screen first, so the slide up has somewhere to start from.
    void panel?.offsetHeight;
    setShown(true);
    paintBackground();
  });
  onCleanup(() => {
    disposed = true;
    delete document.documentElement.dataset.drawerOpen;
    if (root) for (const key of ['transform', 'transformOrigin', 'transition', 'borderRadius', 'clipPath'] as const) root.style[key] = '';
  });

  let startY = 0;
  let lastY = 0;
  let lastTime = 0;
  let velocity = 0;
  let pointer: number | undefined;

  const onPointerDown = (event: PointerEvent) => {
    if (closing || event.button !== 0) return;
    pointer = event.pointerId;
    startY = lastY = event.clientY;
    lastTime = event.timeStamp;
    velocity = 0;
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== pointer || !panel) return;
    const dy = event.clientY - startY;
    if (!dragging()) {
      // Only a pull down from the top of the content drags; anything else scrolls.
      if (dy < 6 || panel.scrollTop > 0) {
        if (Math.abs(dy) >= 6) pointer = undefined;
        return;
      }
      setDragging(true);
      startY = event.clientY;
      panel.setPointerCapture(event.pointerId);
    }
    const dt = event.timeStamp - lastTime;
    if (dt > 0) velocity = (event.clientY - lastY) / dt;
    lastY = event.clientY;
    lastTime = event.timeStamp;
    const distance = event.clientY - startY;
    // Pulling up past the top gives a little, then resists.
    setOffset(distance >= 0 ? distance : -Math.sqrt(-distance) * 2);
    paintBackground();
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    pointer = undefined;
    if (!dragging() || !panel) return;
    const fling = velocity > FLICK_VELOCITY && event.timeStamp - lastTime < 100;
    if (fling || offset() > panel.offsetHeight * CLOSE_THRESHOLD) {
      dismiss();
      return;
    }
    setDragging(false);
    setOffset(0);
    paintBackground();
  };
  // A drag that started must not also scroll or bounce the page on touch screens.
  const onTouchMove = (event: TouchEvent) => { if (dragging()) event.preventDefault(); };
  // A drag ending on the panel fires a click on whatever is under the finger; swallow it.
  let wasDragging = false;
  const onClickCapture = (event: MouseEvent) => {
    if (!wasDragging) return;
    event.preventDefault();
    event.stopPropagation();
    wasDragging = false;
  };
  onMount(() => {
    panel?.addEventListener('touchmove', onTouchMove, { passive: false });
    panel?.addEventListener('click', onClickCapture, true);
  });
  onCleanup(() => {
    panel?.removeEventListener('touchmove', onTouchMove);
    panel?.removeEventListener('click', onClickCapture, true);
  });

  return (
    <Portal>
      <div ref={container} tabIndex={-1} class="fixed inset-0 z-40">
        <div
          class="absolute inset-0 bg-black/55"
          style={{ opacity: progress(), transition: transition() === 'none' ? 'none' : `opacity ${transition()}` }}
          onClick={dismiss}
        />
        <div class="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
          <div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={props['aria-labelledby']}
            class={`sheet pointer-events-auto max-h-[92dvh] w-full max-w-[40rem] overflow-y-auto overscroll-contain rounded-b-none ${props.class ?? ''}`}
            style={{
              ...props.style,
              transform: shown() ? `translateY(${offset()}px)` : 'translateY(100%)',
              transition: transition() === 'none' ? 'none' : `transform ${transition()}`,
            }}
            onPointerDown={(event) => { wasDragging = false; onPointerDown(event); }}
            onPointerMove={(event) => { onPointerMove(event); if (dragging()) wasDragging = true; }}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div aria-hidden="true" class="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-ink-faint/40" />
            {props.children}
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default Drawer;
