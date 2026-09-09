import Markdown from "react-markdown";

export const CheckBody = ({ markdown }: { markdown: string }) => (
  <article className="vbg-reading">
    <Markdown>{markdown}</Markdown>
  </article>
);
