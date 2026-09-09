"use client";

import Link from "next/link";
import { useId, useReducer } from "react";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import { getStoredBusinessIds } from "@/lib/storage";

const signInEmailSchema = z.string().email();
const signInCodeSchema = z.string().regex(/^\d{6}$/u);

type SignInStep = "email" | "code";

interface SignInState {
  busy: boolean;
  code: string;
  email: string;
  error: string | null;
  step: SignInStep;
}

type SignInAction =
  | { type: "busy"; busy: boolean }
  | { type: "code"; code: string }
  | { type: "email"; email: string }
  | { type: "error"; error: string | null }
  | { type: "reset-email" }
  | { type: "sent"; email: string };

const initialSignInState: SignInState = {
  busy: false,
  code: "",
  email: "",
  error: null,
  step: "email",
};

const signInReducer = (
  state: SignInState,
  action: SignInAction
): SignInState => {
  if (action.type === "busy") {
    return { ...state, busy: action.busy };
  }
  if (action.type === "code") {
    return { ...state, code: action.code, error: null };
  }
  if (action.type === "email") {
    return { ...state, email: action.email, error: null };
  }
  if (action.type === "error") {
    return { ...state, busy: false, error: action.error };
  }
  if (action.type === "reset-email") {
    return { ...state, code: "", error: null, step: "email" };
  }
  return {
    ...state,
    busy: false,
    email: action.email,
    error: null,
    step: "code",
  };
};

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
  const [state, dispatch] = useReducer(signInReducer, initialSignInState);

  const signedIn = Boolean(session.data?.user.email);
  const safeReturn = returnPath.startsWith("/") ? returnPath : "/";

  if (signedIn && !session.isPending) {
    window.location.assign(safeReturn);
  }

  const sendCode = async () => {
    if (state.busy) {
      return;
    }
    const parsed = signInEmailSchema.safeParse(
      state.email.trim().toLowerCase()
    );
    if (!parsed.success) {
      dispatch({ error: "Enter a valid email", type: "error" });
      return;
    }
    dispatch({ busy: true, type: "busy" });
    const result = await authClient.emailOtp.sendVerificationOtp({
      email: parsed.data,
      type: "sign-in",
    });
    if (result.error) {
      dispatch({
        error: result.error.message ?? "Could not send a code",
        type: "error",
      });
      return;
    }
    dispatch({ email: parsed.data, type: "sent" });
  };

  const verifyCode = async () => {
    if (state.busy) {
      return;
    }
    const parsed = signInCodeSchema.safeParse(
      state.code.replaceAll(/\s/gu, "")
    );
    if (!parsed.success) {
      dispatch({ error: "Enter the 6-digit code", type: "error" });
      return;
    }
    dispatch({ busy: true, type: "busy" });
    const result = await authClient.signIn.emailOtp({
      email: state.email,
      otp: parsed.data,
    });
    if (result.error) {
      dispatch({
        error: result.error.message ?? "Invalid code",
        type: "error",
      });
      return;
    }
    await claimStoredBusinesses();
    window.location.assign(safeReturn);
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

  if (state.step === "code") {
    return (
      <form className="listwell-report__unlock" action={verifyCode}>
        <h1 className="vbg-title">Enter your code</h1>
        <p className="vbg-lede">
          We sent a code to {maskAccountEmail(state.email)}.
        </p>
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
            value={state.code}
            disabled={state.busy}
            placeholder="000000"
            className="vbg-mono"
            onChange={(event) => {
              dispatch({
                code: event.target.value.replaceAll(/\D/gu, "").slice(0, 6),
                type: "code",
              });
            }}
          />
        </div>
        <div className="listwell-report__unlock-actions">
          <button
            className="listwell-report__button"
            type="submit"
            disabled={state.busy || state.code.length !== 6}
          >
            {state.busy ? "Signing in" : "Sign in"}
          </button>
          <button
            className="listwell-report__button listwell-report__button--quiet"
            type="button"
            disabled={state.busy}
            onClick={() => dispatch({ type: "reset-email" })}
          >
            Use a different email
          </button>
        </div>
        {state.error ? <p className="vbg-error">{state.error}</p> : null}
      </form>
    );
  }

  return (
    <form className="listwell-report__unlock" action={sendCode}>
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
          value={state.email}
          disabled={state.busy}
          placeholder="you@business.com"
          onChange={(event) =>
            dispatch({ email: event.target.value, type: "email" })
          }
        />
      </div>
      <div className="listwell-report__unlock-actions">
        <button
          className="listwell-report__button"
          type="submit"
          disabled={state.busy}
        >
          {state.busy ? "Sending code" : "Send code"}
        </button>
        <Link
          className="listwell-report__button listwell-report__button--quiet"
          href="/"
        >
          Back to chat
        </Link>
      </div>
      {state.error ? <p className="vbg-error">{state.error}</p> : null}
    </form>
  );
};
