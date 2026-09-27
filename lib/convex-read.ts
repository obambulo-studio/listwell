export type ConvexReadResult<T> =
  | { status: "ok"; value: T }
  | { status: "unavailable" };

export const runConvexRead = async <T>(
  run: () => Promise<T>
): Promise<ConvexReadResult<T>> => {
  try {
    return { status: "ok", value: await run() };
  } catch {
    return { status: "unavailable" };
  }
};
