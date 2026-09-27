"use client";

import { useId, useState } from "react";
import useSWR from "swr";

import { reportShareStateSchema } from "@/lib/schema";
import type { ReportShareState } from "@/lib/schema";

const fetchShareState = async (
  businessId: string
): Promise<ReportShareState> => {
  const response = await fetch(`/api/businesses/${businessId}/share`, {
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error("Could not load share link");
  }
  return reportShareStateSchema.parse(await response.json());
};

const createShare = async (
  businessId: string,
  expiresInDays: 7 | 30 | null
): Promise<ReportShareState> => {
  const response = await fetch(`/api/businesses/${businessId}/share`, {
    body: JSON.stringify({ expiresInDays }),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Could not create share link";
    throw new Error(message);
  }
  return reportShareStateSchema.parse(await response.json());
};

const revokeShare = async (businessId: string): Promise<ReportShareState> => {
  const response = await fetch(`/api/businesses/${businessId}/share`, {
    credentials: "same-origin",
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Could not revoke share link");
  }
  return reportShareStateSchema.parse(await response.json());
};

const formatExpiry = (iso: string | null): string => {
  if (!iso) {
    return "No expiry";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const expiryDaysFromChoice = (choice: "none" | "7" | "30"): 7 | 30 | null => {
  if (choice === "7") {
    return 7;
  }
  if (choice === "30") {
    return 30;
  }
  return null;
};

export const ReportShareDialog = ({
  businessId,
  onClose,
}: {
  businessId: string;
  onClose: () => void;
}) => {
  const titleId = useId();
  const {
    data: state,
    error: loadError,
    mutate,
  } = useSWR(["share", businessId] as const, ([, id]) => fetchShareState(id));
  const [expiryChoice, setExpiryChoice] = useState<"none" | "7" | "30">("none");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const error =
    actionError ?? (loadError instanceof Error ? loadError.message : null);

  const handleCreate = async () => {
    setBusy(true);
    setActionError(null);
    setCopied(false);
    try {
      const next = await createShare(
        businessId,
        expiryDaysFromChoice(expiryChoice)
      );
      await mutate(next, { revalidate: false });
    } catch (createError) {
      setActionError(
        createError instanceof Error
          ? createError.message
          : "Could not create share link"
      );
    }
    setBusy(false);
  };

  const handleRevoke = async () => {
    setBusy(true);
    setActionError(null);
    setCopied(false);
    try {
      const next = await revokeShare(businessId);
      await mutate(next, { revalidate: false });
    } catch (revokeError) {
      setActionError(
        revokeError instanceof Error
          ? revokeError.message
          : "Could not revoke share link"
      );
    }
    setBusy(false);
  };

  const handleCopy = async () => {
    if (!state?.url) {
      return;
    }
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
    } catch {
      setActionError("Could not copy link");
    }
  };

  return (
    <div className="listwell-share-dialog__backdrop" role="presentation">
      <dialog className="listwell-share-dialog" open aria-labelledby={titleId}>
        <header className="listwell-share-dialog__head">
          <h2 className="vbg-heading-20" id={titleId}>
            Share report
          </h2>
          <button
            className="listwell-report__button listwell-report__button--quiet"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <p className="vbg-caption">
          Anyone with the link can view a read-only copy. Fix steps and account
          details stay hidden.
        </p>
        {error ? <p className="listwell-share-dialog__error">{error}</p> : null}
        {state?.active && state.url ? (
          <div className="listwell-share-dialog__active">
            <label className="vbg-label" htmlFor={`${titleId}-url`}>
              Share link
            </label>
            <div className="listwell-share-dialog__url-row">
              <input
                className="listwell-share-dialog__url"
                id={`${titleId}-url`}
                readOnly
                type="url"
                value={state.url}
              />
              <button
                className="listwell-report__button"
                disabled={busy}
                type="button"
                onClick={() => {
                  void handleCopy();
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="vbg-meta">
              Expires {formatExpiry(state.expiresAt)} · Created{" "}
              {state.createdAt ? formatExpiry(state.createdAt) : "—"}
            </p>
            <button
              className="listwell-report__button listwell-report__button--quiet"
              disabled={busy}
              type="button"
              onClick={() => {
                void handleRevoke();
              }}
            >
              Revoke link
            </button>
          </div>
        ) : (
          <div className="listwell-share-dialog__create">
            <fieldset className="listwell-share-dialog__expiry">
              <legend className="vbg-label">Link expiry</legend>
              <label className="listwell-share-dialog__radio">
                <input
                  checked={expiryChoice === "none"}
                  name="share-expiry"
                  type="radio"
                  onChange={() => setExpiryChoice("none")}
                />
                No expiry
              </label>
              <label className="listwell-share-dialog__radio">
                <input
                  checked={expiryChoice === "7"}
                  name="share-expiry"
                  type="radio"
                  onChange={() => setExpiryChoice("7")}
                />
                7 days
              </label>
              <label className="listwell-share-dialog__radio">
                <input
                  checked={expiryChoice === "30"}
                  name="share-expiry"
                  type="radio"
                  onChange={() => setExpiryChoice("30")}
                />
                30 days
              </label>
            </fieldset>
            <button
              className="listwell-report__button"
              disabled={busy}
              type="button"
              onClick={() => {
                void handleCreate();
              }}
            >
              Create share link
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
};
