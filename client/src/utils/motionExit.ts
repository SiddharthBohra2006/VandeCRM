/**
 * motionExit — universal EXIT animations for modals, drawers' overlays, popovers and menus.
 *
 * Why this exists: every overlay in this app is rendered conditionally ({open && <Modal/>}),
 * so when it closes React removes it instantly and CSS can never animate it out.
 * Instead of rewriting ~30 components, this watches the DOM. When a known overlay/popover
 * element is removed, it re-inserts an inert, non-interactive CLONE (class "mo-ghost") at the
 * same position; motion-premium.css (section 13) fades it out; the clone is then deleted.
 *
 * Safety:
 *  - Real UI is never touched. The clone has pointer-events:none, inert, aria-hidden,
 *    no ids, no tab stops, and is removed after ~170 ms (hard timeout 600 ms).
 *  - Skipped for prefers-reduced-motion, hidden tabs, and when the parent was removed too
 *    (e.g. page navigation), so it never lingers over a different screen.
 *  - Zero dependencies, one MutationObserver, work only when a matching node is removed.
 *  - Kill switch: delete the initMotionExit() call in main.tsx.
 */

const EXIT_SELECTOR = [
  // modal overlays / backdrops
  '.modal-overlay',
  '.csv-modal-overlay',
  '.auto-modal-overlay',
  '.module-builder-dialog-overlay',
  '.invoice-payment-modal-backdrop',
  '.filter-modal-backdrop',
  '.crm-search-modal-backdrop',
  '.sidebar-preferences-overlay',
  '[role="dialog"][aria-modal="true"]',
  // popovers and menus
  '.notification-dropdown',
  '.new-work-popover',
  '.more-actions-menu',
  '.follow-ups-date-popover',
  '.weekly-day-popover',
  '.icon-library-popover',
  '.crm-switcher-popover',
  '.app-select-menu',
].join(',');

const GHOST_CLASS = 'mo-ghost';
const HARD_TIMEOUT_MS = 600;

function makeGhost(source: HTMLElement): HTMLElement {
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('id');
  ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  ghost.querySelectorAll('a, button, input, select, textarea, [tabindex]').forEach(el => {
    el.setAttribute('tabindex', '-1');
  });
  ghost.classList.add(GHOST_CLASS);
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  return ghost;
}

export function initMotionExit(): void {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  const observer = new MutationObserver(records => {
    if (reduce.matches || document.hidden) return;

    for (const record of records) {
      if (record.removedNodes.length === 0) continue;
      const parent = record.target;
      // Parent gone too (route change, whole page unmounted): never leave a ghost behind.
      if (!(parent instanceof HTMLElement) || !parent.isConnected) continue;

      record.removedNodes.forEach(node => {
        if (!(node instanceof HTMLElement)) return;
        if (node.classList.contains(GHOST_CLASS)) return; // our own cleanup
        if (!node.matches(EXIT_SELECTOR)) return;

        const ghost = makeGhost(node);
        const ref = record.nextSibling && record.nextSibling.parentNode === parent ? record.nextSibling : null;
        parent.insertBefore(ghost, ref);

        const remove = () => {
          if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
        };
        ghost.addEventListener('animationend', e => {
          if (e.target === ghost) remove();
        });
        window.setTimeout(remove, HARD_TIMEOUT_MS);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
