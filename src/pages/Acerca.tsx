import { Component, createResource, createSignal, For, Show } from 'solid-js';
import RiceGrid from '../components/RiceGrid';
import TopBar from '../components/TopBar';
import { loadStrokeData } from '../utils/strokeData';

interface AcercaProps {
  onBack: () => void;
}

interface CreditLink {
  href: string;
  label: string;
}

interface SourceCredit {
  kind: 'source';
  title: string;
  body: string;
  href: string;
  source: string;
}

interface SampleCredit extends Omit<SourceCredit, 'kind'> {
  kind: 'sample';
  sample: string;
}

interface LinksCredit {
  kind: 'links';
  links: CreditLink[];
}

type Credit = SourceCredit | SampleCredit | LinksCredit;

const GROUPS: { title: string; credits: Credit[] }[] = [
  {
    title: 'Voces',
    credits: [
      {
        kind: 'source',
        title: 'Mujer y hombre',
        body: 'Las grabó el Ministerio de Asuntos Digitales de Taiwán, en CNS11643. Es el modo Taiwán del botón de escuchar (mujer, luego hombre). El pinyin de la app sigue el HSK; si CNS no tiene el neutro, suena el tono de cita y puede diferir del continente.',
        href: 'https://www.cns11643.gov.tw',
        source: 'CNS11643',
      },
      {
        kind: 'source',
        title: 'Chen Wang',
        body: 'Sílabas de audio-cmn (Jiangsu), grabadas en 2013. Es la voz del modo China continental.',
        href: 'https://github.com/hugolpz/audio-cmn',
        source: 'audio-cmn',
      },
    ],
  },
  {
    title: 'Palabras',
    credits: [
      {
        kind: 'source',
        title: 'Vocabulario HSK 2.0',
        body: 'Las listas exclusivas por nivel salen de Complete HSK Vocabulary. El español traduce sentidos de CC-CEDICT (CC BY-SA 4.0).',
        href: 'https://github.com/drkameleon/complete-hsk-vocabulary',
        source: 'Complete HSK Vocabulary',
      },
      {
        kind: 'source',
        title: 'Traducciones de HSK 4 a 6',
        body: 'Combinan CC-CEDICT con definiciones de , que también ayudaron a agrupar los subtemas. La división en usos, las categorías gramaticales, las notas y la redacción final son de este proyecto.',
        href: '',
        source: '',
      },
    ],
  },
  {
    title: 'Caracteres',
    credits: [
      {
        kind: 'source',
        title: 'Lista HSK',
        body: 'Los caracteres salen de HanziDB. El español lo escribió este proyecto a partir de esas glosas.',
        href: 'http://hanzidb.org',
        source: 'HanziDB',
      },
      {
        kind: 'source',
        title: 'Trazos',
        body: 'El orden de cada trazo sale de Make Me a Hanzi.',
        href: 'https://github.com/skishore/makemeahanzi',
        source: 'Make Me a Hanzi',
      },
      {
        kind: 'sample',
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
        kind: 'links',
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
        {(stroke) => (
        <g transform="translate(0, 900) scale(1, -1)">
          <For each={stroke().strokes}>{(path) => <path d={path} fill="currentColor" />}</For>
        </g>
        )}
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
            <p class="mt-0.5 text-sm text-ink-soft">Vocabulario chino del HSK 1 al 6.</p>
          </div>
        </div>

        <div class="sheet mt-5 overflow-hidden animate-rise [animation-delay:120ms]">
          <For each={GROUPS}>
            {(group, index) => (
              <section classList={{ 'border-t border-line': index() > 0 }}>
                <h2 class="px-4 pt-4 font-display text-lg font-semibold">{group.title}</h2>
                <For each={group.credits}>
                  {(credit) => (
                    <div class="px-4 pt-2.5 pb-4">
                      <Show when={credit.kind === 'links' ? undefined : credit}>
                        {(source) => (
                          <>
                            <div class="text-[0.9375rem] font-semibold leading-tight">
                              {source().title}
                            </div>
                            <p class="mt-1 text-sm leading-relaxed text-ink-soft">{source().body}</p>
                          </>
                        )}
                      </Show>
                      <Show when={credit.kind === 'sample' ? credit : undefined}>
                        {(sample) => (
                        <div class="mt-4 mb-3 flex justify-center gap-6">
                          <div class="text-center">
                            <div class="relative h-32 w-32">
                              <RiceGrid class="absolute inset-0 h-full w-full" />
                              <div class="absolute inset-0 flex items-center justify-center font-hanzi text-[7rem] leading-none text-ink">
                                {sample().sample}
                              </div>
                            </div>
                            <p class="mt-1.5 text-xs text-ink-soft">Letra</p>
                          </div>
                          <div class="text-center">
                            <div class="relative h-32 w-32 text-ink">
                              <RiceGrid class="absolute inset-0 h-full w-full" />
                              <StrokeModel char={sample().sample} />
                            </div>
                            <p class="mt-1.5 text-xs text-ink-soft">Trazos</p>
                          </div>
                        </div>
                        )}
                      </Show>
                      <div
                        class="flex flex-wrap gap-x-4 gap-y-1"
                        classList={{ 'mt-2': credit.kind !== 'links' }}
                      >
                        <For each={credit.kind === 'links' ? credit.links : [{ href: credit.href, label: credit.source }]}>
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
