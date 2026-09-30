"use client";

import { useId, useReducer } from "react";

import { ComposerSubmit, PrimaryButton } from "@/components/listwell/actions";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { safeAppPath } from "@/lib/query-params";

type GateSection = "access" | "interest";

interface GateState {
  accessBusy: boolean;
  accessError: string | null;
  interestBusy: boolean;
  interestError: string | null;
  interestMessage: string | null;
  interestName: string;
  interestEmail: string;
  interestNote: string;
  password: string;
  section: GateSection;
}

type GateAction =
  | { type: "access-busy"; busy: boolean }
  | { type: "access-error"; error: string | null }
  | { type: "password"; password: string }
  | { type: "section"; section: GateSection }
  | { type: "interest-field"; field: "name" | "email" | "note"; value: string }
  | { type: "interest-busy"; busy: boolean }
  | {
      type: "interest-result";
      error: string | null;
      message: string | null;
    };

const initialGateState: GateState = {
  accessBusy: false,
  accessError: null,
  interestBusy: false,
  interestEmail: "",
  interestError: null,
  interestMessage: null,
  interestName: "",
  interestNote: "",
  password: "",
  section: "access",
};

const gateReducer = (state: GateState, action: GateAction): GateState => {
  switch (action.type) {
    case "access-busy": {
      return { ...state, accessBusy: action.busy };
    }
    case "access-error": {
      return { ...state, accessBusy: false, accessError: action.error };
    }
    case "password": {
      return { ...state, accessError: null, password: action.password };
    }
    case "section": {
      return { ...state, section: action.section };
    }
    case "interest-field": {
      const next = {
        ...state,
        interestError: null,
        interestMessage: null,
      };
      if (action.field === "name") {
        return { ...next, interestName: action.value };
      }
      if (action.field === "email") {
        return { ...next, interestEmail: action.value };
      }
      return { ...next, interestNote: action.value };
    }
    case "interest-busy": {
      return { ...state, interestBusy: action.busy };
    }
    case "interest-result": {
      return {
        ...state,
        interestBusy: false,
        interestError: action.error,
        interestMessage: action.message,
      };
    }
    default: {
      return state;
    }
  }
};

export const SiteGatePage = ({ nextPath }: { nextPath: string }) => {
  const passwordId = useId();
  const nameId = useId();
  const emailId = useId();
  const noteId = useId();
  const [state, dispatch] = useReducer(gateReducer, initialGateState);
  const returnPath = safeAppPath(nextPath, "/");

  const unlock = async () => {
    if (state.accessBusy) {
      return;
    }
    dispatch({ busy: true, type: "access-busy" });
    dispatch({ error: null, type: "access-error" });
    try {
      const response = await fetch("/api/site-gate/unlock", {
        body: JSON.stringify({ password: state.password }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Could not unlock the site";
        dispatch({ error: message, type: "access-error" });
        return;
      }
      window.location.assign(returnPath);
    } catch {
      dispatch({
        error: "Could not reach the server. Try again.",
        type: "access-error",
      });
    }
  };

  const submitInterest = async () => {
    if (state.interestBusy) {
      return;
    }
    dispatch({ busy: true, type: "interest-busy" });
    dispatch({ error: null, message: null, type: "interest-result" });
    try {
      const response = await fetch("/api/site-gate/interest", {
        body: JSON.stringify({
          email: state.interestEmail,
          name: state.interestName,
          note: state.interestNote,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Could not save your details";
        dispatch({ error: message, message: null, type: "interest-result" });
        return;
      }
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "message" in payload &&
        typeof payload.message === "string"
          ? payload.message
          : "Thanks — we will be in touch.";
      dispatch({ error: null, message, type: "interest-result" });
    } catch {
      dispatch({
        error: "Could not reach the server. Try again.",
        message: null,
        type: "interest-result",
      });
    }
  };

  const accessErrorId = `${passwordId}-error`;

  return (
    <section className="listwell-site-gate">
      <div className="listwell-page w-full max-w-(--listwell-column)">
        <div className="listwell-panel">
          <div className="listwell-panel__head">
            <h1 className="listwell-panel__title">Listwell</h1>
          </div>
          <div className="listwell-panel__body">
            <p className="listwell-panel__question">
              Local and website SEO audits
            </p>
            <p className="listwell-panel__note">
              Listwell checks Google listings, your website, and key channels,
              then turns the results into a clear fix list. We are opening
              access in stages.
            </p>
            <fieldset className="listwell-panel__options m-0 min-w-0 border-0 p-0">
              <legend className="vbg-visually-hidden">
                How would you like to continue?
              </legend>
              <button
                type="button"
                className="listwell-chat__prompt-card-option"
                aria-pressed={state.section === "access"}
                onClick={() => dispatch({ section: "access", type: "section" })}
              >
                Enter password
              </button>
              <button
                type="button"
                className="listwell-chat__prompt-card-option"
                aria-pressed={state.section === "interest"}
                onClick={() =>
                  dispatch({ section: "interest", type: "section" })
                }
              >
                Join the waitlist
              </button>
            </fieldset>
          </div>
          {state.section === "access" ? (
            <form
              action={() => {
                void unlock();
              }}
            >
              <div className="listwell-chat__composer listwell-chat__composer--embedded">
                <label className="vbg-visually-hidden" htmlFor={passwordId}>
                  Password
                </label>
                <Input
                  id={passwordId}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Password"
                  value={state.password}
                  disabled={state.accessBusy}
                  aria-invalid={state.accessError ? true : undefined}
                  aria-describedby={
                    state.accessError ? accessErrorId : undefined
                  }
                  className="listwell-chat__input border-0 shadow-none focus-visible:ring-0"
                  onChange={(event) => {
                    dispatch({
                      password: event.target.value,
                      type: "password",
                    });
                  }}
                />
                <ComposerSubmit
                  label={state.accessBusy ? "Checking" : "Enter site"}
                  disabled={state.accessBusy || !state.password}
                />
              </div>
              {state.accessError ? (
                <div className="listwell-panel__foot">
                  <p
                    id={accessErrorId}
                    className="listwell-panel__error"
                    role="alert"
                  >
                    {state.accessError}
                  </p>
                </div>
              ) : null}
            </form>
          ) : (
            <form
              action={() => {
                void submitInterest();
              }}
            >
              <FieldGroup className="listwell-panel__body">
                <Field data-invalid={state.interestError ? true : undefined}>
                  <FieldLabel htmlFor={emailId}>Email</FieldLabel>
                  <Input
                    id={emailId}
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={state.interestEmail}
                    disabled={state.interestBusy}
                    onChange={(event) => {
                      dispatch({
                        field: "email",
                        type: "interest-field",
                        value: event.target.value,
                      });
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={nameId}>
                    Name{" "}
                    <span className="text-ink-3 font-normal">(optional)</span>
                  </FieldLabel>
                  <Input
                    id={nameId}
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={state.interestName}
                    disabled={state.interestBusy}
                    onChange={(event) => {
                      dispatch({
                        field: "name",
                        type: "interest-field",
                        value: event.target.value,
                      });
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={noteId}>
                    Business or website{" "}
                    <span className="text-ink-3 font-normal">(optional)</span>
                  </FieldLabel>
                  <Textarea
                    id={noteId}
                    name="note"
                    rows={3}
                    value={state.interestNote}
                    disabled={state.interestBusy}
                    onChange={(event) => {
                      dispatch({
                        field: "note",
                        type: "interest-field",
                        value: event.target.value,
                      });
                    }}
                  />
                </Field>
              </FieldGroup>
              <div className="listwell-panel__foot listwell-panel__foot--split">
                {state.interestError ? (
                  <p className="listwell-panel__error" role="alert">
                    {state.interestError}
                  </p>
                ) : null}
                {state.interestMessage ? (
                  <output className="listwell-panel__note">
                    {state.interestMessage}
                  </output>
                ) : null}
                <PrimaryButton
                  type="submit"
                  className="ml-auto"
                  disabled={state.interestBusy}
                >
                  {state.interestBusy ? "Sending…" : "Join the waitlist"}
                </PrimaryButton>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};
