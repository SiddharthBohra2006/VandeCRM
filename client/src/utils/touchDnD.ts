// Lightweight HTML5 Drag and Drop touch polyfill for mobile touchscreens
// Enables draggable elements to fire dragstart, dragover, drop, and dragend on touch devices.

class SyntheticDataTransfer {
  private data: Record<string, string> = {};
  public effectAllowed = 'all';
  public dropEffect = 'move';
  public types: string[] = [];

  setData(format: string, data: string) {
    const key = format.toLowerCase();
    this.data[key] = data;
    if (!this.types.includes(key)) {
      this.types.push(key);
    }
  }

  getData(format: string): string {
    return this.data[format.toLowerCase()] || '';
  }

  clearData(format?: string) {
    if (format) {
      delete this.data[format.toLowerCase()];
      this.types = this.types.filter(t => t !== format.toLowerCase());
    } else {
      this.data = {};
      this.types = [];
    }
  }

  setDragImage(_img: Element, _x: number, _y: number) {
    // No-op for synthetic implementation
  }
}

export function initTouchDnD() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  let dragSource: HTMLElement | null = null;
  let dataTransfer: SyntheticDataTransfer | null = null;
  let dragPreview: HTMLElement | null = null;
  let touchStartPos: { x: number; y: number } | null = null;
  let isDragging = false;
  let lastTarget: Element | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;

  function cleanup() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (dragPreview && dragPreview.parentNode) {
      dragPreview.parentNode.removeChild(dragPreview);
    }
    dragPreview = null;
    dragSource = null;
    dataTransfer = null;
    touchStartPos = null;
    isDragging = false;
    lastTarget = null;
  }

  function startDrag(source: HTMLElement, touch: Touch) {
    dataTransfer = new SyntheticDataTransfer();
    dragSource = source;
    isDragging = true;

    // Dispatch dragstart
    const dragEvent = new CustomEvent('dragstart', {
      bubbles: true,
      cancelable: true,
    }) as any;
    dragEvent.dataTransfer = dataTransfer;
    dragEvent.clientX = touch.clientX;
    dragEvent.clientY = touch.clientY;
    dragEvent.pageX = touch.pageX;
    dragEvent.pageY = touch.pageY;

    const notCancelled = source.dispatchEvent(dragEvent);
    if (!notCancelled) {
      cleanup();
      return;
    }

    // Create a floating visual preview clone
    try {
      const rect = source.getBoundingClientRect();
      dragPreview = source.cloneNode(true) as HTMLElement;
      dragPreview.style.position = 'fixed';
      dragPreview.style.top = `${rect.top}px`;
      dragPreview.style.left = `${rect.left}px`;
      dragPreview.style.width = `${rect.width}px`;
      dragPreview.style.height = `${rect.height}px`;
      dragPreview.style.opacity = '0.75';
      dragPreview.style.pointerEvents = 'none';
      dragPreview.style.zIndex = '999999';
      dragPreview.style.transform = 'scale(1.03)';
      dragPreview.style.boxShadow = '0 12px 28px rgba(0, 0, 0, 0.28)';
      dragPreview.style.transition = 'none';
      document.body.appendChild(dragPreview);
    } catch {
      // ignore preview creation failure
    }
  }

  document.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const target = touch.target as HTMLElement | null;
      if (!target) return;

      const draggable = target.closest<HTMLElement>('[draggable="true"], [draggable]');
      if (!draggable || draggable.getAttribute('draggable') === 'false') return;

      touchStartPos = { x: touch.clientX, y: touch.clientY };

      holdTimer = setTimeout(() => {
        if (touchStartPos && !isDragging) {
          startDrag(draggable, touch);
        }
      }, 180);
    },
    { passive: true }
  );

  document.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];

      if (!isDragging && touchStartPos) {
        const dx = Math.abs(touch.clientX - touchStartPos.x);
        const dy = Math.abs(touch.clientY - touchStartPos.y);
        // If moved more than 10px before hold timer fires, cancel drag so user can scroll normally
        if (dx > 10 || dy > 10) {
          if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
          }
        }
      }

      if (isDragging && dragSource && dataTransfer) {
        // Prevent default viewport scroll during active drag
        if (e.cancelable) e.preventDefault();

        // Move preview
        if (dragPreview && touchStartPos) {
          const dx = touch.clientX - touchStartPos.x;
          const dy = touch.clientY - touchStartPos.y;
          dragPreview.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
        }

        // Target under touch
        const currentTarget = document.elementFromPoint(touch.clientX, touch.clientY);
        if (currentTarget) {
          if (lastTarget && lastTarget !== currentTarget) {
            const leaveEvent = new CustomEvent('dragleave', { bubbles: true, cancelable: true }) as any;
            leaveEvent.dataTransfer = dataTransfer;
            lastTarget.dispatchEvent(leaveEvent);
          }
          lastTarget = currentTarget;

          const overEvent = new CustomEvent('dragover', { bubbles: true, cancelable: true }) as any;
          overEvent.dataTransfer = dataTransfer;
          overEvent.clientX = touch.clientX;
          overEvent.clientY = touch.clientY;
          currentTarget.dispatchEvent(overEvent);
        }
      }
    },
    { passive: false }
  );

  document.addEventListener('touchend', (e: TouchEvent) => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }

    if (isDragging && dragSource && dataTransfer) {
      const touch = e.changedTouches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);

      if (target) {
        const dropEvent = new CustomEvent('drop', { bubbles: true, cancelable: true }) as any;
        dropEvent.dataTransfer = dataTransfer;
        dropEvent.clientX = touch.clientX;
        dropEvent.clientY = touch.clientY;
        target.dispatchEvent(dropEvent);
      }

      const endEvent = new CustomEvent('dragend', { bubbles: true, cancelable: true }) as any;
      endEvent.dataTransfer = dataTransfer;
      dragSource.dispatchEvent(endEvent);
    }

    cleanup();
  });

  document.addEventListener('touchcancel', () => {
    if (isDragging && dragSource && dataTransfer) {
      const endEvent = new CustomEvent('dragend', { bubbles: true, cancelable: true }) as any;
      endEvent.dataTransfer = dataTransfer;
      dragSource.dispatchEvent(endEvent);
    }
    cleanup();
  });
}
