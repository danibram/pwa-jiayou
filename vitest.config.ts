import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [solid()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './tests/setup.ts',
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

