import { fileURLToPath } from 'node:url';
import app from '../tailwind.config.js';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

/**
 * The editor reuses app components (PinyinEditor, SegmentedPicker) that are styled with Tailwind.
 * It takes the app's theme and emits utilities only: no preflight, no app component classes.
 * Paths are absolute because npm --prefix runs the editor from its own folder.
 */
export default {
  ...app,
  content: [here('./*.{ts,tsx,html}'), here('./components/**/*.tsx'), here('../src/components/PinyinEditor.tsx'), here('../src/components/SegmentedPicker.tsx')],
  corePlugins: { preflight: false },
};
