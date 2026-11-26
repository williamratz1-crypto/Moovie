import { useEffect, useLayoutEffect } from 'react';

/**
 * Reveals content as it scrolls into view.
 *
 * Why a hook and not just CSS: entrance animations that run on mount finish
 * while the element is still below the fold, so by the time you scroll to the
 * grid it is already settled and nothing appears to move. This observes the
 * actual intersections instead, so the motion happens when it is visible.
 *
 * Safety: the hidden state is applied by the same script that installs the
 * observer (`html.motion-ready`). If JS never runs, or the user asks for
 * reduced motion, nothing is ever hidden — the content just renders.
 */

// Layout effect on the client so the hidden state lands before the first paint
// (a plain effect would paint the content, hide it, then animate: a flicker).
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const TARGETS = [
  '.catalog-section',
  '.continue-section',
  '.featured-pick-banner',
  '.profile-content-section',
  '.profile-panel',
  '.settings-panel',
  '.watchlist-status-tabs',
  '.discovery-hub > *',
  '.search-discovery-page > *',
  '.footer-note',
].join(',');

export function useReveal(rootRef, deps = []) {
  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined') return undefined;
    if (!('IntersectionObserver' in window)) return undefined;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (reduced?.matches) return undefined;

    const targets = Array.from(root.querySelectorAll(TARGETS));
    if (!targets.length) return undefined;

    document.documentElement.classList.add('motion-ready');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, {
      // Fire slightly before the element reaches the fold so the motion is
      // finishing, not starting, as it settles into view.
      rootMargin: '0px 0px -8% 0px',
      threshold: 0.05,
    });

    targets.forEach((target) => {
      target.classList.add('reveal');
      observer.observe(target);
    });

    return () => observer.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
