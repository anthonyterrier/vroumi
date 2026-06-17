"use client";

export function PrintButton({
  className = "btn-secondary no-print",
  label = "Imprimer",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      {label}
    </button>
  );
}
