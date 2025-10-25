# 加油 HSK Flashcards

A modern, interactive Progressive Web App (PWA) for learning Chinese characters using HSK (Hanyu Shuiping Kaoshi) standards in spanish.

## Features

### 📚 **Flashcards Mode**
- Browse freely through HSK characters
- Swipe left/right or use arrow keys to navigate
- Tap to flip cards and see translations
- View simplified and traditional characters
- See pinyin pronunciation and Spanish definitions
- Integration with Pleco dictionary for detailed lookups

### 🎯 **Training Mode**
- Test your knowledge with a randomized quiz
- Swipe right for correct, left for incorrect
- Track your score and progress in real-time
- Get immediate visual feedback
- View detailed statistics at the end

### ✨ **Modern UI/UX**
- Beautiful glassmorphism design
- Smooth 3D flip animations
- Touch-optimized for mobile devices
- Responsive layout for all screen sizes
- Intuitive swipe gestures
- PWA support for offline use

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
├── components/       # Reusable UI components
│   ├── Card.tsx              # Flashcard with flip animation
│   ├── SwipeableCard.tsx     # Card with swipe detection
│   ├── LevelSelector.tsx     # HSK level selection
│   ├── ProgressBar.tsx       # Progress indicator
│   └── ScoreModal.tsx        # Training results modal
├── pages/           # Main application pages
│   ├── Home.tsx              # Landing page with mode selection
│   ├── Tarjetas.tsx          # Flashcards mode
│   └── Entrenamiento.tsx     # Training mode
├── stores/          # State management
│   └── characterStore.ts     # Character data and progress
├── utils/           # Utility functions
│   ├── swipeDetection.ts     # Touch/mouse swipe detection
│   └── plecoIntegration.ts   # Pleco dictionary integration
├── data/            # HSK character data (JSON)
│   ├── hsk1.json
│   ├── hsk2.json
│   └── hsk3.json
├── types.ts         # TypeScript type definitions
└── index.css        # Global styles and Tailwind config
```

## Data

The app includes:
- **HSK 1**: 174 characters
- **HSK 2**: 173 characters
- **HSK 3**: 270 characters
- **Total**: 617 characters

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
