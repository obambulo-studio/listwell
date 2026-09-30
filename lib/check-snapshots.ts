import { api, convexMutation, convexQuery } from "./convex/server";
import { scanFingerprint, selectReusableSnapshot } from "./scan-freshness";
import { checkBatchResponseSchema } from "./schema";
import type { CheckBatchResponse } from "./schema";

const POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 500;

interface StoredSnapshot {
  finishedAt: string | null;
  payloadJson: string | null;
  snapshotId: string;
  startedAt: string;
  status: "running" | "complete" | "error";
}

export type SharedCheckRun =
  | { outcome: "skip" }
  | { outcome: "reuse"; payload: CheckBatchResponse }
  | { outcome: "owned"; snapshotId: string };

const parsePayload = (
  payloadJson: string | null
): CheckBatchResponse | null => {
  if (!payloadJson) {
    return null;
  }
  try {
    return checkBatchResponseSchema.parse(JSON.parse(payloadJson));
  } catch {
    return null;
  }
};

const delay = (ms: number): Promise<void> =>
  // eslint-disable-next-line promise/avoid-new -- setTimeout has no promise form
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const readSnapshot = async (
  snapshotId: string
): Promise<StoredSnapshot | null> => {
  const row = await convexQuery(api["check-snapshots"].get, { snapshotId });
  return row;
};

const pollSnapshot = async (
  snapshotId: string,
  attempt = 0
): Promise<StoredSnapshot | null> => {
  const row = await readSnapshot(snapshotId);
  if (!row || row.status !== "running" || attempt >= POLL_ATTEMPTS - 1) {
    return row;
  }
  await delay(POLL_INTERVAL_MS);
  return pollSnapshot(snapshotId, attempt + 1);
};

const claimShared = async (
  fingerprint: string,
  forceFresh: boolean,
  errorRetries: number
): Promise<SharedCheckRun> => {
  const claim = await convexMutation(api["check-snapshots"].claim, {
    fingerprint,
    forceFresh,
  });
  if (claim.action === "run") {
    return { outcome: "owned", snapshotId: claim.snapshot.snapshotId };
  }

  const settled = await pollSnapshot(claim.snapshot.snapshotId);
  const payload = parsePayload(settled?.payloadJson ?? null);
  if (
    payload &&
    (settled?.status === "complete" || settled?.status === "running")
  ) {
    return { outcome: "reuse", payload };
  }
  if (settled?.status === "running") {
    return {
      outcome: "reuse",
      payload: checkBatchResponseSchema.parse({ pending: [], results: {} }),
    };
  }
  if (errorRetries >= 1) {
    return { outcome: "skip" };
  }
  return claimShared(fingerprint, false, errorRetries + 1);
};

export const beginSharedCheckRun = async (
  business: {
    locations: readonly { googlePlaceId?: string | null }[];
    websiteUrl?: string | null;
  },
  forceFresh: boolean
): Promise<SharedCheckRun> => {
  const fingerprint = scanFingerprint(business);
  if (!fingerprint) {
    return { outcome: "skip" };
  }
  try {
    return await claimShared(fingerprint, forceFresh, 0);
  } catch (error) {
    console.error("check snapshot claim failed", error);
    return { outcome: "skip" };
  }
};

export const failSharedCheckRun = async (snapshotId: string): Promise<void> => {
  try {
    await convexMutation(api["check-snapshots"].finish, {
      snapshotId,
      status: "error",
    });
  } catch (error) {
    console.error("check snapshot error update failed", error);
  }
};

export const finishSharedCheckRun = async (
  snapshotId: string,
  payload: CheckBatchResponse
): Promise<void> => {
  try {
    await convexMutation(api["check-snapshots"].finish, {
      payloadJson: JSON.stringify(payload),
      snapshotId,
      status: "complete",
    });
  } catch (error) {
    console.error("check snapshot finish failed", error);
    await failSharedCheckRun(snapshotId);
  }
};

export const publishSharedCheckRun = async (
  business: {
    locations: readonly { googlePlaceId?: string | null }[];
    websiteUrl?: string | null;
  },
  results: CheckBatchResponse["results"]
): Promise<void> => {
  const fingerprint = scanFingerprint(business);
  if (!fingerprint) {
    return;
  }
  try {
    const payload = checkBatchResponseSchema.parse({ pending: [], results });
    await convexMutation(api["check-snapshots"].publish, {
      fingerprint,
      payloadJson: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("check snapshot publish failed", error);
  }
};

export const readReusableCheckPayload = async (business: {
  locations: readonly { googlePlaceId?: string | null }[];
  websiteUrl?: string | null;
}): Promise<CheckBatchResponse | null> => {
  const fingerprint = scanFingerprint(business);
  if (!fingerprint) {
    return null;
  }
  try {
    const rows = await convexQuery(api["check-snapshots"].latest, {
      fingerprint,
    });
    const selected = selectReusableSnapshot({
      forceFresh: false,
      now: Date.now(),
      rows,
    });
    if (!selected) {
      return null;
    }
    return (
      parsePayload(selected.payloadJson) ??
      checkBatchResponseSchema.parse({ pending: [], results: {} })
    );
  } catch (error) {
    console.error("check snapshot read failed", error);
    return null;
  }
};
