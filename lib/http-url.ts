/**
 * Client-safe copy of the audit engine's `isHttpUrl`. Importing it from
 * `@listwell/audit-engine` pulls the whole engine into the browser bundle.
 */
export const isHttpUrl = (
  value: string | null | undefined
): value is string => {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};
