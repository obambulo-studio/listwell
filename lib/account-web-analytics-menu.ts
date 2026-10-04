import { z } from "zod";

const webAnalyticsMenuActionSchema = z.enum(["manage-analytics"]);

const webAnalyticsMenuInputSchema = z.object({
  owned: z.boolean(),
});

export const webAnalyticsMenuAction = (
  input: z.input<typeof webAnalyticsMenuInputSchema>
) => {
  const parsed = webAnalyticsMenuInputSchema.parse(input);
  if (!parsed.owned) {
    return null;
  }
  return webAnalyticsMenuActionSchema.parse("manage-analytics");
};
