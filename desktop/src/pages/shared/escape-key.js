(() => {
  if (window.FLY_ESCAPE) return;

  const handlers = [];
  const overlaySelector = [
    '.document-preview-backdrop',
    '.warehouse-modal-backdrop',
    '.modal-backdrop',
    '[data-escape-overlay="true"]'
  ].join(',');
  const closeSelector = [
    '.close-preview',
    '.warehouse-icon-button.close',
    '.warehouse-icon-button.close-modal',
    '.modal-close',
    '.close-btn',
    '[data-escape-close="true"]',
    '[aria-label="Đóng"]',
    '[aria-label="Close"]',
    '.warehouse-modal-actions .close',
    '.warehouse-modal-actions .close-modal'
  ].join(',');

  const isVisible = element => {
    if (!element || element.hidden) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  };

  const topVisibleOverlay = () => {
    const overlays = Array.from(document.querySelectorAll(overlaySelector)).filter(isVisible);
    return overlays.reduce((top, overlay) => {
      if (!top) return overlay;
      const topZ = Number.parseInt(window.getComputedStyle(top).zIndex, 10) || 0;
      const overlayZ = Number.parseInt(window.getComputedStyle(overlay).zIndex, 10) || 0;
      return overlayZ >= topZ ? overlay : top;
    }, null);
  };

  const closeOverlay = overlay => {
    const closeButton = Array.from(overlay.querySelectorAll(closeSelector))
      .find(button => isVisible(button) && !button.disabled);
    if (closeButton) {
      closeButton.click();
      return true;
    }

    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return !overlay.isConnected || !isVisible(overlay);
  };

  const closeOpenMenus = () => {
    const openMenus = Array.from(document.querySelectorAll([
      '#profileMenu:not([hidden])',
      '#languageMenu:not([hidden])',
      '.select-menu:not([hidden])',
      '[data-escape-menu="true"]:not([hidden])'
    ].join(','))).filter(isVisible);
    if (!openMenus.length) return false;

    document.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    openMenus.forEach(menu => { menu.hidden = true; });
    document.querySelectorAll('[aria-expanded="true"]').forEach(control => control.setAttribute('aria-expanded', 'false'));
    return true;
  };

  const register = ({ isOpen, close }) => {
    if (typeof close !== 'function') throw new TypeError('FLY_ESCAPE.register cần hàm close.');
    const handler = { isOpen: typeof isOpen === 'function' ? isOpen : () => true, close };
    handlers.push(handler);
    return () => {
      const index = handlers.indexOf(handler);
      if (index >= 0) handlers.splice(index, 1);
    };
  };

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.repeat) return;

    let handled = false;
    for (let index = handlers.length - 1; index >= 0; index -= 1) {
      const handler = handlers[index];
      if (!handler.isOpen()) continue;
      handler.close();
      handled = true;
      break;
    }

    if (!handled) {
      const overlay = topVisibleOverlay();
      if (overlay) handled = closeOverlay(overlay);
    }
    if (closeOpenMenus()) handled = true;
    if (!handled) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.FLY_ESCAPE = { register };
})();
