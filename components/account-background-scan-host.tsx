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
import { accountBackgroundScanDrive } from "@/lib/account-background-scan";
import { LISTWELL_CHAT_PATH } from "@/lib/listwell-routes";
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
    outcome: "complete" | "handoff" | "error",
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
    (outcome: "complete" | "handoff" | "error", businessId: string | null) => {
      if (finishedRef.current) {
        return;
      }
      finishedRef.current = true;
      onDoneRef.current(outcome, businessId);
    },
    []
  );

  const { handleSend } = layout;

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
    const action = accountBackgroundScanDrive({
      businessId: layout.businessId,
      candidateCount: layout.candidates.length,
      isTyping: layout.isTyping,
      phase: layout.phase,
      reportReady: layout.reportStats !== null,
      showTryAgain: layout.showTryAgain,
    });

    if (action === "wait") {
      return;
    }

    if (action === "skip-website") {
      const stepKey = `${layout.phase}:${layout.messages.length}`;
      if (autoStepRef.current === stepKey) {
        return;
      }
      autoStepRef.current = stepKey;
      void handleSend("skip");
      return;
    }

    if (action === "complete") {
      finish("complete", layout.businessId);
      return;
    }

    if (action === "handoff-chat") {
      finish("handoff", layout.businessId);
      return;
    }

    finish("error", layout.businessId);
  }, [
    finish,
    handleSend,
    layout.businessId,
    layout.candidates.length,
    layout.isTyping,
    layout.messages.length,
    layout.phase,
    layout.reportStats,
    layout.showTryAgain,
  ]);

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
        if (outcome === "handoff") {
          // Leave the saved chat session in place. A full load drops this
          // hidden runner so it cannot stall or pick a listing on the way out.
          window.location.assign(LISTWELL_CHAT_PATH);
          return;
        }
        toast.error("We could not finish the check. Try again from chat.");
      }}
    />
  );
};
