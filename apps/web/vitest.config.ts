import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [solid()],
    test: {
        include: ['tests/**/*.test.{ts,tsx}'],
        globals: true,
        environment: 'jsdom',
        setupFiles: './tests/setup.ts',
        // The integration tests render whole pages over fake IndexedDB: about 1.5 s alone, past the
        // default 5 s when the machine also runs the other workspaces' tests.
        testTimeout: 15_000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'tests/',
                '*.config.ts',
                '*.config.js',
                'dist/',
            ],
        },
    },
    resolve: {
        conditions: ['development', 'browser'],
    },
});

