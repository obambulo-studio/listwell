export const timingSafeEqual = (left: string, right: string): boolean => {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  // eslint-disable-next-line no-bitwise
  let diff = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < maxLength; index += 1) {
    // eslint-disable-next-line no-bitwise
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return diff === 0;
};

export const requireInternalSecret = (secret: string): void => {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected || !timingSafeEqual(secret, expected)) {
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
