// Shared "flash a Copied ✓ / Copy failed message on the clicked button, then
// restore its original label" helper — extracted from a pattern repeated
// verbatim across every copy-* click handler in eventHandlers.ts. Same
// timing/behavior as before (1200ms), just no longer duplicated per call site.

/** Temporarily replaces `el`'s text with a success/failure message, then restores it. */
export function flashCopyFeedback(el: HTMLElement, ok: boolean, successText: string, failText = 'Copy failed', durationMs = 1200): void {
  const orig = el.textContent;
  el.textContent = ok ? successText : failText;
  window.setTimeout(() => {
    el.textContent = orig;
  }, durationMs);
}
