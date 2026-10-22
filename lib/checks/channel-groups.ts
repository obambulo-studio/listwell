// Channel grouping helpers with no check catalog import, safe for client bundles.

export const CHANNEL_GROUP_ORDER = [
  "Website",
  "Google Business Profile",
  "Apple Business Profile",
  "Social Media",
  "Food Delivery",
] as const;

export const channelSectionTitle = (category: string): string => {
  if (category === "Google Business Profile") {
    return "Google Business";
  }
  if (category === "Apple Business Profile") {
    return "Apple Business";
  }
  return category;
};

const channelCategoryOrder = (category: string): number => {
  for (const [index, group] of CHANNEL_GROUP_ORDER.entries()) {
    if (group === category) {
      return index;
    }
  }
  return CHANNEL_GROUP_ORDER.length;
};

export const groupByChannelCategory = <T>(
  items: readonly T[],
  getCategory: (item: T) => string
): { category: string; items: T[] }[] => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const category = getCategory(item);
    const existing = groups.get(category);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(category, [item]);
    }
  }

  return [...groups.entries()]
    .toSorted((left, right) => {
      const leftOrder = channelCategoryOrder(left[0]);
      const rightOrder = channelCategoryOrder(right[0]);
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left[0].localeCompare(right[0]);
    })
    .map(([category, grouped]) => ({ category, items: grouped }));
};
