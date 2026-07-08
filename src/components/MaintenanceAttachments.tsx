"use client";

import { useRef, useState, useTransition } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import {
  addMaintenanceAttachments,
  deleteMaintenanceAttachment,
} from "@/app/(app)/vehicles/[id]/actions";
import { analyzeAttachment } from "@/app/(app)/vehicles/[id]/invoice-actions";
import { isPdf } from "@/lib/carte-grise-fields";

type Attachment = {
  id: string;
  mimeType: string;
  fileName: string | null;
};

const MAX_MB = 20;

/** Bouton « Analyser avec l'IA » sur une pièce jointe déjà enregistrée. */
function AnalyzeButton({
  vehicleId,
  attachmentId,
}: {
  vehicleId: string;
  attachmentId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      title="Analyser avec l'IA et remplir l'entretien"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            "Analyser cette pièce jointe avec l'IA et remplir l'entretien à partir de son contenu ?"
          )
        )
          return;
        startTransition(() => {
          analyzeAttachment(vehicleId, attachmentId);
        });
      }}
      className="absolute -bottom-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] leading-none text-white shadow hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "…" : "🔎"}
    </button>
  );
}

export function MaintenanceAttachments({
  vehicleId,
  maintenanceId,
  attachments,
  canEdit,
  aiEnabled = false,
}: {
  vehicleId: string;
  maintenanceId: string;
  attachments: Attachment[];
  canEdit: boolean;
  aiEnabled?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [tooBig, setTooBig] = useState(false);

  const hasAny = attachments.length > 0;
  if (!hasAny && !canEdit) return null;

  const src = (attId: string) =>
    `/api/vehicles/${vehicleId}/maintenance-attachments/${attId}`;

  return (
    <div className="mt-2 space-y-2">
      {hasAny && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div key={a.id} className="relative">
              <a
                href={src(a.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                title={a.fileName ?? "Pièce jointe"}
              >
                {isPdf(a.mimeType) ? (
                  <span className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border border-gray-200 bg-gray-50 text-[10px] text-gray-500">
                    <span className="text-lg">📄</span>
                    PDF
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src(a.id)}
                    alt={a.fileName ?? "Pièce jointe"}
                    className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
                  />
                )}
              </a>
              {canEdit && (
                <form
                  action={deleteMaintenanceAttachment.bind(
                    null,
                    vehicleId,
                    a.id
                  )}
                  className="absolute -right-1.5 -top-1.5"
                >
                  <DeleteButton
                    label="×"
                    confirmMessage="Supprimer cette pièce jointe ?"
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[11px] leading-none text-white shadow hover:bg-red-700"
                  />
                </form>
              )}
              {canEdit && aiEnabled && (
                <AnalyzeButton vehicleId={vehicleId} attachmentId={a.id} />
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <form
          ref={formRef}
          action={async (fd) => {
            await addMaintenanceAttachments(vehicleId, maintenanceId, fd);
            formRef.current?.reset();
            setTooBig(false);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            type="file"
            name="files"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              setTooBig(files.some((f) => f.size > MAX_MB * 1024 * 1024));
            }}
            className="text-xs file:mr-2 file:rounded file:border-0 file:bg-gray-100 file:px-2 file:py-1 file:text-xs"
          />
          <SubmitButton
            className="btn-secondary px-2 py-1 text-xs"
            pendingLabel="Envoi…"
          >
            + Joindre facture / photo
          </SubmitButton>
          {tooBig && (
            <span className="text-[11px] text-red-600">
              Fichier trop lourd (max {MAX_MB} Mo).
            </span>
          )}
        </form>
      )}
    </div>
  );
}
