import { Component, createResource, createSignal, For, Show } from 'solid-js';
import RiceGrid from '../components/RiceGrid';
import TopBar from '../components/TopBar';
import OfflineStatus from '../components/OfflineStatus';
import ProgressBackup from '../components/ProgressBackup';
import { loadStrokeData } from '../utils/strokeData';

interface AcercaProps {
  onBack: () => void;
}

interface CreditLink {
  href: string;
  label: string;
}

interface Credit {
  title?: string;
  body?: string;
  href?: string;
  links?: CreditLink[];
  source?: string;
  sample?: string;
}

const GROUPS: { title: string; credits: Credit[] }[] = [
  {
    title: 'Voces',
    credits: [
      {
        title: 'Mujer y hombre',
        body: 'Las grabó el Ministerio de Asuntos Digitales de Taiwán, en CNS11643. Son las dos primeras voces del botón de escuchar.',
        href: 'https://www.cns11643.gov.tw',
        source: 'CNS11643',
      },
      {
        title: 'Chen Wang',
        body: 'Sílabas de audio-cmn, grabadas en 2013. Es la tercera voz del botón de escuchar.',
        href: 'https://github.com/hugolpz/audio-cmn',
        source: 'audio-cmn',
      },
    ],
  },
  {
    title: 'Caracteres',
    credits: [
      {
        title: 'Lista HSK',
        body: 'Los caracteres salen de HanziDB. El español lo escribió este proyecto a partir de esas glosas.',
        href: 'http://hanzidb.org',
        source: 'HanziDB',
      },
      {
        title: 'Trazos',
        body: 'El orden de cada trazo sale de Make Me a Hanzi.',
        href: 'https://github.com/skishore/makemeahanzi',
        source: 'Make Me a Hanzi',
      },
      {
        title: 'Tipo de letra',
        body: 'Las tarjetas usan la letra LXGW WenKai. El modelo de trazos es otro dibujo.',
        href: 'https://github.com/lxgw/LxgwWenKai',
        source: 'LXGW WenKai',
        sample: '永',
      },
    ],
  },
  {
    title: 'Creador',
    credits: [
      {
        links: [
          { href: 'https://dbr.io', label: 'dbr.io' },
          { href: 'https://github.com/danibram/pwa-jiayou', label: 'Proyecto en GitHub' },
        ],
      },
    ],
  },
];

const StrokeModel: Component<{ char: string }> = (props) => {
  const [data] = createResource(() => props.char, loadStrokeData);
  return (
    <svg viewBox="0 0 1024 1024" class="absolute inset-3 h-auto w-auto" aria-hidden="true">
      <Show when={data()}>
        <g transform="translate(0, 900) scale(1, -1)">
          <For each={data()!.strokes}>{(path) => <path d={path} fill="currentColor" />}</For>
        </g>
      </Show>
    </svg>
  );
};

const Acerca: Component<AcercaProps> = (props) => {
  const [scrolled, setScrolled] = createSignal(false);
  return (
    <div class="screen">
      <div class="animate-rise -mx-4 px-4" classList={{ 'border-b border-line': scrolled() }}>
        <TopBar title="Acerca de" onBack={props.onBack} backLabel="Volver" />
      </div>
      <div
        class="-mx-4 -mb-[max(env(safe-area-inset-bottom),1rem)] min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pt-4 pb-8"
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 4)}
      >
        <div class="animate-rise flex items-center gap-3 [animation-delay:60ms]">
          <img src="/icon.svg" alt="" class="h-12 w-12 rounded-[0.8rem] shadow-lift" />
          <div>
            <div class="font-sans text-[1.75rem] font-semibold leading-tight">Jiāyóu</div>
            <p class="mt-0.5 text-sm text-ink-soft">Tarjetas para aprender caracteres HSK.</p>
          </div>
        </div>

        <OfflineStatus />
        <ProgressBackup />
        <div class="sheet mt-5 overflow-hidden animate-rise [animation-delay:120ms]">
          <For each={GROUPS}>
            {(group, index) => (
              <section classList={{ 'border-t border-line': index() > 0 }}>
                <h2 class="eyebrow px-4 pt-4">{group.title}</h2>
                <For each={group.credits}>
                  {(credit) => (
                    <div class="px-4 pt-2.5 pb-4">
                      <Show when={credit.title}>
                        <div class="font-display text-[1.0625rem] font-semibold leading-tight">
                          {credit.title}
                        </div>
                      </Show>
                      <Show when={credit.body}>
                        <p class="mt-1 text-sm leading-relaxed text-ink-soft">{credit.body}</p>
                      </Show>
                      <Show when={credit.sample}>
                        <div class="mt-4 mb-3 flex justify-center gap-6">
                          <div class="text-center">
                            <div class="relative h-32 w-32">
                              <RiceGrid class="absolute inset-0 h-full w-full" />
                              <div class="absolute inset-0 flex items-center justify-center font-hanzi text-[7rem] leading-none text-ink">
                                {credit.sample}
                              </div>
                            </div>
                            <p class="mt-1.5 text-xs text-ink-soft">Letra</p>
                          </div>
                          <div class="text-center">
                            <div class="relative h-32 w-32 text-ink">
                              <RiceGrid class="absolute inset-0 h-full w-full" />
                              <StrokeModel char={credit.sample!} />
                            </div>
                            <p class="mt-1.5 text-xs text-ink-soft">Trazos</p>
                          </div>
                        </div>
                      </Show>
                      <div
                        class="flex flex-wrap gap-x-4 gap-y-1"
                        classList={{ 'mt-2': Boolean(credit.title || credit.body || credit.sample) }}
                      >
                        <For each={credit.links ?? [{ href: credit.href ?? '', label: credit.source ?? '' }]}>
                          {(link) => (
                            <a
                              href={link.href}
                              target="_blank"
                              rel="noreferrer"
                              class="inline-flex items-center min-h-11 text-sm font-medium underline underline-offset-4 decoration-ink/30 hover:decoration-ink"
                            >
                              {link.label}
                            </a>
                          )}
                        </For>
                      </div>
                    </div>
                  )}
                </For>
              </section>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

export default Acerca;
