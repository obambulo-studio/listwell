import * as openNextWorker from "./.open-next/worker.js";

export default {
  fetch: openNextWorker.default.fetch,
} satisfies ExportedHandler<CloudflareEnv>;
