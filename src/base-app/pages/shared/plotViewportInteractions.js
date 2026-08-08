(function (globalScope) {
  'use strict';

  const clamp = function (value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Number(value) || 0));
  };

  const copyViewport = function (viewport) {
    return {
      xMin: Number(viewport.xMin),
      xMax: Number(viewport.xMax),
      yMin: Number(viewport.yMin),
      yMax: Number(viewport.yMax)
    };
  };

  const centeredViewport = function (zoom, bounds) {
    const limits = copyViewport(bounds || {
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1
    });
    const factor = Math.max(1, Number(zoom) || 1);
    const width = (limits.xMax - limits.xMin) / factor;
    const height = (limits.yMax - limits.yMin) / factor;
    const xCenter = (limits.xMin + limits.xMax) / 2;
    const yCenter = (limits.yMin + limits.yMax) / 2;

    return {
      xMin: xCenter - width / 2,
      xMax: xCenter + width / 2,
      yMin: yCenter - height / 2,
      yMax: yCenter + height / 2
    };
  };

  const viewportFromSelection = function (viewport, selection) {
    const current = copyViewport(viewport);
    const xRange = current.xMax - current.xMin;
    const yRange = current.yMax - current.yMin;
    const left = clamp(selection.left, 0, 1);
    const right = clamp(selection.right, left, 1);
    const top = clamp(selection.top, 0, 1);
    const bottom = clamp(selection.bottom, top, 1);

    return {
      xMin: current.xMin + left * xRange,
      xMax: current.xMin + right * xRange,
      yMin: current.yMax - bottom * yRange,
      yMax: current.yMax - top * yRange
    };
  };

  const pannedViewport = function (viewport, deltaX, deltaY, bounds) {
    const current = copyViewport(viewport);
    const limits = copyViewport(bounds || {
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1
    });
    const xRange = current.xMax - current.xMin;
    const yRange = current.yMax - current.yMin;
    const requestedXMin = current.xMin - (Number(deltaX) || 0) * xRange;
    const requestedYMin = current.yMin + (Number(deltaY) || 0) * yRange;
    const xMin = clamp(
      requestedXMin,
      limits.xMin,
      Math.max(limits.xMin, limits.xMax - xRange)
    );
    const yMin = clamp(
      requestedYMin,
      limits.yMin,
      Math.max(limits.yMin, limits.yMax - yRange)
    );

    return {
      xMin,
      xMax: xMin + xRange,
      yMin,
      yMax: yMin + yRange
    };
  };

  const createInteraction = function (options) {
    if (!options || !options.element) {
      throw new Error('A plot viewport interaction requires an element.');
    }

    const element = options.element;
    const ownerDocument = element.ownerDocument || globalScope.document;
    const ownerWindow = ownerDocument.defaultView || globalScope;
    const minimumRectangleSize = Math.max(
      1,
      Number(options.minimumRectangleSize) || 8
    );
    let activeGesture = null;
    let pointerPosition = null;
    let shiftPressed = false;
    let disposed = false;

    const localPoint = function (event) {
      const rect = element.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    };

    const interactionBounds = function () {
      const raw = typeof options.getBounds === 'function'
        ? options.getBounds()
        : {
          left: 0,
          top: 0,
          right: element.clientWidth,
          bottom: element.clientHeight
        };
      const left = Number(raw && raw.left) || 0;
      const top = Number(raw && raw.top) || 0;
      const right = Math.max(left, Number(raw && raw.right) || left);
      const bottom = Math.max(top, Number(raw && raw.bottom) || top);

      return { left, top, right, bottom };
    };

    const pointIsInsideBounds = function (point) {
      const bounds = interactionBounds();
      return point.x >= bounds.left
        && point.x <= bounds.right
        && point.y >= bounds.top
        && point.y <= bounds.bottom;
    };

    const selectionForGesture = function (gesture) {
      if (!gesture || gesture.mode !== 'rectangle') return null;
      const bounds = interactionBounds();
      const startX = clamp(gesture.startX, bounds.left, bounds.right);
      const startY = clamp(gesture.startY, bounds.top, bounds.bottom);
      const currentX = clamp(gesture.currentX, bounds.left, bounds.right);
      const currentY = clamp(gesture.currentY, bounds.top, bounds.bottom);
      const left = Math.min(startX, currentX);
      const right = Math.max(startX, currentX);
      const top = Math.min(startY, currentY);
      const bottom = Math.max(startY, currentY);
      const width = right - left;
      const height = bottom - top;
      const boundsWidth = Math.max(1, bounds.right - bounds.left);
      const boundsHeight = Math.max(1, bounds.bottom - bounds.top);

      return {
        left,
        right,
        top,
        bottom,
        width,
        height,
        normalized: {
          left: (left - bounds.left) / boundsWidth,
          right: (right - bounds.left) / boundsWidth,
          top: (top - bounds.top) / boundsHeight,
          bottom: (bottom - bounds.top) / boundsHeight
        }
      };
    };

    const notifySelection = function (phase) {
      if (typeof options.onSelectionChange === 'function') {
        options.onSelectionChange(selectionForGesture(activeGesture), phase);
      }
    };

    const notifyGestureState = function () {
      if (typeof options.onGestureStateChange === 'function') {
        options.onGestureStateChange({
          selecting: Boolean(activeGesture && activeGesture.mode === 'rectangle'),
          panning: Boolean(activeGesture && activeGesture.mode === 'pan'),
          shiftPressed
        });
      }
    };

    const updateCursor = function () {
      if (activeGesture && activeGesture.mode === 'pan') {
        element.style.cursor = 'grabbing';
      } else if (activeGesture && activeGesture.mode === 'rectangle') {
        element.style.cursor = options.rectangleCursor || 'crosshair';
      } else if (
        shiftPressed
        && pointerPosition
        && pointIsInsideBounds(pointerPosition)
      ) {
        element.style.cursor = 'grab';
      } else {
        element.style.cursor = options.rectangleCursor || 'crosshair';
      }
    };

    const setShiftPressed = function (value) {
      const next = value === true;

      if (shiftPressed === next) {
        updateCursor();
        return;
      }

      shiftPressed = next;
      notifyGestureState();
      updateCursor();
    };

    const cancel = function () {
      if (!activeGesture) return;
      activeGesture = null;
      notifySelection('cancel');
      notifyGestureState();
      updateCursor();
    };

    const onPointerDown = function (event) {
      if (event.button !== undefined && event.button !== 0) return;
      const point = localPoint(event);
      pointerPosition = point;
      shiftPressed = shiftPressed || event.shiftKey === true;

      if (shiftPressed && pointIsInsideBounds(point)) {
        activeGesture = {
          mode: 'pan',
          pointerId: event.pointerId,
          startX: point.x,
          startY: point.y,
          currentX: point.x,
          currentY: point.y
        };
        if (typeof options.onPanStart === 'function') {
          options.onPanStart({ point });
        }
      } else if (options.rectangle !== false) {
        activeGesture = {
          mode: 'rectangle',
          pointerId: event.pointerId,
          startX: point.x,
          startY: point.y,
          currentX: point.x,
          currentY: point.y
        };
        notifySelection('start');
      } else {
        updateCursor();
        return;
      }

      if (typeof options.onGestureStart === 'function') {
        options.onGestureStart({
          mode: activeGesture.mode,
          point
        });
      }
      notifyGestureState();
      updateCursor();
      try { element.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
    };

    const onPointerMove = function (event) {
      const point = localPoint(event);
      pointerPosition = point;

      if (!activeGesture || activeGesture.pointerId !== event.pointerId) {
        updateCursor();
        if (typeof options.onHover === 'function') {
          options.onHover({ event, point, shiftPressed });
        }
        return;
      }

      activeGesture.currentX = point.x;
      activeGesture.currentY = point.y;
      if (activeGesture.mode === 'rectangle') {
        notifySelection('move');
      } else if (typeof options.onPan === 'function') {
        const bounds = interactionBounds();
        const width = Math.max(1, bounds.right - bounds.left);
        const height = Math.max(1, bounds.bottom - bounds.top);
        options.onPan({
          point,
          totalX: point.x - activeGesture.startX,
          totalY: point.y - activeGesture.startY,
          normalizedX: (point.x - activeGesture.startX) / width,
          normalizedY: (point.y - activeGesture.startY) / height
        });
      }
      updateCursor();
      event.preventDefault();
    };

    const finishPointer = function (event) {
      if (!activeGesture || activeGesture.pointerId !== event.pointerId) return;
      const completed = activeGesture;
      const selection = selectionForGesture(completed);
      activeGesture = null;
      try { element.releasePointerCapture(event.pointerId); } catch {}

      if (completed.mode === 'rectangle') {
        notifySelection('end');
        if (typeof options.onRectangleComplete === 'function') {
          options.onRectangleComplete(
            selection
            && selection.width >= minimumRectangleSize
            && selection.height >= minimumRectangleSize
              ? selection
              : null
          );
        }
      } else if (typeof options.onPanEnd === 'function') {
        options.onPanEnd();
      }
      notifyGestureState();
      updateCursor();
      event.preventDefault();
    };

    const onPointerCancel = function () {
      cancel();
    };

    const onPointerLeave = function () {
      if (activeGesture) return;
      pointerPosition = null;
      updateCursor();
      if (typeof options.onLeave === 'function') options.onLeave();
    };

    const onKeyDown = function (event) {
      if (event.key === 'Shift') {
        setShiftPressed(true);
        return;
      }
      if (event.key === 'Escape') cancel();
    };

    const onKeyUp = function (event) {
      if (event.key !== 'Shift') return;
      setShiftPressed(false);
    };

    const onBlur = function () {
      setShiftPressed(false);
      cancel();
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', finishPointer);
    element.addEventListener('pointercancel', onPointerCancel);
    element.addEventListener('pointerleave', onPointerLeave);
    ownerDocument.addEventListener('keydown', onKeyDown);
    ownerDocument.addEventListener('keyup', onKeyUp);
    ownerWindow.addEventListener('blur', onBlur);
    updateCursor();

    return {
      cancel,
      dispose: function () {
        if (disposed) return;
        disposed = true;
        element.removeEventListener('pointerdown', onPointerDown);
        element.removeEventListener('pointermove', onPointerMove);
        element.removeEventListener('pointerup', finishPointer);
        element.removeEventListener('pointercancel', onPointerCancel);
        element.removeEventListener('pointerleave', onPointerLeave);
        ownerDocument.removeEventListener('keydown', onKeyDown);
        ownerDocument.removeEventListener('keyup', onKeyUp);
        ownerWindow.removeEventListener('blur', onBlur);
      },
      getSelection: function () {
        return selectionForGesture(activeGesture);
      },
      isPanning: function () {
        return Boolean(activeGesture && activeGesture.mode === 'pan');
      },
      isSelecting: function () {
        return Boolean(activeGesture && activeGesture.mode === 'rectangle');
      },
      isShiftPressed: function () {
        return shiftPressed;
      },
      setShiftPressed,
      refreshCursor: updateCursor
    };
  };

  globalScope.DialogForgePlotViewport = Object.freeze({
    centeredViewport,
    createInteraction,
    pannedViewport,
    viewportFromSelection
  });
})(typeof window !== 'undefined' ? window : globalThis);
