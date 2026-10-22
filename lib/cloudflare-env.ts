/** Worker bindings, or null outside a Worker (tests, the browser). */
export const getCloudflareEnv = async (): Promise<CloudflareEnv | null> => {
  try {
    const { env } = await import("cloudflare:workers");
    return env;
  } catch {
    return null;
  }
};
