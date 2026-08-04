"use client";

/** Printing is a browser action, so this one control has to be a client island. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-neutral-300 px-3 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-50 print:hidden"
    >
      Yazdır
    </button>
  );
}
