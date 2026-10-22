import { createElement } from "react";

import { jsonLdScriptContent } from "@/lib/structured-data";

/** JSON-LD script tag. The content is serialised with "<" escaped. */
export const JsonLd = ({ data }: { data: unknown }) =>
  createElement("script", {
    dangerouslySetInnerHTML: { __html: jsonLdScriptContent(data) },
    type: "application/ld+json",
  });
