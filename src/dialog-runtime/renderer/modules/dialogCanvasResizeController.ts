const RESIZE_TARGET_SELECTOR = '[data-resize-with-dialog="true"]';
const MOVE_TARGET_SELECTOR = '[data-move-with-dialog="true"]';

export interface DialogCanvasResizeController {
  /** Recomputes the sizes of the growing elements right away. */
  refresh(): void;
  /** Stops observing the canvas and releases the observer. */
  dispose(): void;
}

/**
 * Lets the dialog canvas grow past its authored size and hands the extra
 * width and height to the elements that opted in through resizeWithDialog.
 * Every other element keeps its authored position, so the layout above and to
 * the left of a growing element never moves.
 */
export function createDialogCanvasResizeController(
  root: HTMLElement,
  authoredWidth: number,
  authoredHeight: number
): DialogCanvasResizeController {
  const readAuthoredSize = function(
    element: HTMLElement,
    key: 'authoredWidth' | 'authoredHeight'
  ): number {
    const stored = Number(element.dataset[key]);
    return Number.isFinite(stored) ? stored : 0;
  };

  const readAuthoredPosition = function(
    element: HTMLElement,
    key: 'authoredLeft' | 'authoredTop'
  ): number {
    const stored = Number(element.dataset[key]);
    return Number.isFinite(stored) ? stored : 0;
  };

  const readMoveFactor = function(
    element: HTMLElement,
    key: 'moveFactorX' | 'moveFactorY'
  ): number {
    const stored = Number(element.dataset[key]);
    return Number.isFinite(stored) ? stored : 1;
  };

  const resizeTargets = function(): void {
    const extraWidth = Math.max(0, root.clientWidth - authoredWidth);
    const extraHeight = Math.max(0, root.clientHeight - authoredHeight);
    const targets = root.querySelectorAll(RESIZE_TARGET_SELECTOR);

    targets.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;

      node.style.width = `${readAuthoredSize(node, 'authoredWidth') + extraWidth}px`;
      node.style.height = `${readAuthoredSize(node, 'authoredHeight') + extraHeight}px`;
    });

    root.querySelectorAll(MOVE_TARGET_SELECTOR).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;

      const factorX = readMoveFactor(node, 'moveFactorX');
      const factorY = readMoveFactor(node, 'moveFactorY');

      node.style.left = `${readAuthoredPosition(node, 'authoredLeft') + extraWidth * factorX}px`;
      node.style.top = `${readAuthoredPosition(node, 'authoredTop') + extraHeight * factorY}px`;
    });
  };

  // The window resize itself is what drives this, so a plain observer on the
  // canvas is enough: the growing elements never feed their own size back.
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(resizeTargets)
    : null;

  observer?.observe(root);
  resizeTargets();

  return {
    refresh: resizeTargets,
    dispose(): void {
      observer?.disconnect();
    }
  };
}
