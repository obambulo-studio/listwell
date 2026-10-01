export const runInSeries = <T, R>(
  items: readonly T[],
  run: (item: T) => Promise<R>
): Promise<R[]> => {
  const walk = async (index: number, collected: R[]): Promise<R[]> => {
    if (index >= items.length) {
      return collected;
    }
    const item = items[index];
    if (item === undefined) {
      return collected;
    }
    const result = await run(item);
    return await walk(index + 1, [...collected, result]);
  };
  return walk(0, []);
};
