import Markdown from "react-markdown";

import { fixInstructionsFromBody } from "@/lib/markdown";

export const CheckBody = ({ markdown }: { markdown: string }) => (
  <article className="listwell-check-body">
    <Markdown>{markdown}</Markdown>
  </article>
);

export const FixGuide = ({ body }: { body: string }) => {
  const instructions = fixInstructionsFromBody(body);
  if (!instructions) {
    return (
      <p className="listwell-panel__note">
        Fix steps are not written for this check yet.
      </p>
    );
  }

  return (
    <div className="listwell-fix">
      <p className="listwell-fix__label">How to fix</p>
      {instructions.intro ? <CheckBody markdown={instructions.intro} /> : null}
      {instructions.steps.length > 0 ? (
        <ol className="listwell-fix__steps">
          {instructions.steps.map((step, index) => (
            <li key={step.title} className="listwell-fix__step">
              <span className="listwell-step" aria-hidden>
                {index + 1}
              </span>
              <div className="listwell-fix__copy">
                <p className="listwell-panel__row-title">{step.title}</p>
                {step.body.length > 0 ? (
                  <CheckBody markdown={step.body} />
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
};
