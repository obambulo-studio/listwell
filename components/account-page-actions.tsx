"use client";

import { Add01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import type { FormEvent } from "react";

import { ButtonLink } from "@/components/atoms/button";
import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT,
  readAccountBackgroundScan,
  startAccountBackgroundScan,
} from "@/lib/storage";

const accountButtonClass = "h-11 px-4";

export const AccountPageActions = () => {
  const formId = useId();
  const { refresh } = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(
    () => readAccountBackgroundScan() !== null
  );
  const [scanLabel, setScanLabel] = useState(
    () => readAccountBackgroundScan()?.businessName ?? ""
  );

  const syncScanState = useCallback(() => {
    const active = readAccountBackgroundScan();
    setScanning(active !== null);
    setScanLabel(active?.businessName ?? "");
    if (!active) {
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    window.addEventListener(
      LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT,
      syncScanState
    );
    return () => {
      window.removeEventListener(
        LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT,
        syncScanState
      );
    };
  }, [syncScanState]);

  const submitBusiness = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = businessName.trim();
    if (!trimmed) {
      setSubmitError("Enter a business name.");
      return;
    }
    setSubmitError(null);
    startAccountBackgroundScan(trimmed);
    setScanning(true);
    setScanLabel(trimmed);
    setDialogOpen(false);
    setBusinessName("");
  };

  return (
    <>
      {scanning ? (
        <div
          className="listwell-account-scan-status"
          role="status"
          aria-live="polite"
        >
          <span
            className="listwell-account-scan-status__spinner"
            aria-hidden
          />
          <span>
            {scanLabel
              ? `Running a basic check for ${scanLabel}.`
              : "Starting a basic check."}
          </span>
        </div>
      ) : null}
      <div className="listwell-page__actions">
        <button
          type="button"
          className={cn(
            buttonVariants({ size: "lg", variant: "default" }),
            accountButtonClass
          )}
          onClick={() => {
            setSubmitError(null);
            setDialogOpen(true);
          }}
        >
          <Icon icon={Add01Icon} size={16} />
          Add a business
        </button>
        <ButtonLink
          className={accountButtonClass}
          href="/account/profile"
          variant="secondary"
        >
          <Icon icon={UserIcon} size={16} />
          Profile
        </ButtonLink>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSubmitError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a business</DialogTitle>
            <DialogDescription>
              We will match listings and run the same free basic check as chat.
              You can stay on this page while it runs.
            </DialogDescription>
          </DialogHeader>
          <form id={formId} onSubmit={submitBusiness}>
            <Input
              autoComplete="organization"
              name="businessName"
              placeholder="e.g. Willow Whip Gelato"
              value={businessName}
              onChange={(event) => {
                setBusinessName(event.target.value);
                setSubmitError(null);
              }}
            />
            {submitError ? (
              <p className="listwell-panel__error mt-3">{submitError}</p>
            ) : null}
          </form>
          <DialogFooter>
            <button
              type="button"
              className={buttonVariants({ variant: "secondary" })}
              onClick={() => {
                setDialogOpen(false);
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form={formId}
              className={buttonVariants({ variant: "default" })}
            >
              Start check
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
