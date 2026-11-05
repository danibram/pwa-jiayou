import { Component, For, Show } from 'solid-js';
import Icon from './Icon';

/** How an answer went: Otra vez, Difícil or Bien. */
export type Grade = 'again' | 'hard' | 'good';

/** One grading vocabulary for words and characters. */
export const GRADE_LABEL: Record<Grade, string> = {
  again: 'Olvidé',
  hard: 'Casi',
  good: 'Bien',
};

export const GRADE_KEY: Record<Grade, string> = { again: '1', hard: '2', good: '3' };

/** Bien is the filled accent: white on jade in light, paper on the lighter jade in dark. */
export const GRADE_CLASS: Record<Grade, string> = {
  again: 'btn-quiet',
  hard: 'btn-quiet',
  good: 'btn bg-jade text-white dark:text-paper shadow-lift hover:brightness-105',
};

interface GradeButtonsProps {
  /** Left to right. Two grades for a first meeting, three for a review. */
  grades?: readonly Grade[];
  onGrade: (grade: Grade) => void;
  disabled?: boolean;
  /** The grade the app suggests, for example from a written answer. */
  suggested?: Grade | null;
}

const GradeButtons: Component<GradeButtonsProps> = (props) => {
  const grades = () => props.grades ?? (['again', 'hard', 'good'] as const);
  /** A suggestion takes the fill, so Bien never looks like the default after a failed attempt. */
  const classFor = (grade: Grade) => {
    const suggested = props.suggested;
    if (!suggested) return GRADE_CLASS[grade];
    if (grade !== suggested) return 'btn-quiet';
    return suggested === 'good' ? GRADE_CLASS.good : 'btn-ink';
  };
  return (
    <div
      class="grid gap-2 animate-fade"
      style={{ 'grid-template-columns': `repeat(${grades().length}, minmax(0, 1fr))` }}
      role="group"
      aria-label="¿Lo recordabas?"
    >
      <For each={grades()}>
        {(grade) => (
          <button
            type="button"
            onClick={() => props.onGrade(grade)}
            disabled={props.disabled}
            class={`h-14 px-3 text-[0.9375rem] ${classFor(grade)}`}
          >
            <Show when={grade === 'again'}>
              <span class="h-2 w-2 flex-shrink-0 rounded-full bg-seal" aria-hidden="true" />
            </Show>
            <Show when={grade === 'good'}>
              <Icon name="check" size={16} />
            </Show>
            {GRADE_LABEL[grade]}
          </button>
        )}
      </For>
    </div>
  );
};

export default GradeButtons;
