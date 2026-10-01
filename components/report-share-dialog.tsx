"use client";

import { useId, useState } from "react";
import useSWR from "swr";

import {
  FormActions,
  PrimaryButton,
  QuietButton,
} from "@/components/listwell/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiErrorSchema, reportShareStateSchema } from "@/lib/schema";
import type { ReportShareState } from "@/lib/schema";

const shareApiErrorMessage = (payload: unknown, fallback: string): string => {
  const parsed = apiErrorSchema.safeParse(payload);
  return parsed.success ? parsed.data.error : fallback;
};

const fetchShareState = async (
  businessId: string
): Promise<ReportShareState> => {
  const response = await fetch(`/api/businesses/${businessId}/share`, {
    credentials: "same-origin",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(shareApiErrorMessage(payload, "Could not load share link"));
  }
  return reportShareStateSchema.parse(payload);
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
  return date.toLocaleDateString("en-AU", {
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

const shareQueryKey = (
  open: boolean,
  businessId: string
): readonly ["share", string] | null => {
  if (!open) {
    return null;
  }
  return ["share", businessId];
};

export const ReportShareDialog = ({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) => {
  const urlFieldId = useId();
  const {
    data: state,
    error: loadError,
    mutate,
  } = useSWR(shareQueryKey(open, businessId), ([, id]) => fetchShareState(id));
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share report</DialogTitle>
          <DialogDescription>
            Anyone with the link can view a read-only copy. Fix steps and
            account details stay hidden.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="listwell-notice listwell-notice--error" role="alert">
            {error}
          </p>
        ) : null}
        {state?.active && state.url ? (
          <div className="flex flex-col gap-3">
            <Field>
              <FieldLabel htmlFor={urlFieldId}>Share link</FieldLabel>
              <div className="listwell-chat__composer">
                <Input
                  id={urlFieldId}
                  readOnly
                  type="url"
                  value={state.url}
                  className="listwell-chat__input border-0 shadow-none focus-visible:ring-0"
                  onFocus={(event) => event.target.select()}
                />
                <PrimaryButton
                  disabled={busy}
                  size="sm"
                  type="button"
                  onClick={() => {
                    void handleCopy();
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </PrimaryButton>
              </div>
            </Field>
            <p className="listwell-panel__fine">
              Expires {formatExpiry(state.expiresAt)} · Created{" "}
              {state.createdAt ? formatExpiry(state.createdAt) : "—"}
            </p>
          </div>
        ) : (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="listwell-panel__note mb-2">Link expiry</legend>
            <div className="listwell-panel__options">
              {(
                [
                  ["none", "No expiry"],
                  ["7", "7 days"],
                  ["30", "30 days"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="listwell-chat__prompt-card-option cursor-pointer"
                >
                  <input
                    className="vbg-visually-hidden"
                    checked={expiryChoice === value}
                    name="share-expiry"
                    type="radio"
                    onChange={() => setExpiryChoice(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <FormActions className="justify-end pt-0">
          {state?.active && state.url ? (
            <QuietButton
              disabled={busy}
              type="button"
              className="text-red mr-auto"
              onClick={() => {
                void handleRevoke();
              }}
            >
              Revoke link
            </QuietButton>
          ) : null}
          <QuietButton type="button" onClick={onClose}>
            Close
          </QuietButton>
          {state?.active && state.url ? null : (
            <PrimaryButton
              disabled={busy}
              type="button"
              onClick={() => {
                void handleCreate();
              }}
            >
              Create share link
            </PrimaryButton>
          )}
        </FormActions>
      </DialogContent>
    </Dialog>
  );
};
