"use client";

import { useEffect, useLayoutEffect, useReducer, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";

import { Button } from "@/components/atoms/button";
import GlideMenu from "@/components/primitives/glide-menu";

/* ─────────────────────────────────────────────────────────
 * APPROVAL CARD (human-in-the-loop)
 * One question at a time. The stack slides vertically as you
 * move between questions (the card's height animates to fit),
 * the step counter rolls like an odometer, and the footer uses
 * pill actions — a quiet Skip and a dark Continue with a ⏎.
 * Single-choice answers auto-advance; multi-select waits.
 * ───────────────────────────────────────────────────────── */

export interface ApprovalQuestion {
  q: string;
  type: "radio" | "check";
  options: string[];
}

const QUESTIONS: ApprovalQuestion[] = [
  {
    options: ["Three (core line)", "Five (full case)", "Just one hero"],
    q: "How many flavors should we launch?",
    type: "radio",
  },
  {
    options: ["Chocolate chips", "Waffle bits", "Sprinkles"],
    q: "Which mix-ins should we stock?",
    type: "check",
  },
  {
    options: ["Food trucks", "Grocery freezers", "Scoop shops"],
    q: "Which market do we enter first?",
    type: "radio",
  },
];

export interface ApprovalLabels {
  skip: string;
  continue: string;
  send: string;
  customPlaceholder: string;
  sentMessage: string;
}

const DEFAULT_LABELS: ApprovalLabels = {
  continue: "Continue",
  customPlaceholder: "Something else…",
  send: "Send",
  sentMessage: "Answers sent",
  skip: "Skip",
};

const ROLL_MS = 400;
const SLIDE = "360ms cubic-bezier(0.22, 1, 0.36, 1)";

interface RollFrame {
  dir: "up" | "down";
  from: string;
  rolling: boolean;
  to: string;
}

const idleRoll = (): RollFrame => ({
  dir: "up",
  from: "",
  rolling: false,
  to: "",
});

/* odometer digits — each character that changes rolls up (or down) */
const RollingDigits = ({ value }: { value: string }) => {
  const prevRef = useRef(value);
  const [frame, dispatchFrame] = useReducer(
    (_current: RollFrame, next: RollFrame) => next,
    idleRoll()
  );

  useEffect(() => {
    if (prevRef.current === value) {
      return;
    }
    const from = prevRef.current;
    prevRef.current = value;
    const fromN = Math.trunc(Number(from));
    const toN = Math.trunc(Number(value));
    const dir =
      Number.isFinite(fromN) && Number.isFinite(toN) && toN < fromN
        ? "down"
        : "up";
    dispatchFrame({ dir, from, rolling: true, to: value });
    const done = window.setTimeout(() => {
      dispatchFrame({ dir, from: value, rolling: false, to: value });
    }, ROLL_MS);
    return () => {
      window.clearTimeout(done);
    };
  }, [value]);

  const chars = frame.rolling ? frame.to : frame.from || value;
  const oldVal = frame.from || value;
  const slots: { bottom: string; id: string; rolling: boolean; top: string }[] =
    [];
  let cursor = 0;
  for (const nextChar of chars) {
    const oldChar = oldVal[cursor] ?? "";
    const rollingChar = frame.rolling && oldChar !== nextChar;
    const top = frame.dir === "down" ? nextChar : oldChar;
    const bottom = frame.dir === "down" ? oldChar : nextChar;
    slots.push({
      bottom,
      id: `${value}:${cursor}:${oldChar}:${nextChar}:${frame.dir}`,
      rolling: rollingChar,
      top,
    });
    cursor += 1;
  }

  return (
    <>
      {slots.map((slot) => {
        if (!slot.rolling) {
          return <span key={slot.id}>{slot.top || slot.bottom}</span>;
        }
        const restY = frame.dir === "down" ? "0" : "-1em";
        return (
          <span
            key={slot.id}
            style={{
              display: "inline-block",
              height: "1em",
              lineHeight: "1em",
              overflow: "hidden",
              position: "relative",
              verticalAlign: "-0.05em",
            }}
          >
            <span
              style={{
                animation: `listwell-roll-${frame.dir} 350ms cubic-bezier(0.4, 0, 0.2, 1) forwards`,
                display: "flex",
                flexDirection: "column",
                transform: `translateY(${restY === "0" ? "-1em" : "0"})`,
              }}
            >
              <span style={{ height: "1em", lineHeight: "1em" }}>
                {slot.top}
              </span>
              <span style={{ height: "1em", lineHeight: "1em" }}>
                {slot.bottom}
              </span>
            </span>
          </span>
        );
      })}
    </>
  );
};

const Ico = ({
  path,
  size = 14,
  sw = 2,
}: {
  path: ReactNode;
  size?: number;
  sw?: number;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {path}
  </svg>
);

interface CardState {
  animate: boolean;
  answers: Record<number, number[]>;
  custom: Record<number, string>;
  open: boolean;
  qi: number;
  ready: boolean;
  sent: boolean;
  trackY: number;
  viewportH: number | undefined;
}

type CardAction =
  | { type: "answers"; answers: Record<number, number[]> }
  | { type: "custom"; custom: Record<number, string> }
  | { type: "measure"; animate: boolean; trackY: number; viewportH: number }
  | { type: "open"; open: boolean }
  | { type: "qi"; qi: number }
  | { type: "reset" }
  | { type: "sent" };

const initialCardState: CardState = {
  animate: false,
  answers: {},
  custom: {},
  open: true,
  qi: 0,
  ready: false,
  sent: false,
  trackY: 0,
  viewportH: undefined,
};

const cardReducer = (state: CardState, action: CardAction): CardState => {
  switch (action.type) {
    case "answers": {
      return { ...state, answers: action.answers };
    }
    case "custom": {
      return { ...state, custom: action.custom };
    }
    case "measure": {
      return {
        ...state,
        animate: action.animate,
        ready: true,
        trackY: action.trackY,
        viewportH: action.viewportH,
      };
    }
    case "open": {
      return { ...state, open: action.open };
    }
    case "qi": {
      return { ...state, qi: action.qi };
    }
    case "reset": {
      return { ...initialCardState };
    }
    case "sent": {
      return { ...state, sent: true };
    }
    default: {
      return state;
    }
  }
};

const ApprovalSent = ({
  labels,
  resettable,
  onReset,
}: {
  labels: ApprovalLabels;
  resettable: boolean;
  onReset: () => void;
}) => (
  <div
    className="flex w-full max-w-80 items-center gap-3"
    style={{ animation: "pop-in 260ms cubic-bezier(0.23,1,0.32,1) both" }}
  >
    <span className="bg-green-tint text-green inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-[12.5px] font-medium">
      <span className="bg-green flex size-4.5 items-center justify-center rounded-full text-white">
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
      {labels.sentMessage}
    </span>
    {resettable ? (
      <button
        type="button"
        onClick={onReset}
        className="text-ink-3 hover:text-ink text-[12px] font-medium transition-colors duration-150"
      >
        Start over
      </button>
    ) : null}
  </div>
);

const ApprovalFooter = ({
  hasAnswer,
  labels,
  last,
  qi,
  questionCount,
  onAdvance,
  onGoTo,
  onSkip,
}: {
  hasAnswer: boolean;
  labels: ApprovalLabels;
  last: boolean;
  qi: number;
  questionCount: number;
  onAdvance: () => void;
  onGoTo: (next: number) => void;
  onSkip: () => void;
}) => (
  <div className="primitive-card-footer flex items-center justify-between gap-3">
    <div className="text-ink-3 flex items-center gap-1">
      <button
        type="button"
        aria-label="Previous question"
        disabled={qi <= 0}
        onClick={() => onGoTo(qi - 1)}
        className="enabled:hover:text-ink flex size-[18px] items-center justify-center rounded-[5px] transition-colors duration-100 disabled:opacity-30"
      >
        <Ico size={14} path={<path d="M18 15l-6-6-6 6" />} />
      </button>
      <span
        className="text-ink-3 inline-flex items-center text-[12px] font-medium tabular-nums"
        style={{ letterSpacing: "-0.1px", lineHeight: 1 }}
      >
        <RollingDigits value={`${qi + 1} / ${questionCount}`} />
      </span>
      <button
        type="button"
        aria-label="Next question"
        disabled={last}
        onClick={() => onGoTo(qi + 1)}
        className="enabled:hover:text-ink flex size-[18px] items-center justify-center rounded-[5px] transition-colors duration-100 disabled:opacity-30"
      >
        <Ico size={14} path={<path d="M6 9l6 6 6-6" />} />
      </button>
    </div>

    <div className="-mr-0.5 flex items-center gap-1.5">
      <Button variant="ghost" size="sm" onClick={onSkip}>
        {labels.skip}
      </Button>
      <Button
        variant="accent"
        size="sm"
        disabled={!hasAnswer}
        onClick={onAdvance}
      >
        {last ? labels.send : labels.continue}
      </Button>
    </div>
  </div>
);

const ApprovalQuestionList = ({
  animate,
  answers,
  custom,
  customPlaceholder,
  hasAnswer,
  qi,
  questionRefs,
  questions,
  ready,
  onAdvance,
  onCustomChange,
  onToggle,
}: {
  animate: boolean;
  answers: Record<number, number[]>;
  custom: Record<number, string>;
  customPlaceholder: string;
  hasAnswer: boolean;
  qi: number;
  questionRefs: { current: (HTMLDivElement | null)[] };
  questions: ApprovalQuestion[];
  ready: boolean;
  onAdvance: () => void;
  onCustomChange: (
    questionIndex: number,
    value: string,
    isRadio: boolean
  ) => void;
  onToggle: (optionIndex: number) => void;
}) => (
  <>
    {questions.map((question, qIdx) => {
      const active = qIdx === qi;
      if (!ready && !active) {
        return null;
      }
      const picked = answers[qIdx] ?? [];
      const questionStyle: CSSProperties = {
        opacity: active ? 1 : 0,
        pointerEvents: active ? undefined : "none",
        transition: animate ? `opacity ${SLIDE}` : undefined,
      };
      return (
        <div
          key={question.q}
          ref={(el) => {
            questionRefs.current[qIdx] = el;
          }}
          aria-hidden={active ? undefined : true}
          style={questionStyle}
        >
          <div className="text-ink pr-7 text-[14px] font-medium">
            {question.q}
          </div>
          <GlideMenu
            className="mt-2.5 flex flex-col gap-1"
            highlightClassName="inset-x-0 rounded-control bg-hover"
          >
            {question.options.map((option, optionIndex) => {
              const on = picked.includes(optionIndex);
              return (
                <button
                  key={option}
                  type="button"
                  data-menu-row
                  aria-pressed={on}
                  tabIndex={active ? 0 : -1}
                  onClick={() => {
                    if (active) {
                      onToggle(optionIndex);
                    }
                  }}
                  className="rounded-control relative z-10 flex items-center gap-1.5 py-1 pr-2 pl-1 text-left transition-colors duration-100"
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center transition-colors duration-200 ${question.type === "radio" ? "rounded-full" : "rounded-[5px]"} ${on ? "bg-ink text-canvas" : "text-transparent shadow-[inset_0_0_0_1.5px_var(--line-strong)]"}`}
                  >
                    {question.type === "radio" ? (
                      <span
                        className="bg-canvas size-1.5 rounded-full transition-transform duration-200"
                        style={{
                          transform: on ? "scale(1)" : "scale(0)",
                        }}
                      />
                    ) : (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  <span
                    className={`text-[13px] leading-none transition-colors duration-200 ${on ? "text-ink" : "text-ink-2"}`}
                  >
                    {option}
                  </span>
                </button>
              );
            })}
            <label
              data-menu-row
              className="rounded-control relative z-10 flex items-center gap-1.5 py-1 pr-2 pl-1 transition-colors duration-100"
            >
              <input
                value={custom[qIdx] ?? ""}
                tabIndex={active ? 0 : -1}
                onChange={(event) => {
                  if (!active) {
                    return;
                  }
                  onCustomChange(
                    qIdx,
                    event.target.value,
                    question.type === "radio"
                  );
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && hasAnswer) {
                    onAdvance();
                  }
                }}
                placeholder={customPlaceholder}
                aria-label="Custom answer"
                className="text-ink placeholder:text-ink-3 min-w-0 flex-1 bg-transparent pl-1.5 text-[13px] outline-none"
              />
            </label>
          </GlideMenu>
        </div>
      );
    })}
  </>
);

const ApprovalCard = ({
  questions = QUESTIONS,
  labels,
  onSubmitted,
  onAnswerChange,
  resettable = true,
}: {
  questions?: ApprovalQuestion[];
  labels?: Partial<ApprovalLabels>;
  onSubmitted?: (answers: Record<number, number[]>) => void;
  onAnswerChange?: (questionIndex: number, answer: number[]) => void;
  resettable?: boolean;
  variant?: string;
} = {}) => {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [state, dispatch] = useReducer(cardReducer, initialCardState);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const measured = useRef(false);

  const last = state.qi === questions.length - 1;
  const selected = state.answers[state.qi] ?? [];
  const hasAnswer =
    selected.length > 0 || Boolean(state.custom[state.qi]?.trim());

  useLayoutEffect(() => {
    const item = questionRefs.current[state.qi];
    if (!item) {
      return;
    }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const withAnim = measured.current;
    measured.current = true;
    const frame = requestAnimationFrame(() => {
      dispatch({
        animate: withAnim && !reduce,
        trackY: item.offsetTop,
        type: "measure",
        viewportH: item.offsetHeight,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [state.qi]);

  useEffect(
    () => () => {
      if (advanceTimer.current) {
        clearTimeout(advanceTimer.current);
      }
    },
    []
  );

  const goTo = (next: number) => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
    }
    dispatch({
      qi: Math.min(Math.max(next, 0), questions.length - 1),
      type: "qi",
    });
  };

  const submitAnswers = (payload: Record<number, number[]>) => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
    }
    dispatch({ type: "sent" });
    onSubmitted?.(payload);
  };

  const advance = () => {
    if (last) {
      submitAnswers(state.answers);
    } else {
      goTo(state.qi + 1);
    }
  };

  const toggle = (index: number) => {
    const currentQuestion = questions[state.qi];
    if (!currentQuestion) {
      return;
    }
    const { type } = currentQuestion;
    const picked = state.answers[state.qi] ?? [];
    let next: number[];
    if (type === "radio") {
      next = [index];
    } else if (picked.includes(index)) {
      next = picked.filter((item) => item !== index);
    } else {
      next = [...picked, index];
    }
    onAnswerChange?.(state.qi, next);
    const updated = { ...state.answers, [state.qi]: next };
    dispatch({ answers: updated, type: "answers" });

    if (type === "radio") {
      dispatch({
        custom: { ...state.custom, [state.qi]: "" },
        type: "custom",
      });
      if (advanceTimer.current) {
        clearTimeout(advanceTimer.current);
      }
      advanceTimer.current = setTimeout(() => {
        if (last) {
          submitAnswers(updated);
        } else {
          dispatch({
            qi: Math.min(questions.length - 1, state.qi + 1),
            type: "qi",
          });
        }
      }, 480);
    }
  };

  const reset = () => {
    measured.current = false;
    dispatch({ type: "reset" });
  };

  if (!state.open) {
    return (
      <button
        type="button"
        onClick={() => dispatch({ open: true, type: "open" })}
        className="rounded-control bg-surface text-ink shadow-btn hover:bg-hover px-3 py-2 text-[12.5px] font-medium transition-colors duration-150"
      >
        Open approval
      </button>
    );
  }

  if (state.sent) {
    return <ApprovalSent labels={t} resettable={resettable} onReset={reset} />;
  }

  return (
    <div className="w-full max-w-80">
      <div
        className="rounded-card bg-surface shadow-card relative overflow-hidden"
        style={{ animation: "fade-up 380ms cubic-bezier(0.23,1,0.32,1) both" }}
      >
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => dispatch({ open: false, type: "open" })}
          className="primitive-icon-button text-ink-3 hover:bg-hover hover:text-ink absolute top-2.5 right-2.5 z-10 transition-colors duration-100"
        >
          <Ico size={14} sw={2.2} path={<path d="M18 6L6 18M6 6l12 12" />} />
        </button>
        <div className="primitive-card-pad">
          <div
            className="overflow-hidden"
            style={{
              height: state.viewportH,
              transition: state.animate ? `height ${SLIDE}` : undefined,
            }}
            aria-live="polite"
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 26,
                transform: `translate3d(0, ${-state.trackY}px, 0)`,
                transition: state.animate ? `transform ${SLIDE}` : undefined,
              }}
            >
              <ApprovalQuestionList
                animate={state.animate}
                answers={state.answers}
                custom={state.custom}
                customPlaceholder={t.customPlaceholder}
                hasAnswer={hasAnswer}
                qi={state.qi}
                questionRefs={questionRefs}
                questions={questions}
                ready={state.ready}
                onAdvance={advance}
                onCustomChange={(questionIndex, value, isRadio) => {
                  dispatch({
                    custom: {
                      ...state.custom,
                      [questionIndex]: value,
                    },
                    type: "custom",
                  });
                  if (isRadio) {
                    dispatch({
                      answers: { ...state.answers, [questionIndex]: [] },
                      type: "answers",
                    });
                  }
                }}
                onToggle={toggle}
              />
            </div>
          </div>
        </div>

        <ApprovalFooter
          hasAnswer={hasAnswer}
          labels={t}
          last={last}
          qi={state.qi}
          questionCount={questions.length}
          onAdvance={advance}
          onGoTo={goTo}
          onSkip={() =>
            last ? dispatch({ open: false, type: "open" }) : goTo(state.qi + 1)
          }
        />
      </div>
    </div>
  );
};

export default ApprovalCard;
