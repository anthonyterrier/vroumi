"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import {
  updateProfileAction,
  changePasswordAction,
  type ProfileState,
} from "@/app/(app)/profile/actions";

type ProfileInfo = {
  name: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
};

function Feedback({ state }: { state: ProfileState }) {
  if (state?.error) {
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state?.success) {
    return (
      <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
        {state.success}
      </p>
    );
  }
  return null;
}

export function ProfileForms({ user }: { user: ProfileInfo }) {
  const [infoState, infoAction] = useActionState<ProfileState, FormData>(
    updateProfileAction,
    undefined
  );
  const [pwState, pwAction] = useActionState<ProfileState, FormData>(
    changePasswordAction,
    undefined
  );

  return (
    <div className="space-y-5">
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Mes informations</h2>
        <form action={infoAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">
              Nom d&apos;affichage
            </label>
            <input
              id="name"
              name="name"
              className="input"
              defaultValue={user.name}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="firstName">
                Prénom{" "}
                <span className="font-normal text-gray-400">(optionnel)</span>
              </label>
              <input
                id="firstName"
                name="firstName"
                className="input"
                defaultValue={user.firstName ?? ""}
              />
            </div>
            <div>
              <label className="label" htmlFor="lastName">
                Nom{" "}
                <span className="font-normal text-gray-400">(optionnel)</span>
              </label>
              <input
                id="lastName"
                name="lastName"
                className="input"
                defaultValue={user.lastName ?? ""}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="email">
              E-mail{" "}
              <span className="font-normal text-gray-400">
                (sert à la connexion)
              </span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className="input"
              defaultValue={user.email ?? ""}
            />
          </div>

          <div>
            <label className="label" htmlFor="phone">
              Téléphone{" "}
              <span className="font-normal text-gray-400">(optionnel)</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              className="input"
              defaultValue={user.phone ?? ""}
            />
          </div>

          <Feedback state={infoState} />

          <SubmitButton className="btn-primary w-full">
            Enregistrer
          </SubmitButton>
        </form>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Changer le mot de passe</h2>
        <form action={pwAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="current">
              Mot de passe actuel
            </label>
            <input
              id="current"
              name="current"
              type="password"
              autoComplete="current-password"
              className="input"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="next">
              Nouveau mot de passe
            </label>
            <input
              id="next"
              name="next"
              type="password"
              autoComplete="new-password"
              className="input"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm">
              Confirmer le nouveau mot de passe
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              className="input"
              required
              minLength={6}
            />
          </div>

          <Feedback state={pwState} />

          <SubmitButton className="btn-primary w-full">
            Modifier le mot de passe
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
