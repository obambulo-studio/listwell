import type { CategoryId } from "../category";
import { CHECK_CATALOG } from "./catalog";
import { appliesToCategory } from "./types";
import type { CheckDefinition } from "./types";

export {
  CHANNEL_GROUP_ORDER,
  channelSectionTitle,
  groupByChannelCategory,
} from "./channel-groups";

export const checksForCategory = (category: CategoryId): CheckDefinition[] =>
  CHECK_CATALOG.filter((definition) => appliesToCategory(definition, category));

export const getCheckDefinition = (id: string): CheckDefinition | null =>
  CHECK_CATALOG.find((definition) => definition.id === id) ?? null;
