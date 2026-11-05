import HanziWriter from 'hanzi-writer';
import {
  Component,
  createEffect,
  createResource,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { loadStrokeData, themeColor, themeMix } from '../utils/strokeData';
import { isDark, onThemeChange } from '../utils/theme';
import RiceGrid from './RiceGrid';

export type StrokeMode = 'watch' | 'write';

export interface StrokeCanvasApi {
  play: () => void;
  restartQuiz: () => void;
  hint: () => void;
  /** Gives up on the quiz and animates the whole character. */
  showAnswer: (onDone?: () => void) => void;
}

interface StrokeCanvasProps {
  char: string;
  mode: StrokeMode;
  /** In watch mode: show strokes 0..step statically instead of the writer. */
  step: number | null;
  showOutline: boolean;
  /** Faint strokes while tracing with the guide off. Memory mode stays blank. */
  ghost?: boolean;
  /** Where to show the gold start dot while writing: always, after a pause, or never. */
  startHint?: 'always' | 'idle' | 'never';
  /** Edge-to-edge board, without a side border or rounded corners. */
  bleed?: boolean;
  onHint?: () => void;
  /**
   * Misses on one stroke before the canvas shows where it goes. Defaults to 2. Writing from memory
   * passes 3, so two misses on a stroke can still end as Difícil.
   */
  hintAfterMisses?: number;
  /** The canvas showed a stroke by itself after `hintAfterMisses` misses on it. Once per stroke. */
  onAutoHint?: (strokeNum: number) => void;
  onReady?: (strokeCount: number) => void;
  onAnimating?: (animating: boolean) => void;
  onStroke?: (done: number, mistakes: number) => void;
  onMistake?: (strokeNum: number, mistakes: number) => void;
  onComplete?: (mistakes: number) => void;
  /** Three misses on one stroke: that stroke is drawn for the learner, once per stroke. */
  onStrokeCeiling?: (strokeNum: number) => void;
  /** Eight misses in all: time to show the whole character. Fires once per quiz. */
  onTotalCeiling?: () => void;
  /** First sight of a character: strokes animate about 1.5x slower. */
  slow?: boolean;
  /** Keep the learner's own strokes on the board for a moment after finishing, and under a shown answer. */
  echoInk?: boolean;
  api?: (api: StrokeCanvasApi) => void;
}

const STROKE_CEILING = 3;
const TOTAL_CEILING = 8;

const StrokeCanvas: Component<StrokeCanvasProps> = (props) => {
  let host: HTMLDivElement | undefined;
  let frame: HTMLDivElement | undefined;
  let writer: HanziWriter | undefined;
  let quizStroke = 0;
  let quizMistakes = 0;
  let animationRun = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const [currentStroke, setCurrentStroke] = createSignal(0);
  const [quizActive, setQuizActive] = createSignal(false);
  const [idle, setIdle] = createSignal(false);
  const [cueHidden, setCueHidden] = createSignal(false);
  /** Two misses on the current stroke: show where it starts, whatever the hint setting. */
  const [stuck, setStuck] = createSignal(false);
  /** What the learner drew on a wrong stroke, shown in red for a moment. */
  const [misses, setMisses] = createSignal<{ id: number; d: string }[]>([]);
  let missId = 0;
  const pathOf = (points: { x: number; y: number }[]) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  /** Everything the learner drew in this quiz, right and wrong, for "Tu trazo". */
  const [drawn, setDrawn] = createSignal<string[]>([]);
  const [inkShown, setInkShown] = createSignal(false);
  /** The stroke a "Pista" points at. It stays until the learner starts drawing. */
  const [hinted, setHinted] = createSignal<number | null>(null);
  let inkTimer: ReturnType<typeof setTimeout> | undefined;
  let ceilingStrokes = new Set<number>();
  let helpedStrokes = new Set<number>();
  let totalCeilingHit = false;
  const hintAfter = () => Math.max(1, props.hintAfterMisses ?? 2);
  const keepInk = (points: { x: number; y: number }[]) => {
    if (points.length >= 2) setDrawn((list) => [...list, pathOf(points)]);
  };
  const showMiss = (points: { x: number; y: number }[]) => {
    if (points.length < 2) return;
    const id = ++missId;
    const d = pathOf(points);
    setMisses((list) => [...list, { id, d }]);
    setTimeout(() => setMisses((list) => list.filter((miss) => miss.id !== id)), 700);
  };
  const armIdle = () => {
    clearTimeout(idleTimer);
    setIdle(false);
    idleTimer = setTimeout(() => setIdle(true), 3000);
  };

  const [data] = createResource(() => props.char, loadStrokeData);

  const startQuiz = () => {
    if (!writer) return;
    quizStroke = 0;
    quizMistakes = 0;
    setCurrentStroke(0);
    setCueHidden(false);
    setStuck(false);
    setMisses([]);
    setDrawn([]);
    setInkShown(false);
    setHinted(null);
    clearTimeout(inkTimer);
    ceilingStrokes = new Set();
    helpedStrokes = new Set();
    totalCeilingHit = false;
    setQuizActive(true);
    armIdle();
    props.onStroke?.(0, 0);
    writer.cancelQuiz();
    writer.hideCharacter({ duration: 0 });
    if (props.showOutline) writer.showOutline({ duration: 0 });
    else writer.hideOutline({ duration: 0 });
    writer.quiz({
      showHintAfterMisses: hintAfter(),
      leniency: 1.1,
      onCorrectStroke: (s) => {
        keepInk(s.drawnPath.points);
        quizStroke = s.strokeNum + 1;
        setCurrentStroke(quizStroke);
        setCueHidden(false);
        setStuck(false);
        armIdle();
        props.onStroke?.(quizStroke, s.totalMistakes);
      },
      onMistake: (s) => {
        quizMistakes = s.totalMistakes;
        showMiss(s.drawnPath.points);
        keepInk(s.drawnPath.points);
        if (s.mistakesOnStroke >= hintAfter() && !stuck()) {
          setStuck(true);
          setCueHidden(false);
          writer?.highlightStroke(s.strokeNum);
        }
        if (s.mistakesOnStroke >= hintAfter() && !helpedStrokes.has(s.strokeNum)) {
          helpedStrokes.add(s.strokeNum);
          props.onAutoHint?.(s.strokeNum);
        }
        props.onMistake?.(s.strokeNum, quizMistakes);
        if (s.mistakesOnStroke >= STROKE_CEILING && !ceilingStrokes.has(s.strokeNum)) {
          ceilingStrokes.add(s.strokeNum);
          // Draw it for them, then let them carry on.
          setHinted(s.strokeNum);
          writer?.highlightStroke(s.strokeNum);
          props.onStrokeCeiling?.(s.strokeNum);
        }
        if (s.totalMistakes >= TOTAL_CEILING && !totalCeilingHit) {
          totalCeilingHit = true;
          props.onTotalCeiling?.();
        }
      },
      onComplete: (summary) => {
        setQuizActive(false);
        clearTimeout(idleTimer);
        setHinted(null);
        if (props.echoInk && drawn().length > 0) {
          setInkShown(true);
          clearTimeout(inkTimer);
          inkTimer = setTimeout(() => setInkShown(false), 1100);
        }
        props.onComplete?.(summary.totalMistakes);
      },
    });
  };

  const play = async () => {
    if (!writer) return;
    const run = ++animationRun;
    const total = data()?.strokes.length ?? 0;
    props.onAnimating?.(true);
    if (props.showOutline) writer.showOutline({ duration: 0 });
    await writer.hideCharacter({ duration: 0 });
    for (let i = 0; i < total; i++) {
      if (run !== animationRun) return;
      await writer.animateStroke(i);
    }
    if (run !== animationRun) return;
    writer.showCharacter({ duration: 0 });
    props.onAnimating?.(false);
  };

  const enterMode = () => {
    if (!writer) return;
    animationRun++;
    props.onAnimating?.(false);
    if (props.mode === 'write') {
      startQuiz();
    } else {
      setQuizActive(false);
      writer.cancelQuiz();
      writer.showCharacter({ duration: 0 });
    }
  };

  const size = () => frame?.clientWidth ?? 300;

  onMount(() => {
    if (!host) return;
    const ink = themeColor('ink');
    writer = HanziWriter.create(host, props.char, {
      width: size(),
      height: size(),
      padding: 8,
      showOutline: props.showOutline,
      showCharacter: props.mode === 'watch',
      strokeColor: ink,
      radicalColor: ink,
      outlineColor: themeMix('ink', 'surface', 0.22),
      drawingColor: themeColor('ink', 0.75),
      highlightColor: themeColor('gold'),
      drawingWidth: Math.max(14, Math.round(size() / 22)),
      strokeAnimationSpeed: props.slow ? 0.72 : 1.1,
      delayBetweenStrokes: props.slow ? 420 : 280,
      strokeFadeDuration: 250,
      charDataLoader: (char, onLoad, onError) => {
        loadStrokeData(char).then(onLoad, onError);
      },
      onLoadCharDataSuccess: (d) => props.onReady?.(d.strokes.length),
    });
    // quiz() waits for the character data internally.
    if (props.mode === 'write') startQuiz();

    // The writer bakes colours in at creation, so a theme switch must repaint them.
    const repaint = () => {
      if (!writer) return;
      const next = themeColor('ink');
      writer.updateColor('strokeColor', next);
      writer.updateColor('radicalColor', next);
      writer.updateColor('outlineColor', themeMix('ink', 'surface', 0.22));
      writer.updateColor('drawingColor', themeColor('ink', 0.75));
      writer.updateColor('highlightColor', themeColor('gold'));
    };
    onCleanup(onThemeChange(repaint));

    props.api?.({
      play,
      restartQuiz: startQuiz,
      hint: () => {
        props.onHint?.();
        setHinted(quizStroke);
        writer?.highlightStroke(quizStroke);
      },
      showAnswer: (onDone) => {
        if (!writer) return;
        writer.cancelQuiz();
        setQuizActive(false);
        clearTimeout(idleTimer);
        setHinted(null);
        // The model is drawn over what the learner wrote, so they can compare.
        if (props.echoInk && drawn().length > 0) {
          clearTimeout(inkTimer);
          setInkShown(true);
        }
        writer.hideCharacter({ duration: 0 });
        writer.animateCharacter({ onComplete: () => onDone?.() });
      },
    });

    const observer = new ResizeObserver(() => {
      const s = size();
      writer?.updateDimensions({ width: s, height: s, padding: 8 });
    });
    if (frame) observer.observe(frame);
    onCleanup(() => observer.disconnect());
  });

  createEffect(
    on(
      () => props.char,
      (char) => {
        if (!writer) return;
        animationRun++;
        props.onAnimating?.(false);
        writer.cancelQuiz();
        writer.setCharacter(char).then(enterMode);
      },
      { defer: true }
    )
  );

  createEffect(on(() => props.mode, enterMode, { defer: true }));

  createEffect(
    on(
      () => props.showOutline,
      (show) => (show ? writer?.showOutline({ duration: 0 }) : writer?.hideOutline({ duration: 0 })),
      { defer: true }
    )
  );

  onCleanup(() => {
    writer?.cancelQuiz();
    clearTimeout(idleTimer);
    clearTimeout(inkTimer);
    animationRun++;
  });

  const showStartDot = () =>
    props.mode === 'write' &&
    quizActive() &&
    !cueHidden() &&
    (stuck() || props.startHint === 'always' || (props.startHint === 'idle' && idle()));

  // A 撇 starts with a short sideways press. Aim along the stroke after that flick.
  const aim = (pts: number[][]) => {
    const at = (dist: number): [number, number] => {
      let walked = 0;
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i][0] - pts[i - 1][0];
        const dy = pts[i][1] - pts[i - 1][1];
        const step = Math.hypot(dx, dy) || 1;
        if (walked + step >= dist || i === pts.length - 1) {
          const t = Math.min(1, Math.max(0, (dist - walked) / step));
          return [pts[i - 1][0] + dx * t, pts[i - 1][1] + dy * t];
        }
        walked += step;
      }
      const last = pts[pts.length - 1] ?? pts[0];
      return [last[0], last[1]];
    };
    const dir = (a: [number, number], b: [number, number]) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [(b[0] - a[0]) / len, (b[1] - a[1]) / len] as const;
    };
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    const start: [number, number] = [pts[0][0], pts[0][1]];
    const flick = dir(start, at(Math.min(40, total * 0.25)));
    const probe = dir(at(Math.min(70, total * 0.35)), at(Math.min(150, total * 0.8)));
    const turn = Math.abs(Math.atan2(flick[0] * probe[1] - flick[1] * probe[0], flick[0] * probe[0] + flick[1] * probe[1]));
    // A long 撇 keeps falling left after the opening. Aim along that body, not the first vertical bit.
    if (turn > Math.PI / 4) return dir(at(total * 0.25), at(total * 0.7));
    const chord = dir(start, at(total * 0.35));
    // A 横 often opens with a hook, then runs straight. Follow that run, not the hook.
    const limit = total * 0.45;
    let walked = 0;
    let best = 0;
    let bestDir: readonly [number, number] = chord;
    for (let i = 1; i < pts.length && walked < limit; i++) {
      const ax = pts[i - 1][0];
      const ay = pts[i - 1][1];
      const bx = pts[i][0];
      const by = pts[i][1];
      const seg = Math.hypot(bx - ax, by - ay) || 1;
      const usable = Math.min(seg, limit - walked);
      if (usable > best) {
        best = usable;
        bestDir = dir([ax, ay], [bx, by]);
      }
      walked += seg;
    }
    const bend = Math.abs(
      Math.atan2(
        chord[0] * bestDir[1] - chord[1] * bestDir[0],
        chord[0] * bestDir[0] + chord[1] * bestDir[1],
      ),
    );
    return bend > 0.26 ? bestDir : chord;
  };

  const along = (pts: number[][], dist: number): [number, number] => {
    let walked = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0];
      const dy = pts[i][1] - pts[i - 1][1];
      const step = Math.hypot(dx, dy) || 1;
      if (walked + step >= dist || i === pts.length - 1) {
        const t = Math.min(1, Math.max(0, (dist - walked) / step));
        return [pts[i - 1][0] + dx * t, pts[i - 1][1] + dy * t];
      }
      walked += step;
    }
    const last = pts[pts.length - 1] ?? pts[0];
    return [last[0], last[1]];
  };

  // The head sits on the start. A side step stays inside 12px, and only if the ink is clear.
  const cue = (pts: number[][], index: number) => {
    const [ux, uy] = aim(pts);
    const px = -uy;
    const py = ux;
    const svgW = Math.max(240, (frame?.clientWidth ?? 390) - 16);
    const unit = 1024 / svgW;
    const head = 14 * unit;
    const wing = 5 * unit;
    const wanted = 28 * unit;
    const side = 12 * unit;
    const reach = 18 * unit;
    const [ox, oy] = pts[0];
    const fits = (x: number, y: number) => x >= 28 && x <= 996 && y >= 16 && y <= 884;
    const strokes = data()?.strokes ?? [];
    const ctx = document.createElement('canvas').getContext('2d');
    const outlines = strokes.map((d) => new Path2D(d));
    const hitsOther = (samples: [number, number][]) => {
      if (!ctx) return 0;
      let n = 0;
      for (const [x, y] of samples) {
        for (let i = 0; i < outlines.length; i++) {
          if (i === index) continue;
          if (ctx.isPointInPath(outlines[i], x, y)) {
            n++;
            break;
          }
        }
      }
      return n;
    };
    const clearOf = Math.sqrt(reach * reach - side * side);
    const slots: { alongDist: number; off: number }[] = [
      { alongDist: 0, off: 0 },
      { alongDist: 0, off: side },
      { alongDist: 0, off: -side },
      { alongDist: clearOf, off: side },
      { alongDist: clearOf, off: -side },
      { alongDist: reach, off: 0 },
      { alongDist: 28 * unit, off: 0 },
      { alongDist: 36 * unit, off: 0 },
      { alongDist: 48 * unit, off: 0 },
      { alongDist: 28 * unit, off: side },
      { alongDist: 28 * unit, off: -side },
      { alongDist: 48 * unit, off: side },
      { alongDist: 48 * unit, off: -side },
    ];
    let pick: { x: number; y: number; shaft: number; off: number; hits: number; alongDist: number } | null =
      null;
    for (const slot of slots) {
      let shaft = wanted;
      let placed = false;
      while (shaft >= 16 * unit) {
        const [bx, by] = along(pts, slot.alongDist);
        const x = bx + ux * head + px * slot.off;
        const y = by + uy * head + py * slot.off;
        const base: [number, number] = [x - ux * head, y - uy * head];
        const tail: [number, number] = [x - ux * (head + shaft), y - uy * (head + shaft)];
        const left: [number, number] = [base[0] + px * wing, base[1] + py * wing];
        const right: [number, number] = [base[0] - px * wing, base[1] - py * wing];
        const mid: [number, number] = [(base[0] + tail[0]) / 2, (base[1] + tail[1]) / 2];
        const thick = 11;
        const band = (p: [number, number]): [number, number][] => [
          p,
          [p[0] + px * thick, p[1] + py * thick],
          [p[0] - px * thick, p[1] - py * thick],
        ];
        const samples: [number, number][] = [
          [x, y],
          base,
          left,
          right,
          ...band(tail),
          ...band(mid),
          [(x + left[0]) / 2, (y + left[1]) / 2],
          [(x + right[0]) / 2, (y + right[1]) / 2],
        ];
        if (samples.every(([sx, sy]) => fits(sx, sy))) {
          const hits = hitsOther(samples);
          const better =
            !pick ||
            hits < pick.hits ||
            (hits === pick.hits && Math.abs(slot.off) < Math.abs(pick.off)) ||
            (hits === pick.hits && slot.off === pick.off && slot.alongDist < pick.alongDist) ||
            (hits === pick.hits &&
              slot.off === pick.off &&
              slot.alongDist === pick.alongDist &&
              shaft > pick.shaft);
          if (better) pick = { x, y, shaft, off: slot.off, hits, alongDist: slot.alongDist };
          placed = true;
          break;
        }
        shaft -= 4 * unit;
      }
      if (placed && pick && pick.hits === 0 && pick.off === 0 && pick.alongDist === 0 && pick.shaft === wanted) {
        break;
      }
    }
    const x = pick?.x ?? ox + ux * head;
    const y = pick?.y ?? oy + uy * head;
    const shaft = pick?.shaft ?? wanted;
    const beside = !!pick && pick.off !== 0;
    return {
      shaft: `M ${x - ux * (head + shaft)} ${y - uy * (head + shaft)} L ${x - ux * head} ${y - uy * head}`,
      chevron: `M ${x} ${y} L ${x - ux * head + px * wing} ${y - uy * head + py * wing} L ${x - ux * head - px * wing} ${y - uy * head - py * wing} Z`,
      halo: beside ? 16 : 22,
      ring: beside ? 6 : 8,
    };
  };

  const outlinePath = () => {
    if (props.mode !== 'write' || !props.showOutline || !quizActive()) return undefined;
    return data()?.strokes[currentStroke()];
  };
  const ghostStrokes = () => (props.ghost && quizActive() ? data()?.strokes : undefined);
  const watchFrame = () => {
    const strokes = data();
    const step = props.step;
    if (props.mode !== 'watch' || step === null || !strokes) return undefined;
    return { strokes: strokes.strokes, medians: strokes.medians, step };
  };

  return (
    <div
      ref={frame}
      onPointerDown={() => {
        setCueHidden(true);
        setHinted(null);
        if (props.mode === 'write') armIdle();
      }}
      class="relative aspect-square w-full overflow-hidden bg-surface"
      classList={{
        'rounded-card border border-line/80': !props.bleed,
        'border-y border-line/80': !!props.bleed,
      }}
      style={{ 'touch-action': props.mode === 'write' ? 'none' : 'auto' }}
    >
      <RiceGrid class="absolute inset-0" frame={false} />
      <div
        ref={host}
        class="absolute inset-0 transition-opacity duration-200"
        classList={{ 'opacity-0': props.mode === 'watch' && props.step !== null }}
        aria-label={
          props.mode === 'write'
            ? `Escribe ${props.char} con el dedo`
            : `Animación de ${props.char}`
        }
        role="img"
      />

      {/* Pista: the stroke to draw next, held until the pen goes down. */}
      <Show when={props.mode === 'write' && hinted() !== null ? data()?.strokes[hinted() as number] : undefined}>
        {(path) => (
          <svg viewBox="0 0 1024 1024" class="absolute inset-2 pointer-events-none animate-fade" aria-hidden="true">
            <g transform="translate(0, 900) scale(1, -1)">
              <path d={path()} fill="rgb(var(--gold))" fill-opacity="0.55" />
            </g>
          </svg>
        )}
      </Show>

      {/* Tu trazo: the learner's own strokes, faint, next to the model. */}
      <Show when={inkShown()}>
        <svg viewBox="0 0 1024 1024" class="absolute inset-2 pointer-events-none animate-fade" aria-hidden="true">
          <g transform="translate(0, 900) scale(1, -1)">
            <For each={drawn()}>
              {(d) => (
                <path d={d} fill="none" stroke="rgb(var(--seal))" stroke-opacity="0.45" stroke-width="40" stroke-linecap="round" stroke-linejoin="round" />
              )}
            </For>
          </g>
        </svg>
        <span class="pointer-events-none absolute left-3 top-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-seal/80">
          Tu trazo
        </span>
      </Show>

      {/* A wrong stroke stays visible in red long enough to see what went wrong. */}
      <Show when={props.mode === 'write' && misses().length > 0}>
        <svg viewBox="0 0 1024 1024" class="absolute inset-2 pointer-events-none" aria-hidden="true">
          <g transform="translate(0, 900) scale(1, -1)">
            <For each={misses()}>
              {(miss) => (
                <path
                  d={miss.d}
                  ref={(el) => {
                    // Reduced motion keeps the red stroke still until it is removed.
                    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
                    el.animate?.([{ opacity: 0.85 }, { opacity: 0.85, offset: 0.35 }, { opacity: 0 }], { duration: 650, easing: 'ease-out', fill: 'forwards' });
                  }}
                  fill="none"
                  stroke="rgb(var(--seal))"
                  stroke-width="48"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              )}
            </For>
          </g>
        </svg>
      </Show>

      {/* The stroke you are tracing. The others stay a faint outline under this. */}
      <Show when={outlinePath()}>
        {(path) => (
        <svg
          viewBox="0 0 1024 1024"
          class="absolute inset-2 pointer-events-none"
          aria-hidden="true"
        >
          <g transform="translate(0, 900) scale(1, -1)">
            <path d={path()} fill="rgb(var(--stroke))" />
          </g>
        </svg>
        )}
      </Show>

      {/* Guía off still shows a ghost, so Calcar is not an empty board. */}
      <Show when={ghostStrokes()}>
        {(strokes) => (
        <svg viewBox="0 0 1024 1024" class="absolute inset-2 pointer-events-none" aria-hidden="true">
          <g transform="translate(0, 900) scale(1, -1)">
            <For each={strokes()}>
              {(path) => <path d={path} fill={themeMix('ink', 'surface', 0.14)} />}
            </For>
          </g>
        </svg>
        )}
      </Show>

      {/* Step view: earlier strokes in ink, the current one in gold with its direction. */}
      <Show when={watchFrame()}>
        {(frame) => (
        <svg
          viewBox="0 0 1024 1024"
          class="absolute inset-2 animate-fade"
          aria-hidden="true"
        >
          <g transform="translate(0, 900) scale(1, -1)">
            <For each={frame().strokes}>
              {(path, i) => (
                <path
                  d={path}
                  fill={
                    i() === frame().step
                      ? 'rgb(var(--stroke))'
                      : themeMix(
                          'ink',
                          'surface',
                          isDark()
                          ? i() < frame().step
                            ? 0.29
                            : 0.13
                          : i() < frame().step
                            ? 0.36
                            : 0.2,
                        )
                  }
                />
              )}
            </For>
            <Show when={frame().medians[frame().step]} keyed>
              {(points) => {
                const mark = cue(points, frame().step);
                return (
                  <>
                    <path d={mark.shaft} fill="none" stroke="rgb(var(--surface))" stroke-width={mark.halo} stroke-linecap="round" />
                    <path d={mark.shaft} fill="none" stroke="rgb(var(--gold-deep))" stroke-width="18" stroke-linecap="round" />
                    <path
                      d={mark.chevron}
                      fill="rgb(var(--gold-deep))"
                      stroke="rgb(var(--surface))"
                      stroke-width={mark.ring}
                      stroke-linejoin="round"
                      paint-order="stroke fill"
                    />
                  </>
                );
              }}
            </Show>
          </g>
        </svg>
        )}
      </Show>

      {/* Where the next stroke begins, only while tracing with the guide on. */}
      <Show when={showStartDot() ? data()?.medians[currentStroke()] : false} keyed>
        {(points) => (
          <svg
            viewBox="0 0 1024 1024"
            class="absolute inset-2 pointer-events-none animate-fade"
            aria-hidden="true"
          >
            <g transform="translate(0, 900) scale(1, -1)">
              {(() => {
                const mark = cue(points, currentStroke());
                return (
                  <>
                    <path d={mark.shaft} fill="none" stroke="rgb(var(--surface))" stroke-width={mark.halo} stroke-linecap="round" />
                    <path d={mark.shaft} fill="none" stroke="rgb(var(--gold-deep))" stroke-width="18" stroke-linecap="round" />
                    <path
                      d={mark.chevron}
                      fill="rgb(var(--gold-deep))"
                      stroke="rgb(var(--surface))"
                      stroke-width={mark.ring}
                      stroke-linejoin="round"
                      paint-order="stroke fill"
                    />
                  </>
                );
              })()}
            </g>
          </svg>
        )}
      </Show>

      <Show when={data.error}>
        <div class="absolute inset-0 flex items-center justify-center text-ink-soft text-sm p-6 text-center">
          No hay datos de trazos para este carácter.
        </div>
      </Show>
    </div>
  );
};

export default StrokeCanvas;
