/**
 * Screen <-> URL. `Screen` stays the source of truth; the URL is a readable, shareable view of it.
 *
 *   /                          home
 *   /palabras                  word list
 *   /palabras/<wordId>         word detail
 *   /repaso                    today's word review
 *   /repaso/<practiceId>       a practice session (word id, `topic:<id>` or Home's `__all__`-style ids)
 *   /trazos                    strokes for the level
 *   /trazos/<char>             strokes for one character
 *   /trazos/<char>?tema=<id>   strokes for a character inside a topic
 *   /mis-palabras, /opciones, /acerca
 *
 * Only what a shared link or a fresh tab can honour goes in the URL. These fields stay out:
 * - `from` on trazos is the screen behind it. It is recursive and private to this tab; a link goes back to Home.
 * - `returnTo` on a word is the same idea; without it the word goes back to the list.
 * - `topic` only opens the topic picker on the way in from Home.
 * - `resume`: a review in the URL always means "continue the saved session". The caller checks that one exists.
 * So `urlToScreen(screenToUrl(s))` gives back `s` without those fields. History state still keeps them
 * for back and reload within the same tab.
 */
import { homeScreen, type Screen, type StrokeFocus } from './screen';

const base = () => import.meta.env.BASE_URL;

const path = (...segments: string[]) => base() + segments.map(encodeURIComponent).join('/');

export const screenToUrl = (screen: Screen): string => {
  switch (screen.page) {
    case 'home': return base();
    case 'vocabulario': return screen.wordId ? path('palabras', screen.wordId) : path('palabras');
    case 'vocabulary-review': return screen.practiceId ? path('repaso', screen.practiceId) : path('repaso');
    case 'trazos': {
      const { focus } = screen;
      if (focus.kind === 'level') return path('trazos');
      const url = path('trazos', focus.char);
      return focus.kind === 'topic' ? `${url}?tema=${encodeURIComponent(focus.topicId)}` : url;
    }
    default: return path(screen.page);
  }
};

const decode = (segments: string[]) => {
  try {
    return segments.map(decodeURIComponent);
  } catch {
    return undefined;
  }
};

/** URLs are typed or shared by people. Anything that does not match a route returns undefined. */
export const urlToScreen = (url: URL | string): Screen | undefined => {
  const parsed = typeof url === 'string' ? new URL(url, 'http://localhost') : url;
  if (!parsed.pathname.startsWith(base())) return undefined;
  const segments = decode(parsed.pathname.slice(base().length).split('/').filter(Boolean));
  if (!segments) return undefined;
  const [page, id, ...rest] = segments;
  if (rest.length > 0) return undefined;
  switch (page) {
    case undefined: return homeScreen;
    case 'palabras': return id ? { page: 'vocabulario', wordId: id } : { page: 'vocabulario' };
    case 'repaso': return { page: 'vocabulary-review', resume: true, ...(id ? { practiceId: id } : {}) };
    case 'trazos': {
      const topicId = parsed.searchParams.get('tema');
      const focus: StrokeFocus = !id
        ? { kind: 'level' }
        : topicId ? { kind: 'topic', char: id, topicId } : { kind: 'character', char: id };
      return { page: 'trazos', focus, from: homeScreen };
    }
    case 'opciones':
    case 'acerca':
      return id ? undefined : { page };
    default: return undefined;
  }
};
