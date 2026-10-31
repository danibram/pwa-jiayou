import { Component } from 'solid-js';

/** 米字格: the practice square calligraphy students write in. */
const RiceGrid: Component<{ class?: string; diagonals?: boolean; frame?: boolean }> = (props) => (
  <svg viewBox="0 0 100 100" class={props.class} aria-hidden="true" preserveAspectRatio="none">
    <g stroke="rgb(var(--ink))" fill="none" vector-effect="non-scaling-stroke">
      {props.frame !== false && (
        <rect
          x="0.5"
          y="0.5"
          width="99"
          height="99"
          stroke-opacity="0.28"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
      )}
      <g stroke-opacity="0.2" stroke-dasharray="2 3.5" stroke-width="1">
        <line x1="50" y1="0" x2="50" y2="100" vector-effect="non-scaling-stroke" />
        <line x1="0" y1="50" x2="100" y2="50" vector-effect="non-scaling-stroke" />
      </g>
      {props.diagonals !== false && (
        <g stroke-opacity="0.14" stroke-dasharray="2 4" stroke-width="1">
          <line x1="0" y1="0" x2="100" y2="100" vector-effect="non-scaling-stroke" />
          <line x1="100" y1="0" x2="0" y2="100" vector-effect="non-scaling-stroke" />
        </g>
      )}
    </g>
  </svg>
);

export default RiceGrid;
