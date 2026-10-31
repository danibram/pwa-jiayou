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

describe('listen button voice', () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    FakeAudio.srcs = [];
    FakeAudio.instances = [];
    vi.stubGlobal('Audio', FakeAudio);
  });

  it('keeps the name while the clip plays, then shows the next voice', async () => {
    const { currentVoiceLabel, speak } = await import('../src/utils/speech');

    expect(currentVoiceLabel()).toBe('Mujer, Taiwán');
    speak('wǒ', '我');
    expect(currentVoiceLabel()).toBe('Mujer, Taiwán');
    expect(FakeAudio.srcs.at(-1)).toBe('/audio/f/wo3.mp3');

    FakeAudio.instances.at(-1)?.end();
    expect(currentVoiceLabel()).toBe('Hombre, Taiwán');

    speak('wǒ', '我');
    expect(currentVoiceLabel()).toBe('Hombre, Taiwán');
    expect(FakeAudio.srcs.at(-1)).toBe('/audio/m/wo3.mp3');

    FakeAudio.instances.at(-1)?.end();
    expect(currentVoiceLabel()).toBe('Chen Wang');

    speak('wǒ', '我');
    expect(FakeAudio.srcs.at(-1)).toBe('/audio/c/wo3.mp3');
    FakeAudio.instances.at(-1)?.end();
    expect(currentVoiceLabel()).toBe('Mujer, Taiwán');
    expect(sessionStorage.getItem('hsk-voice-index')).toBe('0');
  });

  it('moves to the next voice if you tap again before the clip ends', async () => {
    const { currentVoiceLabel, speak } = await import('../src/utils/speech');

    speak('wǒ', '我');
    speak('wǒ', '我');
    expect(currentVoiceLabel()).toBe('Hombre, Taiwán');
    expect(FakeAudio.srcs.at(-1)).toBe('/audio/m/wo3.mp3');

    FakeAudio.instances[0]?.end();
    expect(currentVoiceLabel()).toBe('Hombre, Taiwán');

    FakeAudio.instances[1]?.end();
    expect(currentVoiceLabel()).toBe('Chen Wang');
  });

  it('leaves the button alone when playback is not a listen click', async () => {
    const { currentVoiceLabel, speak } = await import('../src/utils/speech');

    speak('wǒ', '我', false);
    expect(currentVoiceLabel()).toBe('Mujer, Taiwán');
    expect(FakeAudio.srcs.at(-1)).toBe('/audio/f/wo3.mp3');

    FakeAudio.instances.at(-1)?.end();
    expect(currentVoiceLabel()).toBe('Mujer, Taiwán');

    speak('wǒ', '我');
    expect(FakeAudio.srcs.at(-1)).toBe('/audio/f/wo3.mp3');
  });
});
