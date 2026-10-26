import { NextResponse } from "next/server";

import {
  dataForSeoPostbackToken,
  receiveDataForSeoPostback,
} from "@/lib/dataforseo";
import { finishQueuedResearchTask } from "@/lib/research-runner";

export const postDataForSeoPostback = async (
  request: Request,
  pathToken: string | null
) => {
  const url = new URL(request.url);
  const outcome = await receiveDataForSeoPostback({
    body: await request.arrayBuffer(),
    taskId: url.searchParams.get("id"),
    token: dataForSeoPostbackToken({
      pathToken,
      queryToken: url.searchParams.get("token"),
    }),
  });
  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.error },
      { status: outcome.status }
    );
  }
  try {
    await finishQueuedResearchTask(outcome.record);
  } catch (error) {
    console.error("Could not finish the queued research task", error);
    return NextResponse.json(
      { error: "Could not store the research result" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
};
