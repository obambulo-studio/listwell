import { postDataForSeoPostback } from "./receive";

export const dynamic = "force-dynamic";

/** DataForSEO posts gzip-compressed results here. The per-task token is the only credential. */
export const POST = (request: Request) => postDataForSeoPostback(request, null);
