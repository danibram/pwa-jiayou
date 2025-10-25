import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SwipeDetector } from '../src/utils/swipeDetection';

describe('SwipeDetector', () => {
    let element: HTMLElement;
    let onSwipeLeft: ReturnType<typeof vi.fn>;
    let onSwipeRight: ReturnType<typeof vi.fn>;
    let onTap: ReturnType<typeof vi.fn>;
    let detector: SwipeDetector;

    let onDrag: ReturnType<typeof vi.fn>;
    let onDragEnd: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        element = document.createElement('div');
        onSwipeLeft = vi.fn();
        onSwipeRight = vi.fn();
        onTap = vi.fn();
        onDrag = vi.fn();
        onDragEnd = vi.fn();

        detector = new SwipeDetector(element, {
            onSwipeLeft,
            onSwipeRight,
            onTap,
            onDrag,
            onDragEnd,
        });
    });

    describe('Touch Events', () => {
        it('detects swipe left', () => {
            // Simular touchstart
            const touchStart = new TouchEvent('touchstart', {
                touches: [{ clientX: 200, clientY: 100 } as Touch],
            });
            element.dispatchEvent(touchStart);

            // Simular touchend hacia la izquierda
            const touchEnd = new TouchEvent('touchend', {
                changedTouches: [{ clientX: 50, clientY: 100 } as Touch],
            });
            element.dispatchEvent(touchEnd);

            expect(onSwipeLeft).toHaveBeenCalledTimes(1);
            expect(onSwipeRight).not.toHaveBeenCalled();
        });

        it('detects swipe right', () => {
            // Simular touchstart
            const touchStart = new TouchEvent('touchstart', {
                touches: [{ clientX: 50, clientY: 100 } as Touch],
            });
            element.dispatchEvent(touchStart);

            // Simular touchend hacia la derecha
            const touchEnd = new TouchEvent('touchend', {
                changedTouches: [{ clientX: 200, clientY: 100 } as Touch],
            });
            element.dispatchEvent(touchEnd);

            expect(onSwipeRight).toHaveBeenCalledTimes(1);
            expect(onSwipeLeft).not.toHaveBeenCalled();
        });

        it('detects tap', () => {
            // Simular touchstart
            const touchStart = new TouchEvent('touchstart', {
                touches: [{ clientX: 100, clientY: 100 } as Touch],
            });
            element.dispatchEvent(touchStart);

            // Simular touchend en la misma posición (tap)
            const touchEnd = new TouchEvent('touchend', {
                changedTouches: [{ clientX: 102, clientY: 101 } as Touch],
            });
            element.dispatchEvent(touchEnd);

            expect(onTap).toHaveBeenCalledTimes(1);
            expect(onSwipeLeft).not.toHaveBeenCalled();
            expect(onSwipeRight).not.toHaveBeenCalled();
        });

        it('ignores vertical swipes', () => {
            // Simular touchstart
            const touchStart = new TouchEvent('touchstart', {
                touches: [{ clientX: 100, clientY: 50 } as Touch],
            });
            element.dispatchEvent(touchStart);

            // Simular touchend vertical (no debería detectarse como swipe)
            const touchEnd = new TouchEvent('touchend', {
                changedTouches: [{ clientX: 100, clientY: 200 } as Touch],
            });
            element.dispatchEvent(touchEnd);

            expect(onSwipeLeft).not.toHaveBeenCalled();
            expect(onSwipeRight).not.toHaveBeenCalled();
            expect(onTap).not.toHaveBeenCalled();
        });

        it('ignores swipes that are too short', () => {
            // Simular touchstart
            const touchStart = new TouchEvent('touchstart', {
                touches: [{ clientX: 100, clientY: 100 } as Touch],
            });
            element.dispatchEvent(touchStart);

            // Simular touchend muy cerca (distancia < minSwipeDistance)
            const touchEnd = new TouchEvent('touchend', {
                changedTouches: [{ clientX: 120, clientY: 100 } as Touch],
            });
            element.dispatchEvent(touchEnd);

            expect(onSwipeLeft).not.toHaveBeenCalled();
            expect(onSwipeRight).not.toHaveBeenCalled();
        });
    });

    describe('Mouse Events', () => {
        it('detects mouse swipe left', () => {
            const mouseDown = new MouseEvent('mousedown', { clientX: 200, clientY: 100 });
            element.dispatchEvent(mouseDown);

            const mouseUp = new MouseEvent('mouseup', { clientX: 50, clientY: 100 });
            element.dispatchEvent(mouseUp);

            expect(onSwipeLeft).toHaveBeenCalledTimes(1);
        });

        it('detects mouse swipe right', () => {
            const mouseDown = new MouseEvent('mousedown', { clientX: 50, clientY: 100 });
            element.dispatchEvent(mouseDown);

            const mouseUp = new MouseEvent('mouseup', { clientX: 200, clientY: 100 });
            element.dispatchEvent(mouseUp);

            expect(onSwipeRight).toHaveBeenCalledTimes(1);
        });

        it('detects mouse tap', () => {
            const mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });
            element.dispatchEvent(mouseDown);

            const mouseUp = new MouseEvent('mouseup', { clientX: 101, clientY: 100 });
            element.dispatchEvent(mouseUp);

            expect(onTap).toHaveBeenCalledTimes(1);
        });
    });

    describe('Cleanup', () => {
        it('removes event listeners on destroy', () => {
            const addEventListenerSpy = vi.spyOn(element, 'removeEventListener');

            detector.destroy();

            expect(addEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));
            expect(addEventListenerSpy).toHaveBeenCalledWith('touchmove', expect.any(Function));
            expect(addEventListenerSpy).toHaveBeenCalledWith('touchend', expect.any(Function));
            expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
            expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
            expect(addEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
            expect(addEventListenerSpy).toHaveBeenCalledWith('mouseleave', expect.any(Function));
        });
    });

    describe('Touch Move Prevention', () => {
        it('prevents default on horizontal swipe', () => {
            const touchStart = new TouchEvent('touchstart', {
                touches: [{ clientX: 100, clientY: 100 } as Touch],
            });
            element.dispatchEvent(touchStart);

            // Mock preventDefault
            const touchMove = new TouchEvent('touchmove', {
                touches: [{ clientX: 150, clientY: 105 } as Touch],
            });
            const preventDefaultSpy = vi.spyOn(touchMove, 'preventDefault');

            element.dispatchEvent(touchMove);

            // En un movimiento horizontal significativo, debería prevenir el default
            // Nota: El spy puede no funcionar perfectamente en JSDOM, pero está aquí para documentar el comportamiento
            expect(preventDefaultSpy).toHaveBeenCalled();
        });

        it('sets touch-action style', () => {
            expect(element.style.touchAction).toBe('pan-y');
        });
    });

    describe('Drag Callbacks', () => {
        it('calls onDrag during touchmove', () => {
            const touchStart = new TouchEvent('touchstart', {
                touches: [{ clientX: 100, clientY: 100 } as Touch],
            });
            element.dispatchEvent(touchStart);

            const touchMove = new TouchEvent('touchmove', {
                touches: [{ clientX: 150, clientY: 105 } as Touch],
            });
            element.dispatchEvent(touchMove);

            expect(onDrag).toHaveBeenCalledWith(50, 5);
        });

        it('calls onDragEnd on touchend', () => {
            const touchStart = new TouchEvent('touchstart', {
                touches: [{ clientX: 100, clientY: 100 } as Touch],
            });
            element.dispatchEvent(touchStart);

            const touchEnd = new TouchEvent('touchend', {
                changedTouches: [{ clientX: 150, clientY: 100 } as Touch],
            });
            element.dispatchEvent(touchEnd);

            expect(onDragEnd).toHaveBeenCalled();
        });

        it('calls onDrag during mousemove', () => {
            const mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });
            element.dispatchEvent(mouseDown);

            const mouseMove = new MouseEvent('mousemove', { clientX: 150, clientY: 105 });
            element.dispatchEvent(mouseMove);

            expect(onDrag).toHaveBeenCalledWith(50, 5);
        });
    });
});

