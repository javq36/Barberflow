"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useGetSessionQuery,
  useRegisterOwnerMutation,
} from "@/lib/api/authApi";
import { APP_ROUTES } from "@/lib/config/app";
import { Texts } from "@/lib/content/texts";
import { useAppToast } from "@/lib/toast/toast-provider";

export default function RegisterPage() {
  const router = useRouter();
  const { Auth, Common } = Texts;
  const { showToast } = useAppToast();
  const { data: session, isLoading: isSessionLoading } = useGetSessionQuery();
  const isAuthenticated = session?.authenticated ?? false;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const [registerOwner, { isLoading }] = useRegisterOwnerMutation();

  useEffect(() => {
    if (!isSessionLoading && isAuthenticated) {
      router.replace(APP_ROUTES.Dashboard);
    }
  }, [isAuthenticated, isSessionLoading, router]);

  function getApiErrorMessage(error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "data" in error &&
      error.data &&
      typeof error.data === "object" &&
      "message" in error.data &&
      typeof error.data.message === "string"
    ) {
      return error.data.message;
    }

    return null;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    if (!name.trim()) {
      setFeedback(Auth.Validation.NameRequired);
      return;
    }

    if (!email.trim()) {
      setFeedback(Auth.Validation.EmailRequired);
      return;
    }

    if (!phone.trim()) {
      setFeedback(Auth.Validation.PhoneRequired);
      return;
    }

    if (!password.trim()) {
      setFeedback(Auth.Validation.PasswordRequired);
      return;
    }

    try {
      await registerOwner({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
      }).unwrap();

      setFeedback(Auth.Register.Success);
      showToast({
        title: Common.Toasts.RegisteredTitle,
        description: Auth.Register.Success,
        variant: "success",
      });
      router.push(APP_ROUTES.Login);
    } catch (error) {
      const message = getApiErrorMessage(error) ?? Auth.Register.Error;
      setFeedback(message);
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: message,
        variant: "error",
      });
    }
  }

  if (isSessionLoading || isAuthenticated) {
    return null;
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden px-4 py-8 sm:px-6">
      <div className="dashboard-atmosphere" />

      <section className="mx-auto w-full max-w-lg">
        <article className="dashboard-hero">
          <header className="mb-6 space-y-2">
            <h1 className="dashboard-heading text-3xl font-semibold tracking-tight">
              {Auth.Register.Title}
            </h1>
            <p className="dashboard-description">{Auth.Register.Description}</p>
          </header>

          <form className="space-y-4" onSubmit={onSubmit}>
            <label className="block space-y-1">
              <span className="dashboard-body-muted text-sm font-medium">
                {Auth.Register.NameLabel}
              </span>
              <input
                type="text"
                className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
              />
            </label>

            <label className="block space-y-1">
              <span className="dashboard-body-muted text-sm font-medium">
                {Auth.Register.EmailLabel}
              </span>
              <input
                type="email"
                className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </label>

            <label className="block space-y-1">
              <span className="dashboard-body-muted text-sm font-medium">
                {Auth.Register.PhoneLabel}
              </span>
              <input
                type="tel"
                className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
              />
            </label>

            <label className="block space-y-1">
              <span className="dashboard-body-muted text-sm font-medium">
                {Auth.Register.PasswordLabel}
              </span>
              <input
                type="password"
                className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading}
            >
              {isLoading ? Auth.Register.Submitting : Auth.Register.Submit}
            </button>

            {feedback ? (
              <p className="dashboard-microtext">{feedback}</p>
            ) : null}
          </form>

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <p className="dashboard-microtext">
              {Auth.Register.LoginPrompt}{" "}
              <Link
                href={APP_ROUTES.Login}
                className="text-primary underline-offset-2 hover:underline"
              >
                {Auth.Register.LoginCta}
              </Link>
            </p>
            <Link
              href={APP_ROUTES.Dashboard}
              className="dashboard-microtext text-primary underline-offset-2 hover:underline"
            >
              {Common.Actions.BackToDashboard}
            </Link>
          </footer>
        </article>
      </section>
    </main>
  );
}
