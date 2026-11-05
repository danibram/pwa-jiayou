import { render } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import GradeButtons from '../src/components/GradeButtons';

// The old review deck (gloss prompts, distractors, learning order) moved to
// src/domain/learning/exercises and sessions, which tests/learning covers.

describe('round 7 word review', () => {
  it('fills Olvidé, not Bien, once a miss is graded', () => {
    const view = render(() => <GradeButtons onGrade={vi.fn()} disabled suggested="again" />);
    const good = view.getByRole('button', { name: /Bien/ });
    const again = view.getByRole('button', { name: /Olvidé/ });
    expect(good.className).toContain('btn-quiet');
    expect(again.className).toContain('btn-ink');
  });
});
