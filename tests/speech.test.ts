import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeAudio {
  static srcs: string[] = [];
  static instances: FakeAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public src: string) {
    FakeAudio.srcs.push(src);
    FakeAudio.instances.push(this);
  }

  play(): Promise<void> {
    return Promise.resolve();
  }

  pause(): void {}

  end(): void {
    this.onended?.();
  }
}

type Spoken = {
  text: string;
  voice?: { name: string; lang: string } | null;
  onend?: () => void;
  onerror?: () => void;
};

describe('listen button voice modes', () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    localStorage.clear();
    FakeAudio.srcs = [];
    FakeAudio.instances = [];
    vi.stubGlobal('Audio', FakeAudio);
  });

  it('keeps China continental on a single clip voice', async () => {
    const { currentVoiceLabel, speak } = await import('../src/utils/speech');

    expect(currentVoiceLabel()).toBe('China continental');
    speak('wǒ', '我');
    FakeAudio.instances.at(-1)?.end();
    speak('wǒ', '我');
    expect(FakeAudio.srcs).toEqual(['/audio/c/wo3.mp3', '/audio/c/wo3.mp3']);
  });

  it('alternates Taiwan woman then man on each tap', async () => {
    const { setVoiceMode, speak, speakWord } = await import('../src/utils/speech');
    setVoiceMode('taiwan');

    speak('wǒ', '我');
    FakeAudio.instances.at(-1)?.end();
    speak('wǒ', '我');
    expect(FakeAudio.srcs).toEqual(['/audio/f/wo3.mp3', '/audio/m/wo3.mp3']);

    speakWord('bà ba', '爸爸');
    expect(FakeAudio.srcs.at(-1)).toBe('/audio/f/ba4.mp3');
  });

  it('maps a legacy speaker choice onto a mode', async () => {
    sessionStorage.setItem('hsk-voice-index', '1');
    const { currentVoiceMode, speak } = await import('../src/utils/speech');

    expect(currentVoiceMode()).toBe('taiwan');
    speak('wǒ', '我');
    expect(FakeAudio.srcs.at(-1)).toBe('/audio/f/wo3.mp3');
  });

  it('stores a chosen mode across visits', async () => {
    const { setVoiceMode, speak } = await import('../src/utils/speech');
    setVoiceMode('taiwan');
    expect(localStorage.getItem('hsk-voice-mode')).toBe('taiwan');
    speak('wǒ', '我');
    expect(FakeAudio.srcs.at(-1)).toBe('/audio/f/wo3.mp3');
  });

  it('reports what is playing until the clip ends', async () => {
    const { isSpeaking, speak, stopSpeech } = await import('../src/utils/speech');

    speak('wǒ', '我');
    expect(isSpeaking('wǒ', '我')).toBe(true);
    expect(isSpeaking('nǐ', '你')).toBe(false);
    FakeAudio.instances.at(-1)?.end();
    expect(isSpeaking('wǒ', '我')).toBe(false);

    speak('wǒ', '我');
    stopSpeech();
    expect(isSpeaking('wǒ', '我')).toBe(false);
  });
});

describe('TTS mode', () => {
  const spoken: Spoken[] = [];
  const cancel = vi.fn();
  const voices = [
    { name: 'Microsoft Yunyang Online (Natural)', lang: 'zh-CN' },
    { name: 'Microsoft Xiaoxiao Online (Natural)', lang: 'zh-CN' },
    { name: 'Google US English', lang: 'en-US' },
  ];

  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    localStorage.clear();
    FakeAudio.srcs = [];
    FakeAudio.instances = [];
    spoken.length = 0;
    cancel.mockClear();
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      lang = '';
      rate = 1;
      voice: { name: string; lang: string } | null = null;
      onend?: () => void;
      onerror?: () => void;
      constructor(public text: string) {}
    });
    vi.stubGlobal('speechSynthesis', {
      cancel,
      getVoices: () => voices,
      speak: (utterance: Spoken & { voice?: { name: string; lang: string } | null }) => {
        spoken.push({ text: utterance.text, voice: utterance.voice ?? null, onend: utterance.onend, onerror: utterance.onerror });
      },
    });
  });

  it('uses device TTS and alternates man then woman', async () => {
    const { setVoiceMode, speak, speakWord } = await import('../src/utils/speech');
    setVoiceMode('tts');

    speak('wǒ', '我');
    expect(FakeAudio.srcs).toEqual([]);
    expect(spoken.map((item) => [item.text, item.voice?.name])).toEqual([
      ['我', 'Microsoft Yunyang Online (Natural)'],
    ]);
    spoken[0].onend?.();

    speakWord('朋友', '朋友');
    expect(spoken.map((item) => item.voice?.name)).toEqual([
      'Microsoft Yunyang Online (Natural)',
      'Microsoft Xiaoxiao Online (Natural)',
    ]);
  });

  it('reports when TTS mode has no Chinese voice', async () => {
    vi.stubGlobal('speechSynthesis', {
      cancel,
      getVoices: () => [{ name: 'Samantha', lang: 'en-US' }],
      speak: vi.fn(),
    });
    const { setVoiceMode, speakWord } = await import('../src/utils/speech');
    setVoiceMode('tts');
    const unavailable = vi.fn();
    speakWord('朋友', '朋友', unavailable);
    expect(unavailable).toHaveBeenCalledOnce();
  });
});

describe('word playback', () => {
  const spoken: { text: string; onend?: () => void }[] = [];
  const cancel = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    localStorage.clear();
    FakeAudio.srcs = [];
    FakeAudio.instances = [];
    spoken.length = 0;
    cancel.mockClear();
    localStorage.setItem('hsk-voice-mode', 'taiwan');
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      lang = '';
      rate = 1;
      voice: unknown;
      onend?: () => void;
      onerror?: () => void;
      constructor(public text: string) {}
    });
    vi.stubGlobal('speechSynthesis', {
      cancel,
      getVoices: () => [],
      speak: (utterance: { text: string; onend?: () => void }) => spoken.push(utterance),
    });
  });

  it('uses the citation tone when a neutral-tone clip is missing', async () => {
    vi.useFakeTimers();
    const { speakWord } = await import('../src/utils/speech');
    speakWord('péng you', '朋友');
    expect(FakeAudio.srcs).toEqual(['/audio/f/peng2.mp3']);
    FakeAudio.instances[0].end();
    vi.runAllTimers();
    expect(FakeAudio.srcs).toEqual(['/audio/f/peng2.mp3', '/audio/f/you3.mp3']);
    expect(spoken).toEqual([]);
    vi.useRealTimers();
  });

  it('plays the citation clip for each syllable when the neutral is missing', async () => {
    vi.useFakeTimers();
    const { speakWord } = await import('../src/utils/speech');
    speakWord('xiè xie', '谢谢');
    expect(FakeAudio.srcs).toEqual(['/audio/f/xie4.mp3']);
    FakeAudio.instances[0].end();
    vi.runAllTimers();
    expect(FakeAudio.srcs).toEqual(['/audio/f/xie4.mp3', '/audio/f/xie4.mp3']);
    expect(spoken).toEqual([]);
    vi.useRealTimers();
  });

  it('synthesizes the whole word when no clip or citation exists', async () => {
    const { speakWord } = await import('../src/utils/speech');
    speakWord('zz zz', '〇〇');
    expect(FakeAudio.srcs).toEqual([]);
    expect(spoken.map(item => item.text)).toEqual(['〇〇']);
  });

  it('plays exact available syllables in order', async () => {
    vi.useFakeTimers();
    const { speakWord } = await import('../src/utils/speech');
    speakWord('bà ba', '爸爸');
    expect(FakeAudio.srcs).toEqual(['/audio/f/ba4.mp3']);
    FakeAudio.instances[0].end();
    vi.runAllTimers();
    expect(FakeAudio.srcs).toEqual(['/audio/f/ba4.mp3', '/audio/f/ba5.mp3']);
    vi.useRealTimers();
  });

  it('uses the female recording for mainland’s defective neutral ba', async () => {
    vi.useFakeTimers();
    localStorage.setItem('hsk-voice-mode', 'mainland');
    const { speakWord } = await import('../src/utils/speech');
    speakWord('bà ba', '爸爸');
    expect(FakeAudio.srcs).toEqual(['/audio/c/ba4.mp3']);
    FakeAudio.instances[0].end();
    vi.runAllTimers();
    expect(FakeAudio.srcs).toEqual(['/audio/c/ba4.mp3', '/audio/f/ba5.mp3']);
    vi.useRealTimers();
  });

  it('falls back to the complete word on audio failure and ignores stale playback', async () => {
    const { speakWord, currentVoiceLabel } = await import('../src/utils/speech');
    speakWord('bà ba', '爸爸');
    FakeAudio.instances[0].onerror?.();
    expect(spoken.map(item => item.text)).toEqual(['爸爸']);
    speakWord('zz zz', '〇〇');
    expect(cancel).toHaveBeenCalled();
    spoken[0].onend?.();
    expect(currentVoiceLabel()).toBe('Taiwán');
    expect(spoken.map(item => item.text)).toEqual(['爸爸', '〇〇']);
  });

  it('reports when word synthesis has no Chinese voice', async () => {
    vi.stubGlobal('speechSynthesis', { cancel, getVoices: () => [{ lang: 'en-US' }], speak: vi.fn() });
    const { speakWord } = await import('../src/utils/speech');
    const unavailable = vi.fn();
    speakWord('zz zz', '〇〇', unavailable);
    expect(unavailable).toHaveBeenCalledOnce();
  });
});
