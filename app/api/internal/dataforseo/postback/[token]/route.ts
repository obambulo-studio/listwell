import { z } from "zod";

import { postDataForSeoPostback } from "../receive";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  token: z.string().min(1),
});

/** New tasks put the credential in the path. Query tokens remain on the parent route. */
export const POST = async (
  request: Request,
  context: { params: Promise<{ token: string }> }
) => {
  const { token } = paramsSchema.parse(await context.params);
  return postDataForSeoPostback(request, token);
};
