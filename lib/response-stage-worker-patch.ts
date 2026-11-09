import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

export const RESPONSE_STAGE_PATCH_MARKER =
  "listwell-stage-unavailable-fallback";

export const RESPONSE_STAGE_FALLBACK_MODULE =
  "virtual:listwell-response-stage-fallback";

const RESOLVED_FALLBACK_MODULE = `\0${RESPONSE_STAGE_FALLBACK_MODULE}`;

const BINDING_SNIPPET = `const binding = getResponseStageBinding(stageContext, usesSharedCache ? CACHED_RESPONSE_STAGE_EXPORT : UNCACHED_RESPONSE_STAGE_EXPORT, serializedInvocation);
			if (!binding) return responseStageUnavailable();
			const entrypointRequest = usesSharedCache ? await createCacheFacingRequest(stageRequest, serializedInvocation) : stageRequest;
			const response = validateResponseStageBuildIdentity(await binding.fetch(entrypointRequest));
			if (!usesSharedCache) return response;`;

const PATCHED_SNIPPET = `const binding = getResponseStageBinding(stageContext, usesSharedCache ? CACHED_RESPONSE_STAGE_EXPORT : UNCACHED_RESPONSE_STAGE_EXPORT, serializedInvocation);
			/* ${RESPONSE_STAGE_PATCH_MARKER} */
			const renderStageInProcess = async () => stampResponseStageBuildIdentity(await invokeResponseStage(stageRequest, env, stageContext, invocation));
			if (!binding) return resolveStageLoopback({ kind: "missing" }, renderStageInProcess, isResponseStageReadinessRequest(stageRequest));
			const entrypointRequest = usesSharedCache ? await createCacheFacingRequest(stageRequest, serializedInvocation) : stageRequest;
			const stageResponse = validateResponseStageBuildIdentity(await binding.fetch(entrypointRequest));
			const response = await resolveStageLoopback({ kind: "response", response: stageResponse }, renderStageInProcess, isResponseStageReadinessRequest(stageRequest));
			if (!usesSharedCache) return response;`;

export const patchCdnAdapterWorkerSource = (source: string): string => {
  if (source.includes(RESPONSE_STAGE_PATCH_MARKER)) {
    return source;
  }
  if (!source.includes(BINDING_SNIPPET)) {
    throw new Error(
      "The vinext CDN adapter worker no longer contains the response-stage loopback. The homepage 503 fallback was not applied."
    );
  }
  const imported = `import { resolveStageLoopback } from ${JSON.stringify(RESPONSE_STAGE_FALLBACK_MODULE)};\n`;
  return `${imported}${source.replace(BINDING_SNIPPET, PATCHED_SNIPPET)}`;
};

const isCdnAdapterWorker = (id: string): boolean => {
  const path = id.split("?")[0] ?? id;
  return path.endsWith("/cdn-adapter.worker.js");
};

/** Patch the vinext Cloudflare worker entry during the Workers build. */
export const responseStageFallbackPlugin = (): Plugin => ({
  enforce: "pre",
  load(id) {
    if (id !== RESOLVED_FALLBACK_MODULE) {
      return null;
    }
    const modulePath = fileURLToPath(
      new URL("response-stage-fallback.ts", import.meta.url)
    );
    return `export { resolveStageLoopback } from ${JSON.stringify(modulePath)};\n`;
  },
  name: "listwell-response-stage-fallback",
  resolveId(id) {
    if (id === RESPONSE_STAGE_FALLBACK_MODULE) {
      return RESOLVED_FALLBACK_MODULE;
    }
    return null;
  },
  transform(code, id) {
    if (!isCdnAdapterWorker(id)) {
      return null;
    }
    return { code: patchCdnAdapterWorkerSource(code), map: null };
  },
});
