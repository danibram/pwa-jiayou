import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidForPleco, openInPleco } from '../src/utils/plecoIntegration';

describe('Pleco Integration', () => {
    beforeEach(() => {
        // Mock window.open
        global.window.open = vi.fn();
    });

    describe('openInPleco', () => {
        it('opens Pleco with correct URL', () => {
            openInPleco('你好');

            expect(window.open).toHaveBeenCalledWith(
                'plecoapi://x-callback-url/s?q=%E4%BD%A0%E5%A5%BD',
                '_blank'
            );
        });

        it('handles single character', () => {
            openInPleco('的');

            expect(window.open).toHaveBeenCalledWith(
                'plecoapi://x-callback-url/s?q=%E7%9A%84',
                '_blank'
            );
        });

        it('trims whitespace from character', () => {
            openInPleco('  中  ');

            expect(window.open).toHaveBeenCalledWith(
                'plecoapi://x-callback-url/s?q=%E4%B8%AD',
                '_blank'
            );
        });

        it('handles errors gracefully', () => {
            global.window.open = vi.fn(() => {
                throw new Error('Failed to open');
            });

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            expect(() => openInPleco('你')).not.toThrow();
            expect(consoleSpy).toHaveBeenCalledWith('Error opening Pleco:', expect.any(Error));

            consoleSpy.mockRestore();
        });
    });

    describe('isValidForPleco', () => {
        it('returns true for valid character', () => {
            expect(isValidForPleco('你')).toBe(true);
            expect(isValidForPleco('中国')).toBe(true);
        });

        it('returns false for empty string', () => {
            expect(isValidForPleco('')).toBe(false);
        });

        it('returns false for whitespace only', () => {
            expect(isValidForPleco('   ')).toBe(false);
        });

        it('returns false for null/undefined', () => {
            expect(isValidForPleco(null as any)).toBe(false);
            expect(isValidForPleco(undefined as any)).toBe(false);
        });
    });
});

