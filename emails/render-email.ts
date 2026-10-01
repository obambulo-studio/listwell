import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";

/** Edge renderer so Convex and the Cloudflare worker can build email HTML. */
export const renderEmailHtml = (element: ReactElement): string =>
  `<!DOCTYPE html>${renderToStaticMarkup(element)}`;
