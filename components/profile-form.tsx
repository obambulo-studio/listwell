"use client";

import { ChevronLeftIcon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useReducer } from "react";
import type { ReactNode } from "react";
import { z } from "zod";

import { Icon } from "@/components/icon";
import { PrimaryButton } from "@/components/listwell/actions";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

const profileNameSchema = z.string().trim().min(1).max(80);
const profileEmailSchema = z.string().trim().toLowerCase().pipe(z.email());
const profileCodeSchema = z.string().regex(/^\d{6}$/u);

const authErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

type EmailStep = "edit" | "code";

interface ProfileState {
  code: string;
  email: string;
  emailBusy: boolean;
  emailError: string | null;
  emailNotice: string | null;
  emailStep: EmailStep;
  name: string;
  nameBusy: boolean;
  nameError: string | null;
  nameNotice: string | null;
}

type ProfileAction =
  | { type: "code"; code: string }
  | { type: "email"; email: string }
  | { type: "email-busy"; busy: boolean }
  | { type: "email-error"; error: string | null }
  | { type: "email-reset" }
  | { type: "email-saved" }
  | { type: "email-sent"; email: string }
  | { type: "name"; name: string }
  | { type: "name-busy"; busy: boolean }
  | { type: "name-error"; error: string | null }
  | { type: "name-saved" };

const profileReducer = (
  state: ProfileState,
  action: ProfileAction
): ProfileState => {
  if (action.type === "name") {
    return { ...state, name: action.name, nameError: null, nameNotice: null };
  }
  if (action.type === "name-busy") {
    return { ...state, nameBusy: action.busy };
  }
  if (action.type === "name-error") {
    return { ...state, nameBusy: false, nameError: action.error };
  }
  if (action.type === "name-saved") {
    return {
      ...state,
      nameBusy: false,
      nameError: null,
      nameNotice: "Saved",
    };
  }
  if (action.type === "email") {
    return {
      ...state,
      email: action.email,
      emailError: null,
      emailNotice: null,
    };
  }
  if (action.type === "code") {
    return { ...state, code: action.code, emailError: null };
  }
  if (action.type === "email-busy") {
    return { ...state, emailBusy: action.busy };
  }
  if (action.type === "email-error") {
    return { ...state, emailBusy: false, emailError: action.error };
  }
  if (action.type === "email-reset") {
    return {
      ...state,
      code: "",
      emailBusy: false,
      emailError: null,
      emailStep: "edit",
    };
  }
  if (action.type === "email-sent") {
    return {
      ...state,
      code: "",
      email: action.email,
      emailBusy: false,
      emailError: null,
      emailNotice: null,
      emailStep: "code",
    };
  }
  if (action.type === "email-saved") {
    return {
      ...state,
      code: "",
      email: "",
      emailBusy: false,
      emailError: null,
      emailNotice: "Email updated",
      emailStep: "edit",
    };
  }
  return state;
};

const maskAccountEmail = (email: string): string => {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) {
    return "***";
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.charAt(0)}***@${domain}`;
};

const profileErrorMessage = (error: unknown, fallback: string): string => {
  const parsed = authErrorSchema.safeParse(error);
  if (!parsed.success) {
    return fallback;
  }
  const { code, message } = parsed.data;
  if (code === "INVALID_OTP" || message === "Invalid OTP") {
    return "That code is not valid";
  }
  if (code === "OTP_EXPIRED") {
    return "That code has expired. Send a new one.";
  }
  if (code === "TOO_MANY_ATTEMPTS") {
    return "Too many attempts. Send a new code.";
  }
  if (code === "UNAUTHORIZED") {
    return "Sign in again to update your profile";
  }
  if (message === "Email is the same") {
    return "That's already your email";
  }
  if (message === "Email already in use") {
    return "That email is already in use";
  }
  if (message && message.length > 0) {
    return message;
  }
  return fallback;
};

const BackChevron = () => <Icon icon={ChevronLeftIcon} size={15} />;

export const ProfileBackLink = () => (
  <Link className="listwell-back" href="/account">
    <BackChevron />
    Back
  </Link>
);

const ProfilePanel = ({
  action,
  children,
  heading = "h2",
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  heading?: "h1" | "h2";
  title: string;
}) => (
  <div className="listwell-panel">
    <div className="listwell-panel__head">
      {heading === "h1" ? (
        <h1 className="listwell-panel__title">{title}</h1>
      ) : (
        <h2 className="listwell-panel__title">{title}</h2>
      )}
      {action}
    </div>
    {children}
  </div>
);

const ProfileError = ({ id, message }: { id: string; message: string }) => (
  <div className="listwell-panel__foot">
    <p id={id} className="listwell-panel__error" role="alert">
      {message}
    </p>
  </div>
);

const ProfileEditor = ({
  currentEmail,
  initialName,
  savedName,
}: {
  currentEmail: string;
  initialName: string;
  savedName: string;
}) => {
  const { refresh } = useRouter();
  const nameFieldId = useId();
  const emailFieldId = useId();
  const codeFieldId = useId();
  const [state, dispatch] = useReducer(profileReducer, {
    code: "",
    email: "",
    emailBusy: false,
    emailError: null,
    emailNotice: null,
    emailStep: "edit",
    name: initialName,
    nameBusy: false,
    nameError: null,
    nameNotice: null,
  });
  const nameErrorId = `${nameFieldId}-error`;
  const emailErrorId = `${emailFieldId}-error`;
  const trimmedName = state.name.trim();
  const nameUnchanged = trimmedName === savedName.trim();

  const saveName = async () => {
    if (state.nameBusy || nameUnchanged) {
      return;
    }
    const parsed = profileNameSchema.safeParse(state.name);
    if (!parsed.success) {
      dispatch({
        error:
          state.name.trim().length > 80
            ? "Use 80 characters or fewer"
            : "Enter your name",
        type: "name-error",
      });
      return;
    }
    dispatch({ busy: true, type: "name-busy" });
    const result = await authClient.updateUser({ name: parsed.data });
    if (result.error) {
      dispatch({
        error: profileErrorMessage(result.error, "Could not save your name"),
        type: "name-error",
      });
      return;
    }
    await authClient.getSession();
    refresh();
    dispatch({ type: "name-saved" });
  };

  const sendEmailCode = async () => {
    if (state.emailBusy) {
      return;
    }
    const parsed = profileEmailSchema.safeParse(state.email);
    if (!parsed.success) {
      dispatch({ error: "Enter a valid email", type: "email-error" });
      return;
    }
    if (parsed.data === currentEmail.trim().toLowerCase()) {
      dispatch({ error: "That's already your email", type: "email-error" });
      return;
    }
    dispatch({ busy: true, type: "email-busy" });
    const result = await authClient.emailOtp.requestEmailChange({
      newEmail: parsed.data,
    });
    if (result.error) {
      dispatch({
        error: profileErrorMessage(result.error, "Could not send a code"),
        type: "email-error",
      });
      return;
    }
    dispatch({ email: parsed.data, type: "email-sent" });
  };

  const confirmEmail = async () => {
    if (state.emailBusy) {
      return;
    }
    const parsed = profileCodeSchema.safeParse(
      state.code.replaceAll(/\s/gu, "")
    );
    if (!parsed.success) {
      dispatch({ error: "Enter the 6-digit code", type: "email-error" });
      return;
    }
    dispatch({ busy: true, type: "email-busy" });
    const result = await authClient.emailOtp.changeEmail({
      newEmail: state.email,
      otp: parsed.data,
    });
    if (result.error) {
      dispatch({
        error: profileErrorMessage(result.error, "Could not update your email"),
        type: "email-error",
      });
      return;
    }
    await authClient.getSession();
    refresh();
    dispatch({ type: "email-saved" });
  };

  return (
    <>
      <ProfilePanel heading="h1" title="Profile">
        <form action={saveName}>
          <div className="listwell-panel__body listwell-panel__body--tight">
            <label className="listwell-panel__question" htmlFor={nameFieldId}>
              What should we call you?
            </label>
            <p className="listwell-panel__note">
              This name is shown on your account.
            </p>
            {state.nameNotice ? (
              <output className="listwell-panel__note">
                {state.nameNotice}
              </output>
            ) : null}
          </div>
          <div className="listwell-chat__composer listwell-chat__composer--embedded">
            <Input
              id={nameFieldId}
              type="text"
              name="name"
              autoComplete="name"
              maxLength={80}
              value={state.name}
              disabled={state.nameBusy}
              placeholder="Your name"
              aria-invalid={state.nameError ? true : undefined}
              aria-describedby={state.nameError ? nameErrorId : undefined}
              className="listwell-chat__input border-0 shadow-none focus-visible:ring-0"
              onChange={(event) => {
                dispatch({ name: event.target.value, type: "name" });
              }}
            />
            <PrimaryButton
              type="submit"
              size="sm"
              disabled={state.nameBusy || nameUnchanged || trimmedName === ""}
            >
              {state.nameBusy ? "Saving" : "Save"}
            </PrimaryButton>
          </div>
        </form>
        {state.nameError ? (
          <ProfileError id={nameErrorId} message={state.nameError} />
        ) : null}
      </ProfilePanel>

      <ProfilePanel
        title="Email"
        action={
          state.emailStep === "code" ? (
            <button
              type="button"
              className="listwell-panel__action"
              disabled={state.emailBusy}
              onClick={() => dispatch({ type: "email-reset" })}
            >
              Use a different email
            </button>
          ) : null
        }
      >
        {state.emailStep === "edit" ? (
          <form action={sendEmailCode}>
            <div className="listwell-panel__body listwell-panel__body--tight">
              <label
                className="listwell-panel__question"
                htmlFor={emailFieldId}
              >
                Change your email
              </label>
              <p className="listwell-panel__note">
                Current email is {currentEmail}. We&apos;ll send a code to the
                new address before it changes.
              </p>
              {state.emailNotice ? (
                <output className="listwell-panel__note">
                  {state.emailNotice}
                </output>
              ) : null}
            </div>
            <div className="listwell-chat__composer listwell-chat__composer--embedded">
              <Input
                id={emailFieldId}
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                value={state.email}
                disabled={state.emailBusy}
                placeholder="you@business.com"
                aria-invalid={state.emailError ? true : undefined}
                aria-describedby={state.emailError ? emailErrorId : undefined}
                className="listwell-chat__input border-0 shadow-none focus-visible:ring-0"
                onChange={(event) => {
                  dispatch({ email: event.target.value, type: "email" });
                }}
              />
              <PrimaryButton
                type="submit"
                size="sm"
                disabled={state.emailBusy || state.email.trim() === ""}
              >
                {state.emailBusy ? "Sending" : "Send code"}
              </PrimaryButton>
            </div>
          </form>
        ) : (
          <form action={confirmEmail}>
            <div className="listwell-panel__body listwell-panel__body--tight">
              <label className="listwell-panel__question" htmlFor={codeFieldId}>
                Enter the code we sent to {maskAccountEmail(state.email)}
              </label>
              <p className="listwell-panel__note">
                Your email stays {currentEmail} until this code is confirmed.
              </p>
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
                disabled={state.emailBusy}
                placeholder="000000"
                aria-invalid={state.emailError ? true : undefined}
                aria-describedby={state.emailError ? emailErrorId : undefined}
                className="listwell-chat__input listwell-chat__input--code border-0 shadow-none focus-visible:ring-0"
                onChange={(event) => {
                  dispatch({
                    code: event.target.value.replaceAll(/\D/gu, "").slice(0, 6),
                    type: "code",
                  });
                }}
              />
              <PrimaryButton
                type="submit"
                size="sm"
                disabled={state.emailBusy || state.code.length !== 6}
              >
                {state.emailBusy ? "Updating" : "Update email"}
              </PrimaryButton>
            </div>
          </form>
        )}
        {state.emailError ? (
          <ProfileError id={emailErrorId} message={state.emailError} />
        ) : null}
      </ProfilePanel>
    </>
  );
};

export const ProfileForm = ({
  email,
  name,
}: {
  email: string;
  name: string;
}) => {
  const session = authClient.useSession();
  const currentEmail = session.data?.user.email ?? email;
  const savedName = session.data?.user.name ?? name;

  return (
    <section className="listwell-page">
      <ProfileBackLink />
      <ProfileEditor
        currentEmail={currentEmail}
        initialName={name}
        savedName={savedName}
      />
    </section>
  );
};
