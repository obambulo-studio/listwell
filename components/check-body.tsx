import Markdown from "react-markdown";

export function CheckBody({ markdown }: { markdown: string }) {
  return (
    <article className="vbg-reading">
      <Markdown>{markdown}</Markdown>
    </article>
  );
}
