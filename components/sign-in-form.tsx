"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import { getStoredBusinessIds } from "@/lib/storage";

const signInEmailSchema = z.string().email();
const signInCodeSchema = z.string().regex(/^\d{6}$/u);

type SignInStep = "email" | "code";

const maskAccountEmail = (email: string): string => {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) {
    return "***";
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const first = local.charAt(0);
  return `${first}***@${domain}`;
};

const claimStoredBusinesses = async (): Promise<void> => {
  const ids = getStoredBusinessIds();
  if (ids.length === 0) {
    return;
  }
  try {
    await fetch("/api/businesses/claim", {
      body: JSON.stringify({ ids }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  } catch {
    // Best-effort claim after sign-in.
  }
};

export const SignInForm = ({ returnPath }: { returnPath: string }) => {
  const emailFieldId = useId();
  const codeFieldId = useId();
  const session = authClient.useSession();
  const authAvailable = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  const [step, setStep] = useState<SignInStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signedIn = Boolean(session.data?.user.email);

  useEffect(() => {
    if (!signedIn || session.isPending) {
      return;
    }
    window.location.assign(returnPath.startsWith("/") ? returnPath : "/");
  }, [returnPath, session.isPending, signedIn]);

  const handleSendCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    const parsed = signInEmailSchema.safeParse(email.trim().toLowerCase());
    if (!parsed.success) {
      setError("Enter a valid email");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await authClient.emailOtp.sendVerificationOtp({
      email: parsed.data,
      type: "sign-in",
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "Could not send a code");
      return;
    }
    setEmail(parsed.data);
    setStep("code");
  };

  const handleVerifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    const parsed = signInCodeSchema.safeParse(code.replaceAll(/\s/gu, ""));
    if (!parsed.success) {
      setError("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await authClient.signIn.emailOtp({
      email,
      otp: parsed.data,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "Invalid code");
      return;
    }
    await claimStoredBusinesses();
    window.location.assign(returnPath.startsWith("/") ? returnPath : "/");
  };

  if (!authAvailable) {
    return (
      <>
        <h1 className="vbg-title">Sign in</h1>
        <p className="vbg-lede">
          Sign in is not available in this environment.
        </p>
        <p className="vbg-lede">
          <Link href="/">Back to chat</Link>
        </p>
      </>
    );
  }

  if (session.isPending || signedIn) {
    return (
      <>
        <h1 className="vbg-title">Sign in</h1>
        <p className="vbg-lede">Checking your session…</p>
      </>
    );
  }

  if (step === "code") {
    return (
      <form className="listwell-report__unlock" onSubmit={handleVerifyCode}>
        <h1 className="vbg-title">Enter your code</h1>
        <p className="vbg-lede">We sent a code to {maskAccountEmail(email)}.</p>
        <div className="vbg-field">
          <label className="vbg-label" htmlFor={codeFieldId}>
            Code
          </label>
          <input
            id={codeFieldId}
            type="text"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            disabled={busy}
            placeholder="000000"
            className="vbg-mono"
            autoFocus
            onChange={(event) => {
              const next = event.target.value
                .replaceAll(/\D/gu, "")
                .slice(0, 6);
              setCode(next);
              if (error) {
                setError(null);
              }
            }}
          />
        </div>
        <div className="listwell-report__unlock-actions">
          <button
            className="listwell-report__button"
            type="submit"
            disabled={busy || code.length !== 6}
          >
            {busy ? "Signing in" : "Sign in"}
          </button>
          <button
            className="listwell-report__button listwell-report__button--quiet"
            type="button"
            disabled={busy}
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
          >
            Use a different email
          </button>
        </div>
        {error ? <p className="vbg-error">{error}</p> : null}
      </form>
    );
  }

  return (
    <form className="listwell-report__unlock" onSubmit={handleSendCode}>
      <h1 className="vbg-title">Sign in</h1>
      <p className="vbg-lede">
        We&apos;ll email you a one-time code. No password needed.
      </p>
      <div className="vbg-field">
        <label className="vbg-label" htmlFor={emailFieldId}>
          Email
        </label>
        <input
          id={emailFieldId}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          disabled={busy}
          placeholder="you@business.com"
          autoFocus
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) {
              setError(null);
            }
          }}
        />
      </div>
      <div className="listwell-report__unlock-actions">
        <button
          className="listwell-report__button"
          type="submit"
          disabled={busy}
        >
          {busy ? "Sending code" : "Send code"}
        </button>
        <Link
          className="listwell-report__button listwell-report__button--quiet"
          href="/"
        >
          Back to chat
        </Link>
      </div>
      {error ? <p className="vbg-error">{error}</p> : null}
    </form>
  );
};
