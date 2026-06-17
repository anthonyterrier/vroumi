"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Bouton qui ouvre une fenêtre modale contenant un formulaire.
 * Le contenu est passé en `children`. Pratique pour les "ajouter une saisie".
 */
export function Modal({
  trigger,
  title,
  children,
  triggerClassName = "btn-primary",
}: {
  trigger: React.ReactNode;
  title: string;
  children: React.ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        {trigger}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={ref}
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <div
              onClick={(e) => e.stopPropagation()}
              onSubmit={() => {
                // Ferme la modale après l'envoi du formulaire (server action).
                // Les champs requis sont validés par le navigateur avant que
                // l'événement submit ne se déclenche ; le délai laisse à React
                // le temps de dispatcher l'action avant le démontage.
                setTimeout(() => setOpen(false), 400);
              }}
            >
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
