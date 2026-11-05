import { render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Trazos from '../src/pages/Trazos';

vi.mock('../src/data/vocabulary/extra.json', async () => ({ default: (await import('./fixtures/extraWords')).extraWords }));
vi.mock('../src/components/StrokeCanvas', () => ({ default: (props: { char: string }) => <div data-testid="canvas">{props.char}</div> }));

afterEach(() => {
  localStorage.clear();
});

describe('strokes outside the studied deck', () => {
  it('opens a character outside HSK with the reading and meaning of the word that brought it', () => {
    render(() => <Trazos focus={{ kind: 'character', char: '喱' }} onBack={() => {}} />);
    expect(screen.getByTestId('canvas')).toHaveTextContent('喱');
    expect(screen.getByText('En 咖喱: curry')).toBeTruthy();
    expect(screen.queryByText('No hay caracteres en este nivel.')).toBeNull();
  });

  it('opens an HSK character from a level that is not being studied', () => {
    render(() => <Trazos focus={{ kind: 'character', char: '咖' }} onBack={() => {}} />);
    expect(screen.getByTestId('canvas')).toHaveTextContent('咖');
  });
});
