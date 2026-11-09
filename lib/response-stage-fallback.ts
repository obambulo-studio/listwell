// The vinext CDN adapter returns an empty HTTP 503 when the response-stage
// loopback is missing or belongs to another Worker build. Workers records
// that response as HttpServerError and does not attach an exception stack.
// Render the request in the Worker version that received it.
// A 503 with a body stays unchanged. Fail-closed rate limits use a JSON body.

export const STAGE_FALLBACK_WARNING =
  "[listwell] The response-stage loopback was unavailable. This Worker version renders the request.";

const STAGE_BUILD_HEADER = "x-vinext-build-id";

export const emptyStageUnavailable = (): Response =>
  new Response(null, {
    headers: { "Cache-Control": "no-store" },
    status: 503,
  });

/** True for the vinext stage mismatch response, false for an application 503. */
export const isEmptyStageUnavailable = (response: Response): boolean =>
  response.status === 503 &&
  response.body === null &&
  response.headers.get(STAGE_BUILD_HEADER) === null;

export const warnStageFallback = (): void => {
  console.warn(STAGE_FALLBACK_WARNING);
};

export const recoverEmptyStageUnavailable = async (
  response: Response,
  renderInProcess: () => Promise<Response>
): Promise<Response> => {
  if (!isEmptyStageUnavailable(response)) {
    return response;
  }
  warnStageFallback();
  return await renderInProcess();
};

type StageLoopback =
  | { kind: "missing" }
  | { kind: "response"; response: Response };

/**
 * Choose the client response for one response-stage dispatch.
 * Readiness probes keep the empty 503. Every other miss renders here.
 */
export const resolveStageLoopback = async (
  loopback: StageLoopback,
  renderInProcess: () => Promise<Response>,
  isReadiness: boolean
): Promise<Response> => {
  if (loopback.kind === "missing") {
    if (isReadiness) {
      return emptyStageUnavailable();
    }
    warnStageFallback();
    return await renderInProcess();
  }
  if (isReadiness) {
    return loopback.response;
  }
  return await recoverEmptyStageUnavailable(loopback.response, renderInProcess);
};
