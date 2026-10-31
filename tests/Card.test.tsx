import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import Card from '../src/components/Card';
import { HSKCharacter } from '../src/types';

const make = (overrides: Partial<HSKCharacter> = {}): HSKCharacter => ({
  character: '你',
  traditional: '你',
  pinyin: 'nǐ',
  definition: 'tú, usted',
  radical: '亻',
  stroke_count: 7,
  hsk_level: 1,
  general_standard: 0,
  frequency_rank: 0,
  ...overrides,
});

describe('Card Component', () => {
  it('renders the character on the front face', () => {
    render(() => <Card character={make()} />);
    expect(screen.getAllByText('你').length).toBeGreaterThan(0);
  });

  it('shows pinyin and definition on the back face', () => {
    render(() => <Card character={make()} flipped={true} />);
    expect(screen.getByText('nǐ')).toBeInTheDocument();
    expect(screen.getByText('tú, usted')).toBeInTheDocument();
  });

  it('keeps the stroke count off the card', () => {
    render(() => <Card character={make()} flipped={true} />);
    expect(screen.queryByText(/trazo/)).not.toBeInTheDocument();
  });

  it('hides the reading until revealed', () => {
    const { container, unmount } = render(() => (
      <Card character={make()} prompt="¿Qué significa?" />
    ));
    expect(container.querySelector('[data-revealed]')!.getAttribute('data-revealed')).toBe('false');
    expect(screen.getByText('¿Qué significa?')).toBeInTheDocument();
    unmount();

    const revealed = render(() => <Card character={make()} flipped={true} />);
    expect(revealed.container.querySelector('[data-revealed]')!.getAttribute('data-revealed')).toBe(
      'true'
    );
  });

  it('names the traditional form once the meaning is open', () => {
    render(() => <Card character={make({ character: '们', traditional: '們' })} flipped={true} />);
    expect(screen.getByText(/tradicional/i)).toBeInTheDocument();
    expect(screen.getAllByText('們').length).toBeGreaterThan(0);
  });
});
