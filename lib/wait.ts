export const waitForMs = async (ms: number): Promise<void> => {
  try {
    await fetch("data:text/plain,", { signal: AbortSignal.timeout(ms) });
  } catch {
    // delay elapsed or aborted
  }
};
