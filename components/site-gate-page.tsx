"use client";

import { useId, useReducer } from "react";

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

  return (
    <section className="listwell-site-gate">
      <div className="listwell-site-gate__panel">
        <p className="listwell-site-gate__eyebrow">Listwell</p>
        <h1 className="vbg-title">Local and website SEO audits</h1>
        <p className="vbg-lede">
          Listwell checks Google listings, your website, and key channels, then
          turns the results into a clear fix list. We are opening access in
          stages.
        </p>

        <div className="listwell-site-gate__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={state.section === "access"}
            className={
              state.section === "access"
                ? "listwell-site-gate__tab listwell-site-gate__tab--active"
                : "listwell-site-gate__tab"
            }
            onClick={() => {
              dispatch({ section: "access", type: "section" });
            }}
          >
            Enter password
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={state.section === "interest"}
            className={
              state.section === "interest"
                ? "listwell-site-gate__tab listwell-site-gate__tab--active"
                : "listwell-site-gate__tab"
            }
            onClick={() => {
              dispatch({ section: "interest", type: "section" });
            }}
          >
            Interested? Leave your details
          </button>
        </div>

        {state.section === "access" ? (
          <form
            className="listwell-site-gate__form"
            onSubmit={(event) => {
              event.preventDefault();
              void unlock();
            }}
          >
            <div className="vbg-field">
              <label className="vbg-label" htmlFor={passwordId}>
                Password
              </label>
              <input
                id={passwordId}
                name="password"
                type="password"
                autoComplete="current-password"
                value={state.password}
                disabled={state.accessBusy}
                onChange={(event) => {
                  dispatch({
                    password: event.target.value,
                    type: "password",
                  });
                }}
              />
            </div>
            {state.accessError ? (
              <p className="listwell-site-gate__error" role="alert">
                {state.accessError}
              </p>
            ) : null}
            <button
              className="listwell-report__button listwell-report__button--primary"
              type="submit"
              disabled={state.accessBusy}
            >
              {state.accessBusy ? "Checking…" : "Enter site"}
            </button>
          </form>
        ) : (
          <form
            className="listwell-site-gate__form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitInterest();
            }}
          >
            <div className="vbg-field">
              <label className="vbg-label" htmlFor={emailId}>
                Email
              </label>
              <input
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
            </div>
            <div className="vbg-field">
              <label className="vbg-label" htmlFor={nameId}>
                Name{" "}
                <span className="listwell-site-gate__optional">(optional)</span>
              </label>
              <input
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
            </div>
            <div className="vbg-field">
              <label className="vbg-label" htmlFor={noteId}>
                Business or website{" "}
                <span className="listwell-site-gate__optional">(optional)</span>
              </label>
              <textarea
                id={noteId}
                name="note"
                rows={3}
                className="listwell-site-gate__textarea"
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
            </div>
            {state.interestError ? (
              <p className="listwell-site-gate__error" role="alert">
                {state.interestError}
              </p>
            ) : null}
            {state.interestMessage ? (
              <output className="listwell-site-gate__success">
                {state.interestMessage}
              </output>
            ) : null}
            <button
              className="listwell-report__button listwell-report__button--primary"
              type="submit"
              disabled={state.interestBusy}
            >
              {state.interestBusy ? "Sending…" : "Join the waitlist"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
};
