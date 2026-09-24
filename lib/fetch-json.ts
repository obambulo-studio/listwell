import type { z } from "zod";

export const fetchJsonWithSchema = async <T>(
  schema: z.ZodType<T>,
  url: string,
  init?: RequestInit
): Promise<T> => {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Response was not valid JSON");
  }
  return schema.parse(body);
};

export const fanOutSettled = async <A, B>(
  items: A[],
  run: (item: A) => Promise<B>
): Promise<B[]> => {
  const settled = await Promise.allSettled(items.map(run));
  return settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );
};
