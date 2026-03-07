"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGetSessionQuery, useLoginMutation } from "@/lib/api/authApi";
import { APP_ROUTES } from "@/lib/config/app";
import { Texts } from "@/lib/content/texts";
import { useAppToast } from "@/lib/toast/toast-provider";

export default function LoginPage() {
  const router = useRouter();
  const { Auth, Common } = Texts;
  const { showToast } = useAppToast();
  const { data: session, isLoading: isSessionLoading } = useGetSessionQuery();
  const isAuthenticated = session?.authenticated ?? false;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [login, { isLoading }] = useLoginMutation();

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

    if (!email.trim()) {
      setFeedback(Auth.Validation.EmailRequired);
      return;
    }

    if (!password.trim()) {
      setFeedback(Auth.Validation.PasswordRequired);
      return;
    }

    try {
      await login({ email: email.trim(), password }).unwrap();
      setFeedback(Auth.Login.Success);
      showToast({
        title: Common.Toasts.LoggedInTitle,
        description: Auth.Login.Success,
        variant: "success",
      });
      router.push(APP_ROUTES.Dashboard);
    } catch (error) {
      const message = getApiErrorMessage(error) ?? Auth.Login.Error;
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
              {Auth.Login.Title}
            </h1>
            <p className="dashboard-description">{Auth.Login.Description}</p>
          </header>

          <form className="space-y-4" onSubmit={onSubmit}>
            <label className="block space-y-1">
              <span className="dashboard-body-muted text-sm font-medium">
                {Auth.Login.EmailLabel}
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
                {Auth.Login.PasswordLabel}
              </span>
              <input
                type="password"
                className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading}
            >
              {isLoading ? Auth.Login.Submitting : Auth.Login.Submit}
            </button>

            {feedback ? (
              <p className="dashboard-microtext">{feedback}</p>
            ) : null}
          </form>

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <p className="dashboard-microtext">
              {Auth.Login.RegisterPrompt}{" "}
              <Link
                href={APP_ROUTES.Register}
                className="text-primary underline-offset-2 hover:underline"
              >
                {Auth.Login.RegisterCta}
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
