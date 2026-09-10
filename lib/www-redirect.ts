import { z } from "zod";

const requestUrlSchema = z.url();

const LISTWELL_WWW_HOST = "www.listwell.dev";
const LISTWELL_APEX_HOST = "listwell.dev";

export const wwwToApexHref = (href: string): string | null => {
  const parsedHref = requestUrlSchema.parse(href);
  const url = new URL(parsedHref);

  if (url.hostname !== LISTWELL_WWW_HOST) {
    return null;
  }

  url.hostname = LISTWELL_APEX_HOST;
  url.protocol = "https:";
  return url.href;
};
