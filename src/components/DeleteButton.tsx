"use client";

/**
 * Petit bouton de suppression qui demande confirmation avant de soumettre
 * le formulaire (server action) parent.
 */
export function DeleteButton({
  label = "Supprimer",
  confirmMessage = "Supprimer cet élément ?",
  className = "text-xs text-red-600 hover:underline",
}: {
  label?: string;
  confirmMessage?: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
