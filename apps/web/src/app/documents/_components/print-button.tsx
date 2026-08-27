"use client";

/**
 * Printing is a browser action, so this one control has to be a client island.
 *
 * The colours are raw neutrals rather than the semantic tokens the rest of the
 * app uses: this button sits on the printed page's white sheet, which never
 * inverts. A token here would turn white-on-white the moment the viewer's
 * browser is in dark mode. Only the metrics — 32px tall, 4px corners — are
 * borrowed from the design language so it does not look foreign.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-8 items-center justify-center rounded border border-neutral-300 px-3 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 print:hidden"
    >
      Yazdır
    </button>
  );
}
