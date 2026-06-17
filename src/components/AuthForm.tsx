"use client";

import { useActionState } from "react";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { loginAction, registerAction, type AuthState } from "@/app/(auth)/actions";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction] = useActionState<AuthState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="space-y-4">
      {mode === "register" && (
        <div>
          <label className="label" htmlFor="name">
            Votre nom
          </label>
          <input id="name" name="name" className="input" required />
        </div>
      )}

      <div>
        <label className="label" htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          className="input"
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="input"
          required
          minLength={6}
        />
      </div>

      {mode === "register" && (
        <div>
          <label className="label" htmlFor="garageName">
            Nom du garage{" "}
            <span className="font-normal text-gray-400">(optionnel)</span>
          </label>
          <input
            id="garageName"
            name="garageName"
            className="input"
            placeholder="ex. Garage de la famille Durand"
          />
        </div>
      )}

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <SubmitButton className="btn-primary w-full">
        {mode === "login" ? "Se connecter" : "Créer mon compte"}
      </SubmitButton>

      <p className="text-center text-sm text-gray-500">
        {mode === "login" ? (
          <>
            Pas encore de compte ?{" "}
            <Link href="/register" className="font-medium text-brand-600 hover:underline">
              Inscrivez-vous
            </Link>
          </>
        ) : (
          <>
            Déjà inscrit ?{" "}
            <Link href="/login" className="font-medium text-brand-600 hover:underline">
              Connectez-vous
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
