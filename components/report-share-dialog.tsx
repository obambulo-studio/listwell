"use client";

import { useId, useState } from "react";
import useSWR from "swr";

import {
  FormActions,
  PrimaryButton,
  QuietButton,
} from "@/components/listwell/actions";
import { Alert, AlertDescription } from "@/components/reui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { reportShareStateSchema } from "@/lib/schema";
import type { ReportShareState } from "@/lib/schema";
import { cn } from "@/lib/utils";

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
  const urlFieldId = useId();
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
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
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {state?.active && state.url ? (
          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor={urlFieldId}>Share link</FieldLabel>
              <div className="flex flex-wrap gap-2">
                <Input
                  id={urlFieldId}
                  readOnly
                  type="url"
                  value={state.url}
                  className={cn("min-w-0 flex-1 font-mono text-xs")}
                />
                <PrimaryButton
                  disabled={busy}
                  type="button"
                  onClick={() => {
                    void handleCopy();
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </PrimaryButton>
              </div>
            </Field>
            <p className="text-muted-foreground text-xs">
              Expires {formatExpiry(state.expiresAt)} · Created{" "}
              {state.createdAt ? formatExpiry(state.createdAt) : "—"}
            </p>
            <QuietButton
              disabled={busy}
              type="button"
              onClick={() => {
                void handleRevoke();
              }}
            >
              Revoke link
            </QuietButton>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <FieldSet>
              <FieldLegend variant="label">Link expiry</FieldLegend>
              <FieldGroup className="gap-2">
                {(
                  [
                    ["none", "No expiry"],
                    ["7", "7 days"],
                    ["30", "30 days"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      checked={expiryChoice === value}
                      name="share-expiry"
                      type="radio"
                      onChange={() => setExpiryChoice(value)}
                    />
                    {label}
                  </label>
                ))}
              </FieldGroup>
            </FieldSet>
            <PrimaryButton
              disabled={busy}
              type="button"
              onClick={() => {
                void handleCreate();
              }}
            >
              Create share link
            </PrimaryButton>
          </div>
        )}
        <FormActions className="justify-end pt-0">
          <QuietButton type="button" onClick={onClose}>
            Close
          </QuietButton>
        </FormActions>
      </DialogContent>
    </Dialog>
  );
};
