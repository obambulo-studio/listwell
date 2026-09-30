"use client";

import Link from "next/link";
import { useId, useReducer } from "react";
import type { ReactNode } from "react";
import useSWR from "swr";
import { z } from "zod";

import { ComposerSubmit } from "@/components/listwell/actions";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { getStoredBusinessIds } from "@/lib/storage";

const signInEmailSchema = z.string().email();
const signInCodeSchema = z.string().regex(/^\d{6}$/u);

const healthResponseSchema = z.object({
  convex: z.enum(["ok", "error"]),
});

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

const AUTH_UNAVAILABLE_MESSAGE =
  "Sign-in is temporarily unavailable. Try again in a few minutes.";

const fetchAuthHealth = async (
  url: string
): Promise<z.infer<typeof healthResponseSchema>> => {
  const response = await fetch(url);
  const payload: unknown = await response.json();
  const parsed = healthResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Invalid health response");
  }
  return parsed.data;
};

const SignInCard = ({
  action,
  children,
}: {
  action?: ReactNode;
  children: ReactNode;
}) => (
  <div className="listwell-panel">
    <div className="listwell-panel__head">
      <h1 className="listwell-panel__title">Sign in</h1>
      {action ?? (
        <Link className="listwell-panel__action" href="/">
          Back to chat
        </Link>
      )}
    </div>
    {children}
  </div>
);

const SignInError = ({ id, message }: { id: string; message: string }) => (
  <div className="listwell-panel__foot">
    <p id={id} className="listwell-panel__error" role="alert">
      {message}
    </p>
  </div>
);

const SignInCodeStep = ({
  codeFieldId,
  dispatch,
  onVerify,
  state,
}: {
  codeFieldId: string;
  dispatch: (action: SignInAction) => void;
  onVerify: () => Promise<void>;
  state: SignInState;
}) => {
  const errorId = `${codeFieldId}-error`;
  return (
    <SignInCard
      action={
        <button
          type="button"
          className="listwell-panel__action"
          disabled={state.busy}
          onClick={() => dispatch({ type: "reset-email" })}
        >
          Use a different email
        </button>
      }
    >
      <form action={onVerify}>
        <div className="listwell-panel__body">
          <label className="listwell-panel__question" htmlFor={codeFieldId}>
            Enter the code we sent to {maskAccountEmail(state.email)}
          </label>
        </div>
        <div className="listwell-chat__composer listwell-chat__composer--embedded">
          <Input
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
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? errorId : undefined}
            className="listwell-chat__input listwell-chat__input--code border-0 shadow-none focus-visible:ring-0"
            onChange={(event) => {
              dispatch({
                code: event.target.value.replaceAll(/\D/gu, "").slice(0, 6),
                type: "code",
              });
            }}
          />
          <ComposerSubmit
            label={state.busy ? "Signing in" : "Sign in"}
            disabled={state.busy || state.code.length !== 6}
          />
        </div>
      </form>
      {state.error ? <SignInError id={errorId} message={state.error} /> : null}
    </SignInCard>
  );
};

const SignInEmailStep = ({
  authServiceDown,
  dispatch,
  emailFieldId,
  healthLoading,
  onSendCode,
  state,
}: {
  authServiceDown: boolean;
  dispatch: (action: SignInAction) => void;
  emailFieldId: string;
  healthLoading: boolean;
  onSendCode: () => Promise<void>;
  state: SignInState;
}) => {
  const errorId = `${emailFieldId}-error`;
  return (
    <SignInCard>
      <form action={onSendCode}>
        <div className="listwell-panel__body listwell-panel__body--tight">
          <label className="listwell-panel__question" htmlFor={emailFieldId}>
            What is your email?
          </label>
          {authServiceDown && !healthLoading ? (
            <p className="listwell-panel__error" role="alert">
              {AUTH_UNAVAILABLE_MESSAGE}
            </p>
          ) : (
            <p className="listwell-panel__note">
              We&apos;ll email you a one-time code. No password needed.
            </p>
          )}
        </div>
        <div className="listwell-chat__composer listwell-chat__composer--embedded">
          <Input
            id={emailFieldId}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            value={state.email}
            disabled={state.busy || authServiceDown}
            placeholder="you@business.com"
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? errorId : undefined}
            className="listwell-chat__input border-0 shadow-none focus-visible:ring-0"
            onChange={(event) =>
              dispatch({ email: event.target.value, type: "email" })
            }
          />
          <ComposerSubmit
            label={state.busy ? "Sending code" : "Send code"}
            disabled={
              state.busy || authServiceDown || state.email.trim() === ""
            }
          />
        </div>
      </form>
      {state.error ? <SignInError id={errorId} message={state.error} /> : null}
    </SignInCard>
  );
};

export const SignInForm = ({ returnPath }: { returnPath: string }) => {
  const emailFieldId = useId();
  const codeFieldId = useId();
  const session = authClient.useSession();
  const authAvailable = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  const [state, dispatch] = useReducer(signInReducer, initialSignInState);
  const {
    data: health,
    error: healthError,
    isLoading: healthLoading,
  } = useSWR("/api/health", fetchAuthHealth, { revalidateOnFocus: false });
  const authServiceDown = Boolean(healthError || health?.convex === "error");

  const signedIn = Boolean(session.data?.user.email);
  const safeReturn = returnPath.startsWith("/") ? returnPath : "/";

  if (signedIn && !session.isPending) {
    window.location.assign(safeReturn);
  }

  const sendCode = async () => {
    if (state.busy) {
      return;
    }
    if (authServiceDown) {
      dispatch({ error: AUTH_UNAVAILABLE_MESSAGE, type: "error" });
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
        error: authServiceDown
          ? AUTH_UNAVAILABLE_MESSAGE
          : (result.error.message ?? "Could not send a code"),
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
        error:
          authServiceDown && result.error.message
            ? AUTH_UNAVAILABLE_MESSAGE
            : (result.error.message ?? "Invalid code"),
        type: "error",
      });
      return;
    }
    await claimStoredBusinesses();
    window.location.assign(safeReturn);
  };

  if (!authAvailable) {
    return (
      <SignInCard>
        <div className="listwell-panel__body">
          <p className="listwell-panel__text">
            Sign in is not available in this environment.
          </p>
        </div>
      </SignInCard>
    );
  }

  if (session.isPending || signedIn) {
    return (
      <SignInCard>
        <div className="listwell-panel__body">
          <p className="listwell-panel__note" aria-live="polite">
            Checking your session…
          </p>
        </div>
      </SignInCard>
    );
  }

  if (state.step === "code") {
    return (
      <SignInCodeStep
        codeFieldId={codeFieldId}
        dispatch={dispatch}
        onVerify={verifyCode}
        state={state}
      />
    );
  }

  return (
    <SignInEmailStep
      authServiceDown={authServiceDown}
      dispatch={dispatch}
      emailFieldId={emailFieldId}
      healthLoading={healthLoading}
      onSendCode={sendCode}
      state={state}
    />
  );
};
