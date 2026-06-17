"use client";

import { useState } from "react";

export function CopyButton({
  value,
  className = "btn-secondary",
  label = "Copier le lien",
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // ignore (clipboard indisponible)
        }
      }}
    >
      {copied ? "Copié ✓" : label}
    </button>
  );
}
