import { fireEvent, render, screen, within } from '@solidjs/testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ToneNeighbors from '../src/components/ToneNeighbors';
import Vocabulario from '../src/pages/Vocabulario';
import { vocabulary } from './fixtures/levelWords';
import { vocabularyStore } from '../src/stores/vocabularyStore';

const ALL_HSK = ['hsk-1', 'hsk-2', 'hsk-3', 'hsk-4', 'hsk-5', 'hsk-6'];

const page = (simplified: string) => {
  const word = vocabulary.find((entry) => entry.simplified === simplified)!;
  return render(() => <Vocabulario onBack={() => {}} onStrokes={() => {}} wordId={word.id} onSelect={() => {}} onPractice={() => {}} browse={{ query: '', topic: '', scroll: 0, choosingTopic: false }} onBrowse={() => {}} />);
};

describe('suena parecido', () => {
  beforeEach(() => vocabularyStore.selectLists(ALL_HSK));

  it('compares only words and characters of the lists being studied', () => {
    vocabularyStore.selectLists(['hsk-1']);
    render(() => <ToneNeighbors character="吗" pinyin="ma" />);
    const section = screen.getByRole('region', { name: 'Suena parecido' });
    // 马 is HSK 3: off while only HSK 1 is studied. 妈妈 and 吗 are HSK 1.
    expect(within(section).queryByText('马')).toBeNull();
    expect(within(section).getByText('妈')).toBeTruthy();
  });

  it('compares neutral ma with other tones in the character drawer and opens a result', () => {
    const open = vi.fn();
    render(() => <ToneNeighbors character="吗" pinyin="ma" onOpenWord={open} />);
    const section = screen.getByRole('region', { name: 'Suena parecido' });
    const horse = within(section).getByText('马').closest('button')!;
    expect(within(horse).getByText('mǎ')).toBeTruthy();
    expect(within(horse).getByText('caballo')).toBeTruthy();
    expect(within(section).queryByText('吗')).toBeNull();
    fireEvent.click(horse);
    expect(open).toHaveBeenCalledWith(vocabulary.find((word) => word.simplified === '马')!.id);
  });

  it('puts same-tone characters before other tones', () => {
    render(() => <ToneNeighbors character="是" pinyin="shì" />);
    const section = screen.getByRole('region', { name: 'Suena parecido' });
    const labels = within(section).getAllByText(/^(Suena igual|Otro tono)$/).map((node) => node.textContent);
    expect(labels).toEqual(['Suena igual', 'Otro tono']);
  });

  it('compares whole words on the word page, homophones of two syllables included', () => {
    const view = page('时间');
    const section = screen.getByRole('region', { name: 'Suena parecido' });
    expect(within(section).getByText('实践')).toBeTruthy();
    expect(within(section).getByText('事件')).toBeTruthy();
    view.unmount();
    page('朋友');
    expect(screen.queryByRole('region', { name: 'Suena parecido' })).toBeNull();
  });
});
