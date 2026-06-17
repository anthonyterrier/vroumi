"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { acceptInviteAction, type AuthState } from "@/app/(auth)/actions";

export function InviteForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(
    acceptInviteAction,
    undefined
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">
          Choisissez un mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          className="input"
          required
          minLength={6}
        />
      </div>

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <SubmitButton className="btn-primary w-full">
        Activer mon compte
      </SubmitButton>
    </form>
  );
}
