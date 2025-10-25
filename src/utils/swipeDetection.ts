
interface TouchPosition {
    x: number;
    y: number;
    time: number;
}

export interface SwipeHandlers {
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
    onTap?: () => void;
    onDrag?: (deltaX: number, deltaY: number) => void;
    onDragEnd?: () => void;
}

export class SwipeDetector {
    private startTouch: TouchPosition | null = null;
    private readonly minSwipeDistance: number = 50;
    private readonly maxSwipeTime: number = 500;
    private readonly maxTapTime: number = 300;
    private readonly maxTapDistance: number = 10;

    constructor(
        private element: HTMLElement,
        private handlers: SwipeHandlers
    ) {
        this.setupListeners();
    }

    private setupListeners(): void {
        // passive: false to be able to prevent default scroll
        this.element.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        this.element.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        this.element.addEventListener('touchend', this.handleTouchEnd, { passive: false });
        this.element.addEventListener('mousedown', this.handleMouseDown);
        this.element.addEventListener('mousemove', this.handleMouseMove);
        this.element.addEventListener('mouseup', this.handleMouseUp);
        this.element.addEventListener('mouseleave', this.handleMouseUp);

        // Prevent horizontal pan on the element
        this.element.style.touchAction = 'pan-y';
    }

    private handleTouchStart = (e: TouchEvent): void => {
        const touch = e.touches[0];
        this.startTouch = {
            x: touch.clientX,
            y: touch.clientY,
            time: Date.now(),
        };
    };

    private handleTouchMove = (e: TouchEvent): void => {
        if (!this.startTouch) return;

        const touch = e.touches[0];
        const deltaX = touch.clientX - this.startTouch.x;
        const deltaY = touch.clientY - this.startTouch.y;
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);

        // If swipe is more horizontal than vertical, prevent scroll
        if (absDeltaX > absDeltaY && absDeltaX > 10) {
            e.preventDefault();

            // Notify drag
            this.handlers.onDrag?.(deltaX, deltaY);
        }
    };

    private handleTouchEnd = (e: TouchEvent): void => {
        if (!this.startTouch) return;

        const touch = e.changedTouches[0];
        this.processSwipe(touch.clientX, touch.clientY);

        // Notify drag end
        this.handlers.onDragEnd?.();
    };

    private handleMouseDown = (e: MouseEvent): void => {
        this.startTouch = {
            x: e.clientX,
            y: e.clientY,
            time: Date.now(),
        };
    };

    private handleMouseUp = (e: MouseEvent): void => {
        if (!this.startTouch) return;
        this.processSwipe(e.clientX, e.clientY);

        // Notify drag end
        this.handlers.onDragEnd?.();
    };

    private handleMouseMove = (e: MouseEvent): void => {
        if (!this.startTouch) return;

        const deltaX = e.clientX - this.startTouch.x;
        const deltaY = e.clientY - this.startTouch.y;
        const absDeltaX = Math.abs(deltaX);

        // Notify drag if there's significant movement
        if (absDeltaX > 5) {
            this.handlers.onDrag?.(deltaX, deltaY);
        }
    };

    private processSwipe(endX: number, endY: number): void {
        if (!this.startTouch) return;

        const deltaX = endX - this.startTouch.x;
        const deltaY = endY - this.startTouch.y;
        const deltaTime = Date.now() - this.startTouch.time;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Detect tap
        if (distance < this.maxTapDistance && deltaTime < this.maxTapTime) {
            this.handlers.onTap?.();
            this.startTouch = null;
            return;
        }

        // Detect swipe
        if (
            Math.abs(deltaX) > this.minSwipeDistance &&
            Math.abs(deltaX) > Math.abs(deltaY) &&
            deltaTime < this.maxSwipeTime
        ) {
            if (deltaX > 0) {
                this.handlers.onSwipeRight?.();
            } else {
                this.handlers.onSwipeLeft?.();
            }
        }

        this.startTouch = null;
    }

    public destroy(): void {
        this.element.removeEventListener('touchstart', this.handleTouchStart);
        this.element.removeEventListener('touchmove', this.handleTouchMove);
        this.element.removeEventListener('touchend', this.handleTouchEnd);
        this.element.removeEventListener('mousedown', this.handleMouseDown);
        this.element.removeEventListener('mousemove', this.handleMouseMove);
        this.element.removeEventListener('mouseup', this.handleMouseUp);
        this.element.removeEventListener('mouseleave', this.handleMouseUp);
    }
}

/**
 * Hook to detect swipes on an element
 * @param handlers - Callback functions for swipe left, right and tap
 * @returns Function to attach to element's ref
 */
export const useSwipeDetector = (handlers: SwipeHandlers) => {
    let detector: SwipeDetector | null = null;

    return (element: HTMLElement | null) => {
        if (detector) {
            detector.destroy();
            detector = null;
        }

        if (element) {
            detector = new SwipeDetector(element, handlers);
        }
    };
};

