import { Component, type JSX, createResource, createSignal, createUniqueId, For, Show } from 'solid-js';
import RiceGrid from './RiceGrid';
import { loadStrokeData } from '../utils/strokeData';

/** Median line of a stroke and its length, in the stroke data's 1024 grid. */
const medianOf = (points: number[][]) => {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return { d: points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' '), length };
};

/** A pen width that covers the widest stroke, so the clip shows the whole stroke once drawn. */
const PEN = 160;
const STROKE_GAP_MS = 120;
const strokeMs = (length: number) => Math.round(180 + length * 0.7);

/**
 * The character drawn from its stroke data, with the radical's strokes in jade.
 * Until the data loads, or when it is missing, the font draws the character instead.
 * With `animate` it writes itself stroke by stroke over a faint outline, and a tap writes it again.
 */
const CharacterGlyph: Component<{
  char: string;
  class?: string;
  style?: JSX.CSSProperties;
  /** Colour the radical. Off where the character should read as one shape. */
  showRadical?: boolean;
  animate?: boolean;
  onStrokeCount?: (count: number) => void;
}> = (props) => {
  const id = createUniqueId();
  /** Bumped on tap; a new value re-mounts the strokes, which restarts their animation. */
  const [run, setRun] = createSignal(0);
  const [data] = createResource(
    () => props.char,
    (char) =>
      loadStrokeData(char).then(
        (loaded) => {
          props.onStrokeCount?.(loaded.strokes.length);
          return loaded;
        },
        () => undefined,
      ),
  );
  const radical = () => new Set(props.showRadical === false ? [] : data()?.radStrokes ?? []);
  const colour = (index: number) => (radical().has(index) ? 'rgb(var(--jade))' : 'rgb(var(--ink))');
  /** When each stroke starts and how long it takes. */
  const timing = () => {
    let at = 0;
    return (data()?.medians ?? []).map((points) => {
      const median = medianOf(points);
      const start = at;
      at += strokeMs(median.length) + STROKE_GAP_MS;
      return { ...median, start };
    });
  };

  const glyph = () => (
    <Show
      when={data()}
      fallback={
        // Drawn in a viewBox so the font scales with the box, whatever its size.
        <svg viewBox="0 0 100 100" class="absolute inset-0 h-full w-full" role="img" aria-label={props.char}>
          <text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-size="72" fill="currentColor" class="font-hanzi" lang="zh-CN">
            {props.char}
          </text>
        </svg>
      }
    >
      {(loaded) => (
        <svg viewBox="0 0 1024 1024" class="absolute inset-[6%] h-[88%] w-[88%]" role="img" aria-label={props.char}>
          <g transform="translate(0, 900) scale(1, -1)">
            <Show
              when={props.animate}
              fallback={<For each={loaded().strokes}>{(path, index) => <path d={path} fill={colour(index())} />}</For>}
            >
              <For each={loaded().strokes}>{(path) => <path d={path} fill="rgb(var(--ink) / 0.12)" />}</For>
              <For each={[run()]}>
                {(pass) => (
                  <For each={loaded().strokes}>
                    {(path, index) => {
                      const clip = `${id}-${pass}-${index()}`;
                      const stroke = timing()[index()];
                      const dash = stroke.length + PEN;
                      return (
                        <>
                          <clipPath id={clip}><path d={path} /></clipPath>
                          <path
                            d={stroke.d}
                            clip-path={`url(#${clip})`}
                            fill="none"
                            stroke={colour(index())}
                            stroke-width={PEN}
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            class="glyph-stroke"
                            style={{
                              'stroke-dasharray': `${dash} ${dash}`,
                              'stroke-dashoffset': `${dash}`,
                              'animation-duration': `${strokeMs(stroke.length)}ms`,
                              'animation-delay': `${stroke.start}ms`,
                            }}
                          />
                        </>
                      );
                    }}
                  </For>
                )}
              </For>
            </Show>
          </g>
        </svg>
      )}
    </Show>
  );

  return (
    <Show
      when={props.animate}
      fallback={
        <div class={`relative ${props.class ?? ''}`} style={props.style}>
          <RiceGrid class="absolute inset-0 h-full w-full" />
          {glyph()}
        </div>
      }
    >
      <button
        type="button"
        class={`relative ${props.class ?? ''}`}
        style={props.style}
        aria-label={`Repetir los trazos de ${props.char}`}
        onClick={() => setRun((n) => n + 1)}
      >
        <RiceGrid class="absolute inset-0 h-full w-full" />
        {glyph()}
      </button>
    </Show>
  );
};

export default CharacterGlyph;
