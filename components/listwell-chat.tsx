"use client";

import { useRouter } from "next/navigation";
import Script from "next/script";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import useSWR from "swr";

import { ReportSummary } from "@/components/chat-report-insight";
import {
  LISTWELL_LOGOUT_EVENT,
  LISTWELL_RESET_EVENT,
} from "@/components/page-controls";
import ApprovalCard from "@/components/primitives/approval-card";
import LoadingState from "@/components/primitives/loading-state";
import TaskRows from "@/components/primitives/task-rows";
import type { TaskDetail, TaskRow } from "@/components/primitives/task-rows";
import {
  buildBasicReportStats,
  categoryFromInput,
  categoryLabel,
  commonCategoryLabels,
  createMessage,
  createPromptMessage,
  fetchListingCandidates,
  isPromptInputPhase,
  isTextInputPhase,
  listingLookupSkipMessage,
  listingQuestion,
  promptForPhase,
  scorePercent,
} from "@/lib/chat-onboarding";
import type {
  BasicReportStats,
  ChatDraft,
  ChatMessage,
  ChatPhase,
} from "@/lib/chat-onboarding";
import { checksForCategory } from "@/lib/checks/registry";
import type { CheckDefinition } from "@/lib/checks/types";
import {
  discoverResponseSchema,
  filterProfilesForCandidate,
  lookupResponseSchema,
} from "@/lib/discover";
import type { PlaceCandidate } from "@/lib/discover";
import { mapProfilesToBusinessData } from "@/lib/profiles";
import {
  auditJobPollSchema,
  businessSchema,
  checkBatchResponseSchema,
  checkResultSchema,
} from "@/lib/schema";
import {
  addBusinessId,
  CHAT_SESSION_STORAGE_KEY,
  clearChatSession,
  loadChatSession,
  saveChatSession,
} from "@/lib/storage";
import { normalizeChatInput } from "@/lib/text-normalize";
import { waitForMs } from "@/lib/wait";

const INITIAL_DRAFT: ChatDraft = {
  businessName: "",
  categoryId: "other",
  location: "",
};

const TYPING_MIN_MS = 380;

const STARTER_PROMPT: ChatMessage = {
  id: "starter-business-name",
  isPrompt: true,
  role: "assistant",
  text: promptForPhase("business_name"),
};

const SESSION_RESTORE_SCRIPT = `(function(){try{var raw=localStorage.getItem(${JSON.stringify(CHAT_SESSION_STORAGE_KEY)});if(!raw)return;var s=JSON.parse(raw);var msgs=s&&s.messages;var started=s&&s.phase&&s.phase!=="business_name";var answered=msgs&&msgs[0]&&msgs[0].userAnswer;var many=msgs&&msgs.length>1;if(!started&&!answered&&!many)return;var el=document.getElementById("listwell-chat-root");if(el)el.classList.add("listwell-chat__layout--pending-restore");}catch(e){}})();`;

const SessionRestoreScript = () => (
  <Script id="listwell-session-restore" strategy="afterInteractive">
    {SESSION_RESTORE_SCRIPT}
  </Script>
);

const isRestoredSession = (input: {
  phase: ChatPhase;
  messages: ChatMessage[];
}): boolean =>
  input.phase !== "business_name" ||
  input.messages.length > 1 ||
  Boolean(input.messages[0]?.userAnswer);

interface CheckProgressResult {
  value: boolean | null;
}

interface CheckProgress {
  results: Record<string, CheckProgressResult>;
  pending: Set<string>;
  jobStatus?: "queued" | "running" | "complete" | "error";
}

const parseCheckResults = (
  raw: Record<string, unknown>
): Record<string, CheckProgressResult> => {
  const parsed: Record<string, CheckProgressResult> = {};
  for (const [checkId, value] of Object.entries(raw)) {
    const result = checkResultSchema.safeParse(value);
    if (result.success) {
      parsed[checkId] = { value: result.data.value };
    }
  }
  return parsed;
};

const checkDetailMeta = (checkId: string, progress: CheckProgress): string => {
  const result = progress.results[checkId];
  if (result) {
    if (result.value === true) {
      return "pass";
    }
    if (result.value === false) {
      return "fail";
    }
    return "error";
  }
  if (progress.pending.has(checkId)) {
    if (progress.jobStatus === "running" || progress.jobStatus === "queued") {
      return "running";
    }
    return "queued";
  }
  return "queued";
};

const buildCheckDetails = (
  definitions: CheckDefinition[],
  progress: CheckProgress
): TaskDetail[] =>
  definitions.map((definition) => ({
    label: definition.title,
    meta: checkDetailMeta(definition.id, progress),
  }));

const checksRowStatus = (
  definitions: CheckDefinition[],
  progress: CheckProgress
): TaskRow["status"] => {
  const details = buildCheckDetails(definitions, progress);
  if (
    details.every(
      (detail) =>
        detail.meta === "pass" ||
        detail.meta === "fail" ||
        detail.meta === "error"
    )
  ) {
    return "done";
  }
  if (details.some((detail) => detail.meta !== "queued")) {
    return "running";
  }
  return "pending";
};

const checksTaskRow = (
  definitions: CheckDefinition[],
  progress: CheckProgress
): TaskRow => {
  const status = checksRowStatus(definitions, progress);
  return {
    amount: `${definitions.length} checks`,
    details: buildCheckDetails(definitions, progress),
    key: "checks",
    label: "Run visibility checks",
    status,
    step: status === "done" ? undefined : 2,
  };
};

const buildInitialAuditTasks = (
  categoryId: ChatDraft["categoryId"]
): TaskRow[] => {
  const checkDefinitions = checksForCategory(categoryId);
  const pending = new Set(checkDefinitions.map((definition) => definition.id));
  return [
    {
      amount: "Maps + web",
      details: [{ label: "Searching Google and Apple Maps", meta: "running" }],
      key: "discover",
      label: "Find listings and profiles",
      status: "running",
      step: 1,
    },
    checksTaskRow(checkDefinitions, {
      jobStatus: "queued",
      pending,
      results: {},
    }),
    {
      amount: "Preview",
      details: [{ label: "Score and top issues", meta: "queued" }],
      key: "summary",
      label: "Write basic report",
      status: "pending",
      step: 3,
    },
  ];
};

const applySummaryRunning = (rows: TaskRow[]): TaskRow[] =>
  rows.map((row) =>
    row.key === "summary"
      ? {
          ...row,
          details: [{ label: "Score and top issues", meta: "running" }],
          status: "running",
          step: 3,
        }
      : row
  );

const applySummaryDone = (
  rows: TaskRow[],
  stats: BasicReportStats
): TaskRow[] =>
  rows.map((row) =>
    row.key === "summary"
      ? {
          ...row,
          details: [
            { label: "Score and top issues", meta: `${scorePercent(stats)}%` },
            { label: "Checks passed", meta: String(stats.pass) },
            { label: "Needs work", meta: String(stats.fail) },
          ],
          status: "done",
        }
      : row
  );

const messageEnterDelay = (index: number): string =>
  `${Math.min(index * 45, 240)}ms`;

const JOB_POLL_INTERVAL_MS = 2000;

const pause = (ms: number): Promise<void> => waitForMs(ms);

const resolveInitialJobStatus = (
  jobId: string | undefined,
  pendingCount: number
): CheckProgress["jobStatus"] => {
  if (jobId && pendingCount > 0) {
    return "running";
  }
  if (pendingCount > 0) {
    return "queued";
  }
  return "complete";
};

const pendingCheckIds = (
  definitions: CheckDefinition[],
  parsedResults: Record<string, CheckProgressResult>
): Set<string> =>
  new Set(
    definitions.flatMap((definition) =>
      parsedResults[definition.id] === undefined ? [definition.id] : []
    )
  );

const pollAuditJob = async ({
  activeCheckDefinitions,
  attempt,
  jobId,
  onProgress,
  parsedResults,
}: {
  activeCheckDefinitions: CheckDefinition[];
  attempt: number;
  jobId: string;
  onProgress: (progress: CheckProgress) => void;
  parsedResults: Record<string, CheckProgressResult>;
}): Promise<{
  jobStatus: CheckProgress["jobStatus"];
  parsedResults: Record<string, CheckProgressResult>;
  pending: Set<string>;
}> => {
  if (attempt >= 30) {
    const pending = pendingCheckIds(activeCheckDefinitions, parsedResults);
    return { jobStatus: "complete", parsedResults, pending };
  }

  await pause(JOB_POLL_INTERVAL_MS);
  const jobResponse = await fetch(`/api/jobs/${jobId}`);
  if (!jobResponse.ok) {
    const pending = pendingCheckIds(activeCheckDefinitions, parsedResults);
    return { jobStatus: "complete", parsedResults, pending };
  }

  const jobParsed = auditJobPollSchema.safeParse(await jobResponse.json());
  if (!jobParsed.success) {
    const pending = pendingCheckIds(activeCheckDefinitions, parsedResults);
    return { jobStatus: "complete", parsedResults, pending };
  }

  const job = jobParsed.data;
  const nextResults = {
    ...parsedResults,
    ...parseCheckResults(job.results),
  };
  let pending = pendingCheckIds(activeCheckDefinitions, nextResults);
  const jobStatus: CheckProgress["jobStatus"] = job.status;
  onProgress({ jobStatus, pending, results: nextResults });

  if (job.status === "complete" || job.status === "error") {
    if (job.status === "error") {
      for (const checkId of pending) {
        nextResults[checkId] = { value: null };
      }
      pending = new Set();
    }
    return { jobStatus, parsedResults: nextResults, pending };
  }

  return pollAuditJob({
    activeCheckDefinitions,
    attempt: attempt + 1,
    jobId,
    onProgress,
    parsedResults: nextResults,
  });
};

const ChatMessageBubble = ({
  message,
  index,
}: {
  message: ChatMessage;
  index: number;
}) => {
  const isUser = message.role === "user";
  return (
    <article
      className={`listwell-chat__message listwell-chat__message--${message.role}`}
      style={{ animationDelay: messageEnterDelay(index) }}
      aria-label={isUser ? `You: ${message.text}` : `Listwell: ${message.text}`}
    >
      <p
        className={`listwell-chat__bubble listwell-chat__bubble--${message.role}`}
      >
        {message.text}
      </p>
    </article>
  );
};

const TypingIndicator = () => (
  <article
    className="listwell-chat__message listwell-chat__message--assistant listwell-chat__typing"
    aria-live="polite"
    aria-label="Listwell is typing"
  >
    <span className="listwell-chat__message-label">Listwell</span>
    <div
      className="listwell-chat__bubble listwell-chat__bubble--assistant listwell-chat__bubble--typing"
      aria-hidden
    >
      <span className="listwell-chat__typing-dot" />
      <span className="listwell-chat__typing-dot" />
      <span className="listwell-chat__typing-dot" />
    </div>
  </article>
);

/** Bare composer: text + send only. No model, voice, or file attach. */
const ChatComposer = ({
  placeholder,
  onSend,
  shouldFocus = false,
  embedded = false,
}: {
  placeholder: string;
  onSend: (text: string) => void;
  shouldFocus?: boolean;
  embedded?: boolean;
}) => {
  const [value, setValue] = useReducer(
    (_current: string, next: string) => next,
    ""
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (shouldFocus) {
      inputRef.current?.focus();
    }
  }, [shouldFocus]);

  const sendComposerMessage = () => {
    const trimmed = (inputRef.current?.value ?? value).trim();
    if (!trimmed) {
      return;
    }
    setValue("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    onSend(trimmed);
  };

  const canSend = value.trim().length > 0;

  return (
    <form
      className={`listwell-chat__composer${embedded ? " listwell-chat__composer--embedded" : ""}`}
      action={sendComposerMessage}
    >
      <input
        ref={inputRef}
        className="listwell-chat__input"
        defaultValue=""
        onInput={(event) => setValue(event.currentTarget.value)}
        placeholder={placeholder}
        autoComplete="organization"
        enterKeyHint="send"
        aria-label={placeholder}
      />
      <button
        className="listwell-chat__send"
        type="submit"
        aria-disabled={!canSend}
        aria-label="Send"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </form>
  );
};

const ABOUT_COPY =
  "Listwell runs a free check of local and website visibility. A full report with fix steps is $5.";

const AboutDialog = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) {
      return;
    }
    if (open) {
      if (!node.open) {
        node.showModal();
      }
      return;
    }
    if (node.open) {
      node.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="listwell-about"
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <h2 id={titleId} className="listwell-about__title">
        About Listwell
      </h2>
      <p className="listwell-about__body">{ABOUT_COPY}</p>
      <button type="button" className="listwell-about__close" onClick={onClose}>
        Close
      </button>
    </dialog>
  );
};

/** Question card; optional user answer stays on the same surface. */
const PromptCard = ({
  question,
  userAnswer,
  variant = "thread",
  index = 0,
  showEmbeddedInput = false,
  inputPlaceholder,
  onInputSend,
  shouldFocusInput = false,
  options,
  onOptionSelect,
}: {
  question: string;
  userAnswer?: string;
  variant?: "starter" | "thread";
  index?: number;
  showEmbeddedInput?: boolean;
  inputPlaceholder?: string;
  onInputSend?: (text: string) => void;
  shouldFocusInput?: boolean;
  options?: string[];
  onOptionSelect?: (option: string) => void;
}) => {
  const [aboutOpen, setAboutOpen] = useState(false);
  const promptReply = userAnswer ? (
    <div className="listwell-chat__prompt-card-answer">
      <p className="listwell-chat__prompt-card-answer-text">{userAnswer}</p>
    </div>
  ) : null;
  const promptInput =
    showEmbeddedInput && inputPlaceholder && onInputSend ? (
      <ChatComposer
        key={inputPlaceholder}
        embedded
        placeholder={inputPlaceholder}
        onSend={onInputSend}
        shouldFocus={shouldFocusInput}
      />
    ) : null;
  const showOptions =
    userAnswer === undefined && options && options.length > 0 && onOptionSelect;

  const card = (
    <article
      className={`listwell-chat__prompt-card listwell-chat__prompt-card--${variant}`}
      style={
        variant === "starter"
          ? undefined
          : { animationDelay: messageEnterDelay(index) }
      }
      aria-label={
        userAnswer
          ? `Listwell: ${question}. You: ${userAnswer}`
          : `Listwell: ${question}`
      }
    >
      <div className="listwell-chat__prompt-card-surface">
        {variant === "starter" ? (
          <div className="listwell-chat__prompt-card-question listwell-chat__prompt-card-question--starter">
            <h1 className="listwell-chat__prompt">
              {question}{" "}
              <span className="listwell-chat__prompt-aside">
                Free check of local and website visibility
              </span>
            </h1>
          </div>
        ) : (
          <p className="listwell-chat__prompt-card-question">{question}</p>
        )}
        {promptReply ?? promptInput}
        {showOptions ? (
          <fieldset
            className="listwell-chat__prompt-card-options"
            aria-label="Common categories"
          >
            {options.map((option) => (
              <button
                key={option}
                type="button"
                className="listwell-chat__prompt-card-option"
                onClick={() => onOptionSelect(option)}
              >
                {option}
              </button>
            ))}
          </fieldset>
        ) : null}
      </div>
    </article>
  );

  if (variant !== "starter") {
    return card;
  }

  return (
    <div className="listwell-chat__starter-prompt">
      <div
        className="listwell-chat__starter"
        style={{ animationDelay: messageEnterDelay(index) }}
      >
        <div className="listwell-chat__starter-chrome">
          <p className="listwell-chat__starter-title">Listwell</p>
          <button
            type="button"
            className="listwell-chat__starter-about"
            aria-haspopup="dialog"
            aria-expanded={aboutOpen}
            onClick={() => setAboutOpen(true)}
          >
            About
          </button>
        </div>
        {card}
      </div>
      {promptInput ? (
        <p className="listwell-chat__starter-pricing">
          $5 for a full report with fix steps
        </p>
      ) : null}
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
};

const ListwellChatLayout = ({
  activePromptId,
  attachInput,
  auditTasks,
  businessId,
  candidates,
  categoryOptions,
  draft,
  handleListingSubmit,
  handleSend,
  isStarter,
  isTyping,
  messages,
  phase,
  promptPlaceholder,
  reportStats,
  restored,
  push,
  scrollRef,
}: {
  activePromptId: string | null;
  attachInput: boolean;
  auditTasks: TaskRow[];
  businessId: string | null;
  candidates: PlaceCandidate[];
  categoryOptions: string[];
  draft: ChatDraft;
  handleListingSubmit: (answers: Record<number, number[]>) => void;
  handleSend: (text: string) => void;
  isStarter: boolean;
  isTyping: boolean;
  messages: ChatMessage[];
  phase: ChatPhase;
  promptPlaceholder: string;
  reportStats: BasicReportStats | null;
  restored: boolean;
  push: ReturnType<typeof useRouter>["push"];
  scrollRef: RefObject<HTMLDivElement | null>;
}) => (
  <div
    id="listwell-chat-root"
    suppressHydrationWarning
    className={`listwell-chat__layout${attachInput && !isStarter ? " listwell-chat__layout--docked-composer" : ""}${restored ? " listwell-chat__layout--restored" : ""}`}
  >
    <SessionRestoreScript />
    <div ref={scrollRef} className="listwell-chat__viewport">
      <div
        className={`listwell-chat${isStarter ? "" : " listwell-chat--thread"}`}
      >
        <div className="listwell-chat__thread">
          {messages.map((message, index) => {
            if (message.isPrompt) {
              const isFirstPrompt = index === 0 && message.isPrompt;
              const isActivePrompt =
                attachInput && message.id === activePromptId;
              const isCategoryPrompt = phase === "category" && isActivePrompt;
              return (
                <PromptCard
                  key={message.id}
                  question={message.text}
                  userAnswer={message.userAnswer}
                  variant={isFirstPrompt && isStarter ? "starter" : "thread"}
                  index={index}
                  showEmbeddedInput={isActivePrompt}
                  inputPlaceholder={promptPlaceholder}
                  onInputSend={handleSend}
                  shouldFocusInput={isActivePrompt}
                  options={isCategoryPrompt ? categoryOptions : undefined}
                  onOptionSelect={isCategoryPrompt ? handleSend : undefined}
                />
              );
            }

            return (
              <ChatMessageBubble
                key={message.id}
                message={message}
                index={index}
              />
            );
          })}

          {isTyping ? <TypingIndicator /> : null}

          {phase === "identifying" ? (
            <div className="listwell-chat__stage listwell-chat__stage--attached">
              <LoadingState label="Identifying" variant="Drive" />
              <p className="listwell-chat__hint">
                {promptForPhase("identifying")}
              </p>
            </div>
          ) : null}

          {phase === "listing" && candidates.length > 0 ? (
            <div className="listwell-chat__stage listwell-chat__stage--attached">
              <ApprovalCard
                questions={[listingQuestion(candidates)]}
                labels={{
                  continue: "Continue",
                  customPlaceholder: "Different name…",
                  send: "Send",
                  sentMessage: "Saved",
                  skip: "Skip",
                }}
                onSubmitted={handleListingSubmit}
                resettable={false}
              />
            </div>
          ) : null}

          {(phase === "auditing" || phase === "report") &&
          auditTasks.length > 0 ? (
            <div className="listwell-chat__stage">
              {phase === "auditing" ? (
                <LoadingState label="Auditing" variant="Drive" />
              ) : null}
              <TaskRows
                rows={auditTasks}
                variant="List"
                labels={{ completed: "Done", failed: "Retrying" }}
                className="max-w-full"
              />
            </div>
          ) : null}

          {phase === "report" && reportStats ? (
            <div className="listwell-chat__stage listwell-chat__stage--report">
              <ReportSummary
                businessName={draft.businessName}
                stats={reportStats}
                businessId={businessId}
                onPreview={() => {
                  if (businessId) {
                    push(`/${businessId}`);
                  }
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>

    {attachInput && !isStarter ? (
      <div className="listwell-chat__composer-dock">
        <ChatComposer
          key={`footer-${phase}`}
          placeholder={promptPlaceholder}
          onSend={handleSend}
        />
      </div>
    ) : null}
  </div>
);

const startAudit = async ({
  nextDraft,
  advance,
  pushMessage,
  runAudit,
  setPhase,
  showTypingThen,
  errorMessage,
  errorPhase,
}: {
  nextDraft: ChatDraft;
  advance: (next: ChatPhase, assistantText?: string) => void;
  pushMessage: (role: ChatMessage["role"], text: string) => void;
  runAudit: (draft: ChatDraft) => Promise<void>;
  setPhase: (phase: ChatPhase) => void;
  showTypingThen: (work: () => void | Promise<void>) => Promise<void>;
  errorMessage: string;
  errorPhase: ChatPhase;
}) => {
  await showTypingThen(() => {
    advance("auditing", promptForPhase("auditing"));
  });
  try {
    await runAudit(nextDraft);
    advance("report");
  } catch {
    pushMessage("assistant", errorMessage);
    setPhase(errorPhase);
  }
};

interface ChatSessionState {
  auditTasks: TaskRow[];
  businessId: string | null;
  candidates: PlaceCandidate[];
  draft: ChatDraft;
  isTyping: boolean;
  locationHint: string;
  messages: ChatMessage[];
  phase: ChatPhase;
  reportStats: BasicReportStats | null;
}

type ChatSessionAction =
  | { type: "apply-locality"; locality: string }
  | {
      type: "audit-tasks";
      updater: (current: TaskRow[]) => TaskRow[];
    }
  | { type: "messages"; updater: (current: ChatMessage[]) => ChatMessage[] }
  | { type: "patch"; patch: Partial<ChatSessionState> }
  | { type: "reset" };

const emptyChatSession = (): ChatSessionState => ({
  auditTasks: buildInitialAuditTasks("other"),
  businessId: null,
  candidates: [],
  draft: INITIAL_DRAFT,
  isTyping: false,
  locationHint: "Suburb or city",
  messages: [STARTER_PROMPT],
  phase: "business_name",
  reportStats: null,
});

const loadInitialChatSession = (): ChatSessionState => {
  const stored = loadChatSession();
  if (!(stored && isRestoredSession(stored))) {
    return emptyChatSession();
  }
  return {
    auditTasks:
      stored.auditTasks.length > 0
        ? stored.auditTasks
        : buildInitialAuditTasks(stored.draft.categoryId),
    businessId: stored.businessId,
    candidates: stored.candidates,
    draft: stored.draft,
    isTyping: false,
    locationHint: stored.locationHint,
    messages: stored.messages,
    phase: stored.phase,
    reportStats: stored.reportStats,
  };
};

const chatSessionReducer = (
  state: ChatSessionState,
  action: ChatSessionAction
): ChatSessionState => {
  switch (action.type) {
    case "apply-locality": {
      return {
        ...state,
        draft: {
          ...state.draft,
          location: state.draft.location || action.locality,
        },
        locationHint: action.locality,
      };
    }
    case "audit-tasks": {
      return { ...state, auditTasks: action.updater(state.auditTasks) };
    }
    case "messages": {
      return { ...state, messages: action.updater(state.messages) };
    }
    case "patch": {
      return { ...state, ...action.patch };
    }
    case "reset": {
      return emptyChatSession();
    }
    default: {
      return state;
    }
  }
};

const fetchReverseLocality = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Reverse lookup failed");
  }
  return lookupResponseSchema.parse(await response.json());
};

const useListwellChat = () => {
  const { push } = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const skipRestoreScroll = useRef(
    (() => {
      const stored = loadChatSession();
      return Boolean(stored && isRestoredSession(stored));
    })()
  );
  const [state, dispatch] = useReducer(
    chatSessionReducer,
    undefined,
    loadInitialChatSession
  );
  const {
    auditTasks,
    businessId,
    candidates,
    draft,
    isTyping,
    locationHint,
    messages,
    phase,
    reportStats,
  } = state;
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    null
  );

  const setPhase = useCallback((next: ChatPhase) => {
    dispatch({ patch: { phase: next }, type: "patch" });
  }, []);
  const setDraft = useCallback((next: ChatDraft) => {
    dispatch({ patch: { draft: next }, type: "patch" });
  }, []);
  const setMessages = useCallback(
    (updater: (current: ChatMessage[]) => ChatMessage[]) => {
      dispatch({ type: "messages", updater });
    },
    []
  );
  const setCandidates = useCallback((next: PlaceCandidate[]) => {
    dispatch({ patch: { candidates: next }, type: "patch" });
  }, []);
  const setBusinessId = useCallback((next: string | null) => {
    dispatch({ patch: { businessId: next }, type: "patch" });
  }, []);
  const setReportStats = useCallback((next: BasicReportStats | null) => {
    dispatch({ patch: { reportStats: next }, type: "patch" });
  }, []);
  const setIsTyping = useCallback((next: boolean) => {
    dispatch({ patch: { isTyping: next }, type: "patch" });
  }, []);
  const setAuditTasks = useCallback(
    (next: TaskRow[] | ((current: TaskRow[]) => TaskRow[])) => {
      dispatch({
        type: "audit-tasks",
        updater: typeof next === "function" ? next : () => next,
      });
    },
    []
  );
  const restored = isRestoredSession({ messages, phase });

  useEffect(() => {
    saveChatSession({
      auditTasks,
      businessId,
      candidates,
      draft,
      locationHint,
      messages,
      phase,
      reportStats,
      version: 1,
    });
  }, [
    phase,
    draft,
    messages,
    candidates,
    locationHint,
    businessId,
    reportStats,
    auditTasks,
  ]);

  const resetChat = useCallback(() => {
    clearChatSession();
    dispatch({ type: "reset" });
  }, []);

  useEffect(() => {
    const onReset = () => {
      resetChat();
    };
    window.addEventListener(LISTWELL_LOGOUT_EVENT, onReset);
    window.addEventListener(LISTWELL_RESET_EVENT, onReset);
    return () => {
      window.removeEventListener(LISTWELL_LOGOUT_EVENT, onReset);
      window.removeEventListener(LISTWELL_RESET_EVENT, onReset);
    };
  }, [resetChat]);

  const pushMessage = useCallback(
    (role: ChatMessage["role"], text: string) => {
      setMessages((current) => [...current, createMessage(role, text)]);
    },
    [setMessages]
  );

  const attachPromptAnswer = useCallback(
    (answer: string) => {
      setMessages((current) => {
        for (let index = current.length - 1; index >= 0; index -= 1) {
          const message = current[index];
          if (message?.isPrompt && message.userAnswer === undefined) {
            const next = [...current];
            next[index] = { ...message, userAnswer: answer };
            return next;
          }
        }
        return current;
      });
    },
    [setMessages]
  );

  const advance = useCallback(
    (next: ChatPhase, assistantText?: string) => {
      setPhase(next);
      if (assistantText) {
        if (isTextInputPhase(next) || next === "category") {
          setMessages((current) => [
            ...current,
            createPromptMessage(assistantText),
          ]);
        } else {
          pushMessage("assistant", assistantText);
        }
      }
    },
    [pushMessage, setMessages, setPhase]
  );

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    if (skipRestoreScroll.current) {
      skipRestoreScroll.current = false;
      node.scrollTop = node.scrollHeight;
      return;
    }
    node.scrollTo({ behavior: "smooth", top: node.scrollHeight });
  });

  const finishTyping = useCallback(
    (startedAt: number) => {
      const elapsed = Date.now() - startedAt;
      const remaining = TYPING_MIN_MS - elapsed;
      if (remaining <= 0) {
        setIsTyping(false);
        return;
      }
      setTimeout(() => {
        setIsTyping(false);
      }, remaining);
    },
    [setIsTyping]
  );

  const showTypingThen = useCallback(
    async (work: () => void | Promise<void>) => {
      const startedAt = Date.now();
      setIsTyping(true);
      await work();
      finishTyping(startedAt);
    },
    [finishTyping, setIsTyping]
  );

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
      setCoords({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      });
    });
  }, []);

  const reverseLookupUrl = coords
    ? `/api/lookups?source=nominatim-reverse&lat=${encodeURIComponent(String(coords.lat))}&lon=${encodeURIComponent(String(coords.lon))}`
    : null;

  useSWR(reverseLookupUrl, fetchReverseLocality, {
    onSuccess: (parsed) => {
      if (!parsed.locality) {
        return;
      }
      dispatch({ locality: parsed.locality, type: "apply-locality" });
    },
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const runAudit = useCallback(
    async (nextDraft: ChatDraft) => {
      let activeCheckDefinitions = checksForCategory(nextDraft.categoryId);
      let initialPending = new Set(
        activeCheckDefinitions.map((definition) => definition.id)
      );

      setAuditTasks(buildInitialAuditTasks(nextDraft.categoryId));

      const updateChecksRow = (progress: CheckProgress) => {
        setAuditTasks((current) =>
          current.map((row) =>
            row.key === "checks"
              ? checksTaskRow(activeCheckDefinitions, progress)
              : row
          )
        );
      };

      const discoverResponse = await fetch("/api/discover", {
        body: JSON.stringify({
          address: nextDraft.address,
          appleMapsId: nextDraft.appleMapsId,
          businessName: nextDraft.businessName,
          categoryId: nextDraft.categoryId,
          facebookUrl: nextDraft.facebookUrl,
          googlePlaceId: nextDraft.googlePlaceId,
          instagramUsername: nextDraft.instagramUsername,
          listingUrl: nextDraft.listingUrl,
          near: nextDraft.location,
          websiteUrl: nextDraft.websiteUrl,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!discoverResponse.ok) {
        throw new Error("Discover failed");
      }
      const discovery = discoverResponseSchema.parse(
        await discoverResponse.json()
      );

      const candidate =
        discovery.candidates.find(
          (item) =>
            nextDraft.googlePlaceId &&
            item.source === "google" &&
            item.id === nextDraft.googlePlaceId
        ) ??
        discovery.candidates.find(
          (item) =>
            nextDraft.appleMapsId &&
            item.source === "apple" &&
            item.id === nextDraft.appleMapsId
        ) ??
        discovery.candidates[0];

      const profiles = candidate
        ? filterProfilesForCandidate(discovery.profiles, candidate)
        : discovery.profiles;

      const resolvedCategory = discovery.categoryId ?? nextDraft.categoryId;
      activeCheckDefinitions = checksForCategory(resolvedCategory);
      initialPending = new Set(
        activeCheckDefinitions.map((definition) => definition.id)
      );

      const payload = mapProfilesToBusinessData(
        nextDraft.businessName,
        resolvedCategory,
        profiles
      );
      const address =
        discovery.address ?? nextDraft.address ?? candidate?.address;
      if (address?.trim()) {
        if (payload.locations.length === 0) {
          payload.locations.push({
            address: address.trim(),
            name: nextDraft.businessName,
          });
        } else if (!payload.locations[0]?.address) {
          payload.locations[0] = {
            ...payload.locations[0],
            address: address.trim(),
          };
        }
      }

      setAuditTasks((current) =>
        current.map((row) =>
          row.key === "discover"
            ? {
                ...row,
                details: [
                  { label: "Profiles found", meta: String(profiles.length) },
                  {
                    label: "Category",
                    meta: categoryLabel(
                      discovery.categoryId ?? nextDraft.categoryId
                    ),
                  },
                ],
                status: "done",
              }
            : row
        )
      );

      updateChecksRow({
        jobStatus: "running",
        pending: initialPending,
        results: {},
      });

      const id = crypto.randomUUID();
      const saveResponse = await fetch("/api/businesses", {
        body: JSON.stringify({ ...payload, id }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!saveResponse.ok) {
        throw new Error("Could not save audit");
      }
      const business = businessSchema.parse(await saveResponse.json());
      addBusinessId(business.id);
      setBusinessId(business.id);

      const checksResponse = await fetch(
        `/api/businesses/${business.id}/checks`
      );
      if (!checksResponse.ok) {
        throw new Error("Checks failed");
      }
      const batch = checkBatchResponseSchema.parse(await checksResponse.json());

      activeCheckDefinitions = checksForCategory(business.category);
      const titles = Object.fromEntries(
        activeCheckDefinitions.map((item) => [item.id, item.title])
      );

      let parsedResults = parseCheckResults(batch.results);
      let pending = new Set(batch.pending);
      let jobStatus = resolveInitialJobStatus(batch.jobId, pending.size);

      updateChecksRow({ jobStatus, pending, results: parsedResults });

      if (batch.jobId && pending.size > 0) {
        const polled = await pollAuditJob({
          activeCheckDefinitions,
          attempt: 0,
          jobId: batch.jobId,
          onProgress: updateChecksRow,
          parsedResults,
        });
        ({ parsedResults, pending, jobStatus } = polled);
      }

      for (const checkId of pending) {
        parsedResults[checkId] = { value: null };
      }
      pending = new Set();
      updateChecksRow({
        jobStatus: "complete",
        pending,
        results: parsedResults,
      });

      setAuditTasks((current) => applySummaryRunning(current));
      const stats = buildBasicReportStats(parsedResults, titles);
      setReportStats(stats);
      setAuditTasks((current) => applySummaryDone(current, stats));
    },
    [setAuditTasks, setBusinessId, setReportStats]
  );

  const handlePromptSend = useCallback(
    async (text: string) => {
      const normalized = normalizeChatInput(phase, text);
      if (!normalized) {
        return;
      }

      if (phase === "category") {
        const { categoryId, displayLabel } = categoryFromInput(
          normalized.kind === "text" ? normalized.value : text
        );
        attachPromptAnswer(displayLabel);
        const nextDraft = { ...draft, categoryId };
        setDraft(nextDraft);
        await startAudit({
          advance,
          errorMessage: "Something went wrong running the audit. Try again.",
          errorPhase: "website",
          nextDraft,
          pushMessage,
          runAudit,
          setPhase,
          showTypingThen,
        });
        return;
      }

      if (normalized.kind === "skip") {
        attachPromptAnswer(normalized.display);
        const nextDraft = draft;
        setDraft(nextDraft);
        if (nextDraft.categoryId === "other" && !nextDraft.googlePlaceId) {
          await showTypingThen(() => {
            advance("category", promptForPhase("category"));
          });
          return;
        }
        await startAudit({
          advance,
          errorMessage:
            "Something went wrong running the audit. Try again with a website URL or listing link.",
          errorPhase: "website",
          nextDraft,
          pushMessage,
          runAudit,
          setPhase,
          showTypingThen,
        });
        return;
      }

      const { value } = normalized;
      attachPromptAnswer(value);

      if (phase === "business_name") {
        const nextDraft = { ...draft, businessName: value };
        setDraft(nextDraft);
        await showTypingThen(() => {
          advance("location", promptForPhase("location", value));
        });
        return;
      }

      if (phase === "location") {
        const nextDraft = { ...draft, location: value };
        setDraft(nextDraft);
        const lookupPromise = fetchListingCandidates(
          nextDraft.businessName,
          value
        );
        await showTypingThen(() => {
          setPhase("identifying");
        });
        const lookup = await lookupPromise;
        if (lookup.kind === "candidates") {
          setCandidates(lookup.candidates);
          advance("listing", promptForPhase("listing"));
          return;
        }
        pushMessage("assistant", listingLookupSkipMessage(lookup.reason));
        advance("website", promptForPhase("website"));
        return;
      }

      if (phase === "website") {
        const nextDraft = { ...draft, websiteUrl: value };
        setDraft(nextDraft);
        if (nextDraft.categoryId === "other" && !nextDraft.googlePlaceId) {
          await showTypingThen(() => {
            advance("category", promptForPhase("category"));
          });
          return;
        }
        await startAudit({
          advance,
          errorMessage:
            "Something went wrong running the audit. Try again with a website URL or listing link.",
          errorPhase: "website",
          nextDraft,
          pushMessage,
          runAudit,
          setPhase,
          showTypingThen,
        });
      }
    },
    [
      advance,
      attachPromptAnswer,
      draft,
      phase,
      pushMessage,
      runAudit,
      setCandidates,
      setDraft,
      setPhase,
      showTypingThen,
    ]
  );

  const handleListingSubmit = useCallback(
    (answers: Record<number, number[]>) => {
      const submitListing = async () => {
        const pickedIndex = answers[0]?.[0];
        const { options } = listingQuestion(candidates);
        const label =
          pickedIndex === undefined ? undefined : options[pickedIndex];
        if (!label || label === "None of these") {
          pushMessage("user", "None of these");
          await showTypingThen(() => {
            advance("website", promptForPhase("website"));
          });
          return;
        }
        const candidate = candidates.find((item) => item.name === label);
        if (!candidate) {
          await showTypingThen(() => {
            advance("website", promptForPhase("website"));
          });
          return;
        }
        pushMessage("user", candidate.name);
        const nextDraft: ChatDraft = {
          ...draft,
          address: candidate.address ?? draft.address,
          appleMapsId:
            candidate.source === "apple" ? candidate.id : draft.appleMapsId,
          businessName: candidate.name,
          categoryId: candidate.categoryId ?? draft.categoryId,
          googlePlaceId:
            candidate.source === "google" ? candidate.id : draft.googlePlaceId,
          websiteUrl: candidate.websiteUrl ?? draft.websiteUrl,
        };
        setDraft(nextDraft);
        if (nextDraft.websiteUrl) {
          await startAudit({
            advance,
            errorMessage: "Something went wrong running the audit. Try again.",
            errorPhase: "website",
            nextDraft,
            pushMessage,
            runAudit,
            setPhase,
            showTypingThen,
          });
          return;
        }
        await showTypingThen(() => {
          advance("website", promptForPhase("website"));
        });
      };
      submitListing();
    },
    [
      advance,
      candidates,
      draft,
      pushMessage,
      runAudit,
      setDraft,
      setPhase,
      showTypingThen,
    ]
  );

  const promptPlaceholder = useMemo(() => {
    switch (phase) {
      case "business_name": {
        return "e.g. Willow Whip Gelato";
      }
      case "location": {
        return locationHint;
      }
      case "website": {
        return "https://yoursite.com or skip";
      }
      case "category": {
        return "Type a category…";
      }
      default: {
        return "Type a reply…";
      }
    }
  }, [locationHint, phase]);

  const showComposer = isPromptInputPhase(phase);
  const categoryOptions = useMemo(() => commonCategoryLabels(), []);
  const isStarter = Boolean(
    phase === "business_name" &&
    messages.length === 1 &&
    messages[0]?.isPrompt &&
    messages[0].userAnswer === undefined
  );
  const attachInput = showComposer && !isTyping;

  const activePromptId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.isPrompt && message.userAnswer === undefined) {
        return message.id;
      }
    }
    return null;
  }, [messages]);

  const handleSend = useCallback(
    (text: string) => {
      handlePromptSend(text);
    },
    [handlePromptSend]
  );

  return {
    activePromptId,
    attachInput,
    auditTasks,
    businessId,
    candidates,
    categoryOptions,
    draft,
    handleListingSubmit,
    handleSend,
    isStarter,
    isTyping,
    messages,
    phase,
    promptPlaceholder,
    push,
    reportStats,
    restored,
    scrollRef,
  };
};

export const ListwellChat = () => {
  const layout = useListwellChat();
  return <ListwellChatLayout {...layout} />;
};
