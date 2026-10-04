"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";

import {
  ListwellChatLayout,
  useListwellChat,
} from "@/components/listwell-chat";
import {
  clearAccountBackgroundScan,
  clearChatSession,
  noteAccountBackgroundScanBusiness,
  notifyAccountScanComplete,
  readAccountBackgroundScan,
  LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT,
} from "@/lib/storage";

const subscribeAccountScan = (onStoreChange: () => void): (() => void) => {
  window.addEventListener(
    LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT,
    onStoreChange
  );
  return () => {
    window.removeEventListener(
      LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT,
      onStoreChange
    );
  };
};

const activeScanBusinessName = (): string | null =>
  readAccountBackgroundScan()?.businessName ?? null;

const BackgroundChatRunner = ({
  businessName,
  onDone,
}: {
  businessName: string;
  onDone: (
    outcome: "complete" | "stalled" | "error",
    businessId: string | null
  ) => void;
}) => {
  useLayoutEffect(() => {
    clearChatSession();
  }, []);

  const layout = useListwellChat();
  const startedRef = useRef(false);
  const autoStepRef = useRef<string | null>(null);
  const finishedRef = useRef(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const finish = useCallback(
    (outcome: "complete" | "stalled" | "error", businessId: string | null) => {
      if (finishedRef.current) {
        return;
      }
      finishedRef.current = true;
      onDoneRef.current(outcome, businessId);
    },
    []
  );

  const { handleListingSubmit, handleSend } = layout;

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    void handleSend(businessName);
  }, [businessName, handleSend]);

  useEffect(() => {
    if (!layout.businessId) {
      return;
    }
    noteAccountBackgroundScanBusiness(layout.businessId);
  }, [layout.businessId]);

  useEffect(() => {
    if (layout.reportStats && layout.businessId) {
      finish("complete", layout.businessId);
      return;
    }

    if (layout.isTyping) {
      return;
    }

    const stepKey = `${layout.phase}:${layout.messages.length}`;
    if (autoStepRef.current === stepKey) {
      return;
    }

    if (layout.phase === "listing" && layout.candidates.length > 0) {
      autoStepRef.current = stepKey;
      handleListingSubmit({ 0: [0] });
      return;
    }

    if (layout.phase === "website") {
      autoStepRef.current = stepKey;
      void handleSend("skip");
      return;
    }

    if (layout.phase === "location") {
      finish("stalled", layout.businessId);
    }
  }, [
    finish,
    handleListingSubmit,
    handleSend,
    layout.businessId,
    layout.candidates.length,
    layout.isTyping,
    layout.messages.length,
    layout.phase,
    layout.reportStats,
  ]);

  useEffect(() => {
    if (!layout.showTryAgain) {
      return;
    }
    finish("error", layout.businessId);
  }, [finish, layout.businessId, layout.showTryAgain]);

  return (
    <div aria-hidden className="listwell-account-background-scan" inert>
      <ListwellChatLayout {...layout} />
    </div>
  );
};

export const AccountBackgroundScanHost = () => {
  const activeName = useSyncExternalStore(
    subscribeAccountScan,
    activeScanBusinessName,
    () => null
  );

  if (!activeName) {
    return null;
  }

  return (
    <BackgroundChatRunner
      key={activeName}
      businessName={activeName}
      onDone={(outcome, businessId) => {
        if (outcome === "complete" && businessId) {
          notifyAccountScanComplete(businessId);
        }
        clearAccountBackgroundScan();
        if (outcome === "complete") {
          toast.success("Basic check finished. Your business is on the list.");
          return;
        }
        if (outcome === "stalled") {
          toast.message(
            "We need suburb or city in chat to match this business. Open check your listings from the home page to continue."
          );
          return;
        }
        toast.error("We could not finish the check. Try again from chat.");
      }}
    />
  );
};
