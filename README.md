# 加油 HSK Flashcards

A modern, interactive Progressive Web App (PWA) for learning Chinese characters using HSK (Hanyu Shuiping Kaoshi) standards in spanish.

## Features

### Today's review (spaced repetition)
- Home shows what is due today, how many new characters you get, a daily goal ring and your streak
- Recall first, reveal for free, then grade yourself: Otra vez, Difícil or Bien
- SM-2 style intervals (1, 3, 8... days); a character counts as mastered at a 21-day interval
- Missed cards come back at the end of the session; the summary lists them with a shortcut to practise their strokes

### Content
- Every character has a curated Spanish gloss in the sense HSK uses (`src/data/glosses/`), plus one example word with tone-coloured pinyin and audio
- The full dictionary definition stays on the card as a quieter second line

### Explorar
- Browse a level at your own pace, swipe or use the arrow keys
- The character stays in place on its 米字格 grid while pinyin (coloured by tone), meaning, radical and stroke count slide in
- Pronunciation through the device's Chinese voice, and a Pleco shortcut

### Escribir (stroke order)
- Ver: animated stroke order with the radical in red, plus a step-by-step view showing where each stroke starts and which way it goes
- Calcar: trace over a guide with your finger; mistakes shake the grid and a hint appears after two misses
- De memoria: write on an empty grid; the result feeds the spaced-repetition schedule
- Stroke data for all 617 characters ships with the app, so it works offline

### Look and feel
- Rice paper and ink palette with light and dark themes
- Kai typeface (LXGW WenKai, subset to the app's characters) so printed shapes match handwritten strokes
- Installable PWA, offline after the first visit

## Tech Stack

- **[SolidJS](https://www.solidjs.com/)** - Reactive UI framework
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety
- **[Vite](https://vitejs.dev/)** - Build tool and dev server
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[Vitest](https://vitest.dev/)** - Unit testing framework
- **[vite-plugin-pwa](https://vite-plugin-pwa.netlify.app/)** - PWA support

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd new-version

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Project Structure

```
src/
├── components/
│   ├── Card.tsx              # Character on a 米字格 grid; reading slides in on reveal
│   ├── SwipeableCard.tsx     # Card with swipe detection and grading stamps
│   ├── StrokeCanvas.tsx      # hanzi-writer wrapper: animation, step view, finger quiz
│   ├── ScoreModal.tsx        # Session summary sheet
│   ├── Pinyin.tsx            # Tone-coloured pinyin
│   ├── RiceGrid.tsx, TopBar.tsx, Icon.tsx
├── pages/
│   ├── Home.tsx              # Today's queue, level, modes, character of the day
│   ├── Tarjetas.tsx          # Explorar
│   ├── Entrenamiento.tsx     # Graded review
│   └── Trazos.tsx            # Escribir: watch, trace, from memory
├── stores/
│   ├── characterStore.ts     # Character data (normalised across level files)
│   └── progressStore.ts      # Spaced repetition, daily goal, streak
├── utils/                    # swipe, pinyin tones, speech, stroke data, shuffle, Pleco
├── data/                     # hsk1.json, glosas y catálogo; HSK 2 y 3 están en public/packs
└── index.css                 # Design tokens (light and dark)
```

## Stroke data and font

- `npm run strokes` copies hanzi-writer stroke data for every HSK character into `public/strokes/`
- `public/fonts/wenkai-hsk.woff2` is LXGW WenKai Medium subset to the app's characters; see `scripts/hanzi-chars.mjs` for how to rebuild it after changing the data

## Licenses

- Stroke data: hanzi-writer-data, derived from Make Me a Hanzi and Arphic fonts, under the Arphic Public License (`docs/licenses/hanzi-writer-data-ARPHICPL.txt`)
- Font: LXGW WenKai, SIL Open Font License (`docs/licenses/LXGW-WenKai-OFL.txt`)

## Data

The app includes HSK 1 (174 characters) from the start. HSK 2 (173) and HSK 3 (270) are lists the user saves on the device. HSK 4, 5 and 6 are named in the catalog and have no pack yet.

Each character includes:
- Simplified Chinese character
- Traditional Chinese character (when different)
- Pinyin pronunciation
- Spanish definition
- Stroke count
- Radical
- HSK level
- Frequency rank

## Features in Detail

### Card Flip Animation
- Pure CSS 3D transform with perspective
- Works smoothly on mobile browsers
- Shows character on front, details on back
- Prevents accidental flips during swipes

### Swipe Detection
- Custom implementation supporting both touch and mouse events
- Prevents conflicts with native scroll/pan gestures
- Visual feedback with drag offset and rotation
- Configurable thresholds and timing

### Training Logic
- If you flip to see the translation, it counts as incorrect
- Manual advancement after viewing translation
- Real-time score tracking
- Comprehensive results screen with statistics

### PWA Support
- Offline-first with service worker
- Installable on mobile devices
- App manifest with icons
- Cached assets for fast loading

## Browser Support

- Chrome/Edge 90+
- Safari 14+
- Firefox 88+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

- Character data sourced from http://hanzidb.org
- Inspired by traditional flashcard learning methods
- Built with modern web technologies for optimal UX
