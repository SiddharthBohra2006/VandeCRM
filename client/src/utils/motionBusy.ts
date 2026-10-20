/**
 * motionBusy — shows a small spinner inside buttons that are saving/loading,
 * with ZERO changes to the ~20 pages that render them.
 *
 * The app already swaps button text while busy, e.g. {saving ? 'Saving…' : 'Save'}
 * with the button disabled. This watches the DOM, and when a DISABLED <button> shows
 * text like "Saving…", "Creating...", "Signing in…" it adds the class "mo-busy-btn".
 * motion-premium.css (section 14) draws a spinner with ::before using currentColor,
 * so it follows every theme / custom colour automatically. When the text goes back
 * to normal the class is removed.
 *
 * Cost: one MutationObserver; each batch of DOM changes triggers ONE requestAnimationFrame
 * scan over `button:disabled` only (usually 0–3 elements). Skipped for reduced motion
 * (CSS is also inside the no-preference media query).
 * Kill switch: delete the initMotionBusy() call in main.tsx.
 */

// Text must START with a busy verb and END with an ellipsis ("…" or "..." ), e.g.
// "Saving…", "Saving & Encrypting...", "Creating workspace…", "Signing in…", "Loading modules..."
const BUSY_TEXT =
  /^\s*(saving|creating|sending|signing|loading|deleting|uploading|importing|exporting|adding|updating|connecting|syncing|submitting|processing|reverting|refreshing|forwarding|resending|verifying|testing|applying|merging|publishing|generating|installing)\b[^]*?(…|\.{2,})\s*$/i;

const CLASS = 'mo-busy-btn';

function scan(): void {
  // 1) add the class to disabled buttons that look busy
  document.querySelectorAll<HTMLButtonElement>('button:disabled').forEach(btn => {
    const busy = BUSY_TEXT.test(btn.textContent || '');
    if (busy && !btn.classList.contains(CLASS)) btn.classList.add(CLASS);
    else if (!busy && btn.classList.contains(CLASS)) btn.classList.remove(CLASS);
  });
  // 2) clean up buttons that are no longer disabled (or whose text changed)
  document.querySelectorAll<HTMLButtonElement>(`button.${CLASS}`).forEach(btn => {
    if (!btn.disabled || !BUSY_TEXT.test(btn.textContent || '')) btn.classList.remove(CLASS);
  });
}

export function initMotionBusy(): void {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      scan();
    });
  };
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['disabled'],
  });
}
