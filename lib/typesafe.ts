/**
 * Server-only: reads Worker secrets and calls TypeSafe. Do not import from client bundles.
 */
import { z } from "zod";

import { getCloudflareEnv } from "./audit-env";

const optionalString = z.string().min(1).optional();

const readSecret = (value: unknown): string | undefined => {
  const parsed = optionalString.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

export const TYPESAFE_DEFAULT_MODEL = "jev-latest";
export const TYPESAFE_REQUEST_TIMEOUT_MS = 2000;

const jsonRecord = z.record(z.string(), z.unknown());

const noulAnswerSchema = z.object({
  noul: z.number(),
  type: z.literal("noul"),
});

const choiceAnswerSchema = z.object({
  choice: z.string(),
  confidence: z.number(),
  probabilities: z.record(z.string(), z.number()).optional(),
  type: z.literal("choice"),
});

const scoreAnswerSchema = z.object({
  confidence: z.number(),
  legend: z.record(z.string(), z.string()).optional(),
  probabilities: z.record(z.string(), z.number()).optional(),
  score: z.number(),
  type: z.literal("score"),
});

const answerSchema = z.union([
  noulAnswerSchema,
  choiceAnswerSchema,
  scoreAnswerSchema,
]);

export const systemOneResponseSchema = z.object({
  answers: z.record(z.string(), answerSchema),
  model: z.string().optional(),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
    })
    .optional(),
});

export type SystemOneResponse = z.infer<typeof systemOneResponseSchema>;
export type TypeSafeQuestion = Record<string, unknown>;

export interface TypeSafeConfig {
  apiKey: string;
  model: string;
}

export const getTypeSafeConfig = async (): Promise<TypeSafeConfig | null> => {
  const workerEnv = await getCloudflareEnv();
  const apiKey =
    readSecret(workerEnv?.TYPESAFE_API_KEY) ??
    readSecret(process.env.TYPESAFE_API_KEY);
  if (!apiKey) {
    return null;
  }
  const model =
    readSecret(workerEnv?.TYPESAFE_MODEL) ??
    readSecret(process.env.TYPESAFE_MODEL) ??
    TYPESAFE_DEFAULT_MODEL;
  return { apiKey, model };
};

export const systemOne = async (input: {
  config: TypeSafeConfig;
  state: unknown;
  questions: TypeSafeQuestion;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<SystemOneResponse | null> => {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? TYPESAFE_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl("https://api.typesafe.ai/v1/systemone", {
      body: JSON.stringify({
        model: input.config.model,
        questions: input.questions,
        state: input.state,
      }),
      headers: {
        Authorization: `Bearer ${input.config.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const json: unknown = await response.json();
    const parsed = systemOneResponseSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const parseChoiceAnswer = (
  response: SystemOneResponse,
  questionId: string
): z.infer<typeof choiceAnswerSchema> | null => {
  const answer = response.answers[questionId];
  if (!answer) {
    return null;
  }
  const parsed = choiceAnswerSchema.safeParse(answer);
  return parsed.success ? parsed.data : null;
};

export const parseNoulAnswer = (
  response: SystemOneResponse,
  questionId: string
): z.infer<typeof noulAnswerSchema> | null => {
  const answer = response.answers[questionId];
  if (!answer) {
    return null;
  }
  const parsed = noulAnswerSchema.safeParse(answer);
  return parsed.success ? parsed.data : null;
};

export const parseScoreAnswer = (
  response: SystemOneResponse,
  questionId: string
): z.infer<typeof scoreAnswerSchema> | null => {
  const answer = response.answers[questionId];
  if (!answer) {
    return null;
  }
  const parsed = scoreAnswerSchema.safeParse(answer);
  return parsed.success ? parsed.data : null;
};

export const stateIsJsonObject = (
  value: unknown
): value is Record<string, unknown> => jsonRecord.safeParse(value).success;
