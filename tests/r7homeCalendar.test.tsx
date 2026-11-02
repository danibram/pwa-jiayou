import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import ActivityCalendar from '../src/components/ActivityCalendar';
import { topicCountsLine } from '../src/components/TopicProgress';

// Sunday 1 November 2026.
const today = new Date(2026, 10, 1, 12);
const rows = (container: HTMLElement) => container.querySelectorAll('button[aria-label], .border-dashed').length / 7;

describe('ActivityCalendar', () => {
  it('shows only this week before any practice', () => {
    const { container, getByText } = render(() => <ActivityCalendar activity={{}} today={today} />);
    expect(rows(container)).toBe(1);
    expect(getByText('Esta semana aún no has practicado')).toBeTruthy();
  });

  it('grows back to the week of the first practised day, up to seven', () => {
    const { container } = render(() => <ActivityCalendar activity={{ '2026-10-20': 3, '2026-11-01': 5 }} today={today} />);
    expect(rows(container)).toBe(2);
    const old = render(() => <ActivityCalendar activity={{ '2025-01-01': 1 }} today={today} />);
    expect(rows(old.container)).toBe(7);
  });

  it('counts days, not answers', () => {
    const { getByText } = render(() => <ActivityCalendar activity={{ '2026-10-27': 40, '2026-11-01': 5 }} today={today} />);
    expect(getByText('Esta semana has practicado 2 días')).toBeTruthy();
  });
});

describe('topicCountsLine', () => {
  it('names what the topic holds', () => {
    expect(topicCountsLine({ total: 9, learning: 0, mastered: 0 }, false)).toBe('9 caracteres, sin empezar');
    expect(topicCountsLine({ total: 12, learning: 4, mastered: 2 }, true)).toBe('12 palabras: 2 dominadas, 4 aprendiendo');
    expect(topicCountsLine({ total: 3, learning: 0, mastered: 3 }, false)).toBe('3 caracteres, todos dominados');
  });
});
