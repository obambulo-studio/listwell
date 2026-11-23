import type { ChatPhase } from "@/lib/chat-onboarding";

export type AccountBackgroundScanAction =
  | "wait"
  | "complete"
  | "skip-website"
  | "handoff-chat"
  | "error";

export interface AccountBackgroundScanInput {
  businessId: string | null;
  candidateCount: number;
  isTyping: boolean;
  phase: ChatPhase;
  reportReady: boolean;
  showTryAgain: boolean;
}

/**
 * Hidden account scan. A listing choice, suburb question, or category
 * continues on `/chat`, where that step is visible. Clearing the scan here
 * used to drop the account row before a business was saved.
 */
export const accountBackgroundScanDrive = (
  input: AccountBackgroundScanInput
): AccountBackgroundScanAction => {
  if (input.reportReady && input.businessId) {
    return "complete";
  }
  if (input.showTryAgain) {
    return "error";
  }
  if (input.isTyping) {
    return "wait";
  }
  if (input.phase === "listing" && input.candidateCount > 0) {
    return "handoff-chat";
  }
  if (input.phase === "location" || input.phase === "category") {
    return "handoff-chat";
  }
  if (input.phase === "website") {
    return "skip-website";
  }
  return "wait";
};
