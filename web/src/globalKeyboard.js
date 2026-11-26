/**
 * Global keyboard shortcuts for Moovie Web.
 *
 * Additive module wired from main.jsx — no changes to App.jsx needed.
 *
 *   Cmd/Ctrl + K  → focus the topbar search input and select all text,
 *                    so typing immediately replaces the current query.
 *   Escape        → close the topmost open overlay, in priority order:
 *                    player > rating prompt > trailer > auth > detail page.
 *
 * Escape handling only runs when the player is NOT open, because
 * App.jsx already installs its own Escape handler for the player.
 */

const OVERLAY_SELECTORS = [
  '.rating-prompt-backdrop',
  '.trailer-backdrop',
  '.auth-backdrop',
  '.detail-page-backdrop',
];

function isTyping(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function triggerOverlayClose() {
  for (const selector of OVERLAY_SELECTORS) {
    const backdrop = document.querySelector(selector);
    if (!backdrop) continue;

    // Detail page has no backdrop click-to-close; use its explicit close button.
    if (selector === '.detail-page-backdrop') {
      const close = backdrop.querySelector('.detail-page-close');
      if (close) close.click();
      return true;
    }

    // Modal backdrops already close on backdrop click (stopPropagation guards
    // inner content), so clicking the backdrop is the same as dismissing.
    backdrop.click();
    return true;
  }
  return false;
}

function handleKeydown(event) {
  // Cmd/Ctrl + K → focus search + select all.
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    const input = document.querySelector('.search-box input');
    if (input) {
      event.preventDefault();
      input.focus();
      input.select();
    }
    return;
  }

  // Escape → close the topmost overlay (player handles its own Escape).
  if (event.key === 'Escape') {
    const playerOpen = Boolean(document.querySelector('.player-backdrop'));
    if (!playerOpen && triggerOverlayClose()) {
      event.preventDefault();
    }
  }
}

export function installGlobalKeyboard() {
  window.addEventListener('keydown', handleKeydown);
  return () => window.removeEventListener('keydown', handleKeydown);
}
