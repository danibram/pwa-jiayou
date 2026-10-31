import { Component, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { HSKCharacter } from '../types';
import { SwipeHandlers, useSwipeDetector } from '../utils/swipeDetection';
import Card from './Card';

export interface SwipeStamp {
  text: string;
  tone: 'jade' | 'seal';
}

export interface SwipeableCardApi {
  /** Plays the same exit as a finger swipe, then runs that swipe's callback. */
  swipe: (direction: 'left' | 'right') => void;
}

interface SwipeableCardProps {
  character: HSKCharacter;
  flipped: boolean;
  onFlip: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  label?: string;
  reserveLabelSpace?: boolean;
  prompt?: string;
  concealCharacter?: boolean;
  fill?: boolean;
  hear?: boolean;
  recall?: boolean;
  coda?: string;
  /** Recall step: the card is not a button, so a tap does not reveal the answer. */
  still?: boolean;
  ariaLabel?: string;
  /** When false, horizontal drags are ignored (e.g. before the answer is revealed). */
  swipeEnabled?: boolean;
  /** Stamps shown on the card while dragging, keyed by drag direction. */
  stamps?: { left: SwipeStamp; right: SwipeStamp };
  api?: (api: SwipeableCardApi) => void;
}

const SwipeableCard: Component<SwipeableCardProps> = (props) => {
  const [exitDirection, setExitDirection] = createSignal<'left' | 'right' | null>(null);
  const [dragOffset, setDragOffset] = createSignal({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = createSignal(false);
  const [hadMovement, setHadMovement] = createSignal(false);
  let cardRef: HTMLDivElement | undefined;
  let exiting = false;
  let exitTimer: number | undefined;

  const handleClick = () => {
    // A drag that ends over the card still fires click; ignore it.
    if (!hadMovement()) props.onFlip();
  };

  const exit = (direction: 'left' | 'right', callback?: () => void) => {
    if (exiting) return;
    exiting = true;
    setExitDirection(direction);
    exitTimer = window.setTimeout(() => {
      callback?.();
      setExitDirection(null);
      exiting = false;
    }, 180);
  };

  const canSwipe = () => props.swipeEnabled !== false;

  const handlers: SwipeHandlers = {
    onSwipeLeft: () => canSwipe() && exit('left', props.onSwipeLeft),
    onSwipeRight: () => canSwipe() && exit('right', props.onSwipeRight),
    onDrag: (deltaX: number, deltaY: number) => {
      if (!canSwipe()) return;
      setIsDragging(true);
      setDragOffset({ x: deltaX, y: deltaY });
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) setHadMovement(true);
    },
    onDragEnd: () => {
      setIsDragging(false);
      setDragOffset({ x: 0, y: 0 });
      setTimeout(() => setHadMovement(false), 300);
    },
  };

  const swipeDetector = useSwipeDetector(handlers);

  onMount(() => {
    props.api?.({
      swipe: (direction) =>
        exit(direction, direction === 'left' ? props.onSwipeLeft : props.onSwipeRight),
    });
    if (cardRef) swipeDetector(cardRef);
  });

  onCleanup(() => {
    if (exitTimer) window.clearTimeout(exitTimer);
    swipeDetector(null);
  });

  const transform = () => {
    const exitDir = exitDirection();
    if (exitDir)
      return `translateX(${exitDir === 'left' ? -36 : 36}px) rotate(${exitDir === 'left' ? -4 : 4}deg)`;
    const { x, y } = dragOffset();
    if (!isDragging() || (x === 0 && y === 0)) return 'none';
    const rotation = Math.max(-12, Math.min(12, x / 16));
    return `translate(${x}px, ${y * 0.2}px) rotate(${rotation}deg)`;
  };

  const stampProgress = (direction: 'left' | 'right') => {
    const x = dragOffset().x;
    const signed = direction === 'right' ? x : -x;
    return Math.max(0, Math.min(1, (signed - 20) / 80));
  };

  const Stamp = (p: { direction: 'left' | 'right'; stamp: SwipeStamp }) => {
    return (
      <div
        class="absolute top-8 z-10 px-3 py-1 rounded-lg border-2 font-display text-xl font-semibold uppercase tracking-wider pointer-events-none"
        classList={{
          'left-6 -rotate-12': p.direction === 'right',
          'right-6 rotate-12': p.direction === 'left',
          'text-jade border-jade bg-jade-soft/80': p.stamp.tone === 'jade',
          'text-seal border-seal bg-seal-soft/80': p.stamp.tone === 'seal',
        }}
        style={{ opacity: stampProgress(p.direction) }}
      >
        {p.stamp.text}
      </div>
    );
  };

  return (
    <div
      ref={cardRef}
      class="relative select-none will-change-transform"
      classList={{
        'flex h-full min-h-0 w-full flex-1 flex-col': props.fill,
        'cursor-pointer': !props.still,
        'transition-[transform,opacity] duration-200 ease-out': !isDragging(),
        'opacity-0': exitDirection() !== null,
      }}
      style={{ transform: transform(), 'touch-action': 'pan-y' }}
      onClick={props.still ? undefined : handleClick}
      role={props.still ? undefined : 'button'}
      aria-label={
        props.still
          ? undefined
          : (props.ariaLabel ?? (props.flipped ? 'Ocultar el significado' : 'Mostrar el significado'))
      }
    >
      <Show when={props.stamps}>
        {(stamps) => (
          <>
            <Stamp direction="right" stamp={stamps().right} />
            <Stamp direction="left" stamp={stamps().left} />
          </>
        )}
      </Show>
      <Card
        character={props.character}
        flipped={props.flipped}
        label={props.label}
        reserveLabelSpace={props.reserveLabelSpace}
        prompt={props.prompt}
        concealCharacter={props.concealCharacter}
        fill={props.fill}
        hear={props.hear}
        recall={props.recall}
        coda={props.coda}
      />
    </div>
  );
};

export default SwipeableCard;
