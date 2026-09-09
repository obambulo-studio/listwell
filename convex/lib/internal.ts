export const requireInternalSecret = (secret: string): void => {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("Unauthorized");
  }
};

export const siteUrl = (): string => {
  const url = process.env.SITE_URL;
  if (!url) {
    throw new Error("SITE_URL is not configured");
  }
  return url.replace(/\/$/u, "");
};
