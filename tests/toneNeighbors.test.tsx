import { fireEvent, render, screen, within } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import ToneNeighbors from '../src/components/ToneNeighbors';
import Vocabulario from '../src/pages/Vocabulario';
import { vocabulary } from '../src/data/vocabulary';

describe('palabras con otros tonos', () => {
  it('compares neutral ma with other tones and opens a result', () => {
    const open = vi.fn();
    render(() => <ToneNeighbors character="吗" pinyin="ma" onOpenWord={open} />);
    const section = screen.getByRole('region', { name: 'Misma sílaba, otros tonos' });
    const horse = within(section).getByText('马').closest('button')!;
    expect(within(horse).getByText('mǎ')).toBeTruthy();
    expect(within(horse).getByText('caballo')).toBeTruthy();
    expect(within(section).queryByText('吗')).toBeNull();
    fireEvent.click(horse);
    expect(open).toHaveBeenCalledWith(vocabulary.find((word) => word.simplified === '马')!.id);
  });

  it('shows the comparison on one-character word pages only', () => {
    const word = vocabulary.find((entry) => entry.simplified === '吗')!;
    const view = render(() => <Vocabulario onBack={() => {}} onStrokes={() => {}} wordId={word.id} onSelect={() => {}} onPractice={() => {}} browse={{ query: '', topic: '', scroll: 0, choosingTopic: false }} onBrowse={() => {}} />);
    expect(within(screen.getByRole('region', { name: 'Misma sílaba, otros tonos' })).getByText('马')).toBeTruthy();
    view.unmount();
    const multi = vocabulary.find((entry) => entry.simplified === '朋友')!;
    render(() => <Vocabulario onBack={() => {}} onStrokes={() => {}} wordId={multi.id} onSelect={() => {}} onPractice={() => {}} browse={{ query: '', topic: '', scroll: 0, choosingTopic: false }} onBrowse={() => {}} />);
    expect(screen.queryByRole('region', { name: 'Misma sílaba, otros tonos' })).toBeNull();
  });
});
