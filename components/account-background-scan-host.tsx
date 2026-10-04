"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  ListwellChatLayout,
  useListwellChat,
} from "@/components/listwell-chat";
import {
  clearAccountBackgroundScan,
  clearChatSession,
  readAccountBackgroundScan,
  LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT,
} from "@/lib/storage";

const BackgroundChatRunnerInner = ({
  businessName,
  onDone,
}: {
  businessName: string;
  onDone: (outcome: "complete" | "stalled" | "error") => void;
}) => {
  const layout = useListwellChat();
  const startedRef = useRef(false);
  const autoStepRef = useRef<string | null>(null);
  const finishedRef = useRef(false);
  const { handleListingSubmit, handleSend } = layout;

  const finish = (outcome: "complete" | "stalled" | "error") => {
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;
    onDone(outcome);
  };

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    void handleSend(businessName);
  }, [businessName, handleSend]);

  useEffect(() => {
    if (layout.reportStats && layout.businessId) {
      finish("complete");
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
      finish("stalled");
    }
  }, [
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
    finish("error");
  }, [layout.showTryAgain]);

  return (
    <div aria-hidden className="listwell-account-background-scan" inert>
      <ListwellChatLayout {...layout} />
    </div>
  );
};

const BackgroundChatRunner = ({
  businessName,
  onDone,
}: {
  businessName: string;
  onDone: (outcome: "complete" | "stalled" | "error") => void;
}) => {
  const [sessionReady, setSessionReady] = useState(false);

  useLayoutEffect(() => {
    clearChatSession();
    setSessionReady(true);
  }, []);

  if (!sessionReady) {
    return null;
  }

  return (
    <BackgroundChatRunnerInner businessName={businessName} onDone={onDone} />
  );
};

export const AccountBackgroundScanHost = () => {
  const { refresh } = useRouter();
  const [activeName, setActiveName] = useState<string | null>(() =>
    readAccountBackgroundScan()?.businessName ?? null
  );

  useEffect(() => {
    const sync = () => {
      setActiveName(readAccountBackgroundScan()?.businessName ?? null);
    };
    window.addEventListener(LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT, sync);
    return () => {
      window.removeEventListener(LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT, sync);
    };
  }, []);

  if (!activeName) {
    return null;
  }

  return (
    <BackgroundChatRunner
      businessName={activeName}
      onDone={(outcome) => {
        clearAccountBackgroundScan();
        setActiveName(null);
        if (outcome === "complete") {
          toast.success("Basic check finished. Your business is on the list.");
          refresh();
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
