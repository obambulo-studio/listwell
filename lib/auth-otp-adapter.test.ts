import { convexAdapter } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { emailOTP } from "better-auth/plugins/email-otp";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import authConfig from "../convex/auth.config";
import { SIGN_IN_CODE_EXPIRES_MINUTES } from "../emails/auth-code";

const baseURL = "http://127.0.0.1:3000";
const testEmail = "person@example.com";

const adapterFnNames = [
  "consumeOne",
  "create",
  "deleteMany",
  "deleteOne",
  "findMany",
  "findOne",
  "incrementOne",
  "updateMany",
  "updateOne",
] as const;

type AdapterFnName = (typeof adapterFnNames)[number];

const schemaFields: Record<string, ReadonlySet<string>> = {
  account: new Set([
    "accountId",
    "providerId",
    "userId",
    "accessToken",
    "refreshToken",
    "idToken",
    "accessTokenExpiresAt",
    "refreshTokenExpiresAt",
    "scope",
    "password",
    "createdAt",
    "updatedAt",
  ]),
  jwks: new Set([
    "publicKey",
    "privateKey",
    "createdAt",
    "expiresAt",
    "alg",
    "crv",
  ]),
  rateLimit: new Set(["key", "count", "lastRequest"]),
  session: new Set([
    "expiresAt",
    "token",
    "createdAt",
    "updatedAt",
    "ipAddress",
    "userAgent",
    "userId",
  ]),
  twoFactor: new Set([
    "secret",
    "backupCodes",
    "userId",
    "verified",
    "failedVerificationCount",
    "lockedUntil",
  ]),
  user: new Set([
    "name",
    "email",
    "emailVerified",
    "image",
    "createdAt",
    "updatedAt",
    "twoFactorEnabled",
    "isAnonymous",
    "username",
    "displayUsername",
    "phoneNumber",
    "phoneNumberVerified",
    "userId",
  ]),
  verification: new Set([
    "identifier",
    "value",
    "expiresAt",
    "createdAt",
    "updatedAt",
  ]),
};

const whereClauseSchema = z.object({
  connector: z.enum(["AND", "OR"]).optional(),
  field: z.string(),
  operator: z.string().optional(),
  value: z.unknown().optional(),
});

const sortBySchema = z.object({
  direction: z.enum(["asc", "desc"]),
  field: z.string(),
});

const queryArgsSchema = z.object({
  join: z.unknown().optional(),
  limit: z.number().optional(),
  model: z.string(),
  paginationOpts: z
    .object({
      cursor: z.string().nullable().optional(),
      numItems: z.number().optional(),
    })
    .optional(),
  select: z.array(z.string()).optional(),
  sortBy: sortBySchema.optional(),
  where: z.array(whereClauseSchema).optional(),
});

const mutationInputSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  increment: z.record(z.string(), z.number()).optional(),
  model: z.string(),
  set: z.record(z.string(), z.unknown()).optional(),
  update: z.record(z.string(), z.unknown()).optional(),
  where: z.array(whereClauseSchema).optional(),
});

const mutationArgsSchema = z.object({
  input: mutationInputSchema.optional(),
  onCreateHandle: z.unknown().optional(),
  onDeleteHandle: z.unknown().optional(),
  onUpdateHandle: z.unknown().optional(),
  paginationOpts: z.unknown().optional(),
  select: z.array(z.string()).optional(),
  unique: z.array(z.string()).optional(),
});

const createdRowSchema = z.object({
  id: z.string(),
});

const signInResponseSchema = z.object({
  user: z.object({
    email: z.string(),
  }),
});

const errorResponseSchema = z.object({
  code: z.string(),
});

const sessionResponseSchema = z.object({
  user: z.object({
    email: z.string(),
  }),
});

type WhereClause = z.infer<typeof whereClauseSchema>;

type StoredDoc = Record<string, unknown> & {
  _creationTime: number;
  _id: string;
};

interface MemoryAuthOptions {
  databaseRateLimit?: boolean;
}

const validationError = (message: string): Error =>
  new Error(`ArgumentValidationError: ${message}`);

const assertNoModelKey = (value: unknown): void => {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoModelKey(item);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  if (Object.hasOwn(value, "modelKey")) {
    throw validationError(
      "Object contains extra field `modelKey` that is not in the validator."
    );
  }
  for (const nested of Object.values(value)) {
    assertNoModelKey(nested);
  }
};

const assertFields = (
  model: string,
  data: Record<string, unknown>,
  whereField = false
): void => {
  const allowed = schemaFields[model];
  if (!allowed) {
    throw validationError(`Unknown model ${model}`);
  }
  for (const [field, fieldValue] of Object.entries(data)) {
    if (fieldValue === undefined) {
      continue;
    }
    if (field === "_id" && whereField) {
      continue;
    }
    if (!allowed.has(field)) {
      throw validationError(
        `Object contains extra field \`${field}\` that is not in the validator.`
      );
    }
  }
};

const idOperators = new Set(["eq", "in", "not_in"]);

const assertWhere = (model: string, where: WhereClause[] | undefined): void => {
  for (const clause of where ?? []) {
    if (
      clause.field === "_id" &&
      clause.operator !== undefined &&
      !idOperators.has(clause.operator)
    ) {
      throw validationError(
        `_id can only be used with eq, in, or not_in operator: ${clause.operator}`
      );
    }
    if (clause.field === "_creationTime") {
      throw validationError(
        "where field `_creationTime` is not in the validator."
      );
    }
    if (clause.value instanceof Date) {
      throw validationError("Date values are not in the validator.");
    }
    assertFields(model, { [clause.field]: clause.value }, true);
  }
};

const definedData = (
  data: Record<string, unknown>
): Record<string, unknown> => {
  const defined: Record<string, unknown> = {};
  for (const [field, fieldValue] of Object.entries(data)) {
    if (fieldValue !== undefined) {
      defined[field] = fieldValue;
    }
  }
  return defined;
};

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return value;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return undefined;
};

const matchesClause = (doc: StoredDoc, clause: WhereClause): boolean => {
  const current = doc[clause.field];
  const { value } = clause;
  switch (clause.operator) {
    case undefined:
    case "eq": {
      return current === value;
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const left = numberValue(current);
      const right = numberValue(value);
      if (left === undefined || right === undefined) {
        return false;
      }
      if (clause.operator === "gt") {
        return left > right;
      }
      if (clause.operator === "gte") {
        return left >= right;
      }
      if (clause.operator === "lt") {
        return left < right;
      }
      return left <= right;
    }
    case "in": {
      return Array.isArray(value) && value.includes(current);
    }
    case "ne": {
      return current !== value;
    }
    default: {
      throw validationError(`operator ${clause.operator}`);
    }
  }
};

const matchingDocs = (
  docs: StoredDoc[],
  where: WhereClause[] | undefined
): StoredDoc[] =>
  docs.filter((doc) =>
    (where ?? []).every((clause) => matchesClause(doc, clause))
  );

type MutationInput = z.infer<typeof mutationInputSchema>;

const insertRow = (
  rows: StoredDoc[],
  input: MutationInput,
  unique: string[] | undefined,
  nextId: () => number
): StoredDoc => {
  const data = definedData(input.data ?? {});
  assertFields(input.model, data);
  if (unique?.includes("identifier")) {
    const { identifier } = data;
    const identifierTaken =
      identifier !== undefined &&
      rows.some((doc) => doc.identifier === identifier);
    if (identifierTaken) {
      throw validationError("Unique identifier already exists");
    }
  }
  const doc: StoredDoc = {
    ...data,
    _creationTime: Date.now(),
    _id: `doc_${nextId()}`,
  };
  rows.push(doc);
  return doc;
};

const removeFirstMatch = (
  rows: StoredDoc[],
  where: WhereClause[] | undefined
): StoredDoc | null => {
  const index = rows.findIndex((doc) =>
    (where ?? []).every((clause) => matchesClause(doc, clause))
  );
  if (index === -1) {
    return null;
  }
  const [doc] = rows.splice(index, 1);
  return doc ?? null;
};

const removeMatches = (
  rows: StoredDoc[],
  where: WhereClause[] | undefined
): { continueCursor: string; count: number; isDone: true } => {
  const doomed = new Set(matchingDocs(rows, where));
  const remaining = rows.filter((doc) => !doomed.has(doc));
  rows.splice(0, rows.length, ...remaining);
  return { continueCursor: "", count: doomed.size, isDone: true };
};

const updateMatches = (
  rows: StoredDoc[],
  input: MutationInput,
  firstOnly: boolean
):
  | StoredDoc
  | { continueCursor: string; count: number; isDone: true }
  | null => {
  const update = definedData({
    ...input.update,
    ...input.set,
  });
  assertFields(input.model, update);
  const matches = matchingDocs(rows, input.where);
  const targets = firstOnly ? matches.slice(0, 1) : matches;
  for (const doc of targets) {
    Object.assign(doc, update);
  }
  if (firstOnly) {
    const [updated] = targets;
    return updated ?? null;
  }
  return { continueCursor: "", count: targets.length, isDone: true };
};

const incrementFirst = (
  rows: StoredDoc[],
  input: MutationInput
): StoredDoc | null => {
  const [target] = matchingDocs(rows, input.where);
  if (!target) {
    return null;
  }
  for (const [field, delta] of Object.entries(input.increment ?? {})) {
    const current = target[field];
    const base = typeof current === "number" ? current : 0;
    target[field] = base + delta;
  }
  Object.assign(
    target,
    definedData({
      ...input.update,
      ...input.set,
    })
  );
  return target;
};

const sortDocs = (
  docs: StoredDoc[],
  sortBy: z.infer<typeof sortBySchema> | undefined
): StoredDoc[] => {
  if (!sortBy) {
    return docs;
  }
  const { direction, field } = sortBy;
  return docs.toSorted((left, right) => {
    const a = left[field];
    const b = right[field];
    if (a === b) {
      return 0;
    }
    if (typeof a === "number" && typeof b === "number") {
      return direction === "asc" ? a - b : b - a;
    }
    if (typeof a === "string" && typeof b === "string") {
      return direction === "asc" ? a.localeCompare(b) : b.localeCompare(a);
    }
    return 0;
  });
};

const actionCtxSchema = z.custom<GenericActionCtx<GenericDataModel>>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "runMutation" in value &&
    "runQuery" in value
);

const adapterTargetSchema = z.custom<Parameters<typeof convexAdapter>[1]>(
  (value) => {
    if (typeof value !== "object" || value === null || !("adapter" in value)) {
      return false;
    }
    const { adapter } = value;
    if (typeof adapter !== "object" || adapter === null) {
      return false;
    }
    return adapterFnNames.every(
      (name) =>
        name in adapter && typeof Reflect.get(adapter, name) === "symbol"
    );
  }
);

const createMemoryAuth = (options?: MemoryAuthOptions) => {
  const tables = new Map<string, StoredDoc[]>();
  const calls: string[] = [];
  const sentCodes: string[] = [];
  let nextId = 0;
  const adapterFns: Record<AdapterFnName, symbol> = {
    consumeOne: Symbol("consumeOne"),
    create: Symbol("create"),
    deleteMany: Symbol("deleteMany"),
    deleteOne: Symbol("deleteOne"),
    findMany: Symbol("findMany"),
    findOne: Symbol("findOne"),
    incrementOne: Symbol("incrementOne"),
    updateMany: Symbol("updateMany"),
    updateOne: Symbol("updateOne"),
  };
  const fnBySymbol = new Map<symbol, AdapterFnName>(
    adapterFnNames.map((name) => [adapterFns[name], name])
  );

  const readTable = (model: string): StoredDoc[] => {
    const existing = tables.get(model);
    if (existing) {
      return existing;
    }
    const created: StoredDoc[] = [];
    tables.set(model, created);
    return created;
  };

  const recordCall = (fn: symbol, args: Record<string, unknown>): void => {
    assertNoModelKey(args);
    const name = fnBySymbol.get(fn);
    if (!name) {
      throw validationError("Unknown adapter function");
    }
    calls.push(name);
  };

  const runQuery = (query: symbol, args: Record<string, unknown>) => {
    recordCall(query, args);
    const parsed = queryArgsSchema.parse(args);
    assertWhere(parsed.model, parsed.where);
    const name = fnBySymbol.get(query);
    let docs = sortDocs(
      matchingDocs(readTable(parsed.model), parsed.where),
      parsed.sortBy
    );
    const limit = parsed.paginationOpts?.numItems ?? parsed.limit;
    if (limit !== undefined) {
      docs = docs.slice(0, limit);
    }
    if (name === "findOne") {
      return docs[0] ?? null;
    }
    if (name === "findMany") {
      return {
        continueCursor: "",
        isDone: true,
        page: docs,
      };
    }
    throw validationError("Unknown query");
  };

  const runMutation = (mutation: symbol, args: Record<string, unknown>) => {
    recordCall(mutation, args);
    const parsed = mutationArgsSchema.parse(args);
    const { input } = parsed;
    if (!input) {
      throw validationError("Missing mutation input");
    }
    const name = fnBySymbol.get(mutation);
    assertWhere(input.model, input.where);
    const rows = readTable(input.model);
    if (name === "create") {
      return insertRow(rows, input, parsed.unique, () => {
        nextId += 1;
        return nextId;
      });
    }
    if (name === "consumeOne" || name === "deleteOne") {
      return removeFirstMatch(rows, input.where);
    }
    if (name === "deleteMany") {
      return removeMatches(rows, input.where);
    }
    if (name === "incrementOne") {
      return incrementFirst(rows, input);
    }
    if (name === "updateOne" || name === "updateMany") {
      return updateMatches(rows, input, name === "updateOne");
    }
    throw validationError("Unknown mutation");
  };

  const ctx = actionCtxSchema.parse({ runMutation, runQuery });
  const api = adapterTargetSchema.parse({ adapter: adapterFns });

  const auth = betterAuth({
    baseURL,
    database: convexAdapter(ctx, api),
    emailAndPassword: {
      enabled: false,
    },
    logger: {
      disabled: true,
    },
    plugins: [
      emailOTP({
        changeEmail: {
          enabled: true,
        },
        expiresIn: SIGN_IN_CODE_EXPIRES_MINUTES * 60,
        sendVerificationOTP({ otp }) {
          sentCodes.push(otp);
          return Promise.resolve();
        },
      }),
      convex({ authConfig }),
    ],
    rateLimit: options?.databaseRateLimit
      ? {
          enabled: false,
          storage: "database",
        }
      : {
          enabled: false,
        },
    secret: "listwell-test-secret-listwell-test-secret",
    trustedOrigins: [baseURL],
  });

  return { auth, calls, sentCodes, tables };
};

type MemoryAuth = ReturnType<typeof createMemoryAuth>;

const authRequest = (path: string, init?: RequestInit): Request =>
  new Request(`${baseURL}${path}`, init);

const postJson = (path: string, body: Record<string, string>): Request =>
  authRequest(path, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin: baseURL,
    },
    method: "POST",
  });

const requireGeneratedCode = (sentCodes: string[]): string => {
  const [code] = sentCodes;
  if (code === undefined || !/^\d{6}$/u.test(code)) {
    throw new Error("Expected the sign-in code generator to return a code");
  }
  return code;
};

const sendSignInCode = async (memory: MemoryAuth): Promise<string> => {
  const response = await memory.auth.handler(
    postJson("/api/auth/email-otp/send-verification-otp", {
      email: testEmail,
      type: "sign-in",
    })
  );
  if (response.status !== 200) {
    throw new Error(`Sending a sign-in code returned ${response.status}`);
  }
  return requireGeneratedCode(memory.sentCodes);
};

const signInWithCode = (memory: MemoryAuth, code: string): Promise<Response> =>
  memory.auth.handler(
    postJson("/api/auth/sign-in/email-otp", {
      email: testEmail,
      otp: code,
    })
  );

const sessionCookie = (response: Response): string => {
  const header = response.headers.getSetCookie().join("\n");
  const match = /(?:^|\n)(?<cookie>[^;\n]*session_token=[^;\n]*)/u.exec(header);
  return match?.groups?.cookie ?? "";
};

const hasSessionCookie = (response: Response): boolean =>
  sessionCookie(response).includes("session_token=");

const readErrorCode = async (response: Response): Promise<string> => {
  if (response.status >= 500) {
    throw new Error(`Auth returned ${response.status}`);
  }
  const body: unknown = await response.json();
  const parsed = errorResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`Auth returned ${response.status} without an error code`);
  }
  return parsed.data.code;
};

const readSignInEmail = async (response: Response): Promise<string> => {
  if (response.status !== 200) {
    throw new Error(`Sign-in returned ${response.status}`);
  }
  const body: unknown = await response.json();
  const parsed = signInResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("Sign-in response did not include the user");
  }
  return parsed.data.user.email;
};

describe("Convex adapter modelKey", () => {
  it("drops modelKey from Convex adapter calls", async () => {
    const memory = createMemoryAuth({ databaseRateLimit: true });
    const { adapter } = await memory.auth.$context;
    const created = createdRowSchema.parse(
      await adapter.create({
        data: {
          createdAt: new Date(),
          email: testEmail,
          emailVerified: false,
          name: "Ada",
          updatedAt: new Date(),
        },
        model: "user",
      })
    );
    await adapter.findOne({
      model: "user",
      where: [{ field: "id", value: created.id }],
    });
    await adapter.findMany({
      model: "user",
      where: [{ field: "email", value: testEmail }],
    });
    await adapter.count({ model: "user" });
    await adapter.update({
      model: "user",
      update: { name: "Ada Lovelace" },
      where: [{ field: "id", value: created.id }],
    });
    await adapter.updateMany({
      model: "user",
      update: { name: "Ada" },
      where: [{ field: "email", value: testEmail }],
    });
    await adapter.delete({
      model: "verification",
      where: [{ field: "identifier", value: "missing" }],
    });
    await adapter.deleteMany({
      model: "verification",
      where: [{ field: "identifier", value: "missing" }],
    });
    const consumed = await adapter.consumeOne({
      model: "verification",
      where: [{ field: "identifier", value: "missing" }],
    });
    const incremented = await adapter.incrementOne({
      increment: { count: 1 },
      model: "rateLimit",
      where: [{ field: "key", value: "missing" }],
    });
    expect(consumed).toBeNull();
    expect(incremented).toBeNull();
    expect(memory.calls).toStrictEqual([
      "create",
      "findOne",
      "findMany",
      "findMany",
      "updateOne",
      "findMany",
      "updateMany",
      "deleteOne",
      "deleteMany",
      "consumeOne",
      "incrementOne",
    ]);
  });

  it("consumes one verification row atomically", async () => {
    const memory = createMemoryAuth();
    const { adapter } = await memory.auth.$context;
    const created = createdRowSchema.parse(
      await adapter.create({
        data: {
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          identifier: "sign-in-otp-person@example.com",
          updatedAt: new Date(),
          value: "stored-value:0",
        },
        model: "verification",
      })
    );
    const where = [{ field: "id", value: created.id }];
    const [first, second] = await Promise.all([
      adapter.consumeOne({ model: "verification", where }),
      adapter.consumeOne({ model: "verification", where }),
    ]);
    const winners = [first, second].filter((row) => row !== null);
    expect(winners).toHaveLength(1);
    expect(memory.tables.get("verification") ?? []).toHaveLength(0);
    expect(memory.calls.filter((call) => call === "consumeOne")).toHaveLength(
      2
    );
  });
});

describe("email OTP sign-in", () => {
  it("signs in a pending verification without an empty 500", async () => {
    const memory = createMemoryAuth();
    const code = await sendSignInCode(memory);
    expect(memory.tables.get("verification")).toHaveLength(1);

    const response = await signInWithCode(memory, code);
    expect(response.status).toBe(200);
    await expect(readSignInEmail(response)).resolves.toBe(testEmail);
    expect(hasSessionCookie(response)).toBeTruthy();
  });

  it("rejects a wrong code for a pending verification without an empty 500", async () => {
    const memory = createMemoryAuth();
    await sendSignInCode(memory);
    expect(memory.tables.get("verification")).toHaveLength(1);

    const response = await signInWithCode(memory, "000000");
    expect(response.status).toBe(400);
    await expect(readErrorCode(response)).resolves.toBe("INVALID_OTP");
    expect(hasSessionCookie(response)).toBeFalsy();
  });

  it("signs in with a valid code and get-session returns that user", async () => {
    const memory = createMemoryAuth();
    const code = await sendSignInCode(memory);
    const response = await signInWithCode(memory, code);
    const email = await readSignInEmail(response);
    expect(email).toBe(testEmail);
    expect(hasSessionCookie(response)).toBeTruthy();
    expect(memory.tables.get("session")).toHaveLength(1);
    expect(memory.tables.get("verification") ?? []).toHaveLength(0);
  });

  it("returns the signed-in user from get-session", async () => {
    const memory = createMemoryAuth();
    const code = await sendSignInCode(memory);
    const response = await signInWithCode(memory, code);
    const cookie = sessionCookie(response);
    const session = await memory.auth.handler(
      authRequest("/api/auth/get-session", {
        headers: { cookie },
      })
    );
    expect(session.status).toBe(200);
    const sessionBody: unknown = await session.json();
    const parsed = sessionResponseSchema.safeParse(sessionBody);
    if (!parsed.success) {
      throw new Error("get-session did not return the signed-in user");
    }
    expect(parsed.data.user.email).toBe(testEmail);

    const anonymous = await memory.auth.handler(
      authRequest("/api/auth/get-session")
    );
    expect(anonymous.status).toBe(200);
    await expect(anonymous.json()).resolves.toBeNull();
  });

  it("rejects a reused code without a second session", async () => {
    const memory = createMemoryAuth();
    const code = await sendSignInCode(memory);
    const first = await signInWithCode(memory, code);
    await expect(readSignInEmail(first)).resolves.toBe(testEmail);

    const second = await signInWithCode(memory, code);
    await expect(readErrorCode(second)).resolves.toBe("INVALID_OTP");
    expect(hasSessionCookie(second)).toBeFalsy();
    expect(memory.tables.get("session")).toHaveLength(1);
  });

  it("rejects an expired code without a session", async () => {
    const memory = createMemoryAuth();
    await sendSignInCode(memory);
    const verification = memory.tables.get("verification")?.[0];
    if (!verification) {
      throw new Error("Expected a stored verification row");
    }
    verification.expiresAt = Date.now() - 60_000;

    const response = await signInWithCode(
      memory,
      requireGeneratedCode(memory.sentCodes)
    );
    await expect(readErrorCode(response)).resolves.toBe("OTP_EXPIRED");
    expect(hasSessionCookie(response)).toBeFalsy();
    expect(memory.tables.get("session") ?? []).toHaveLength(0);
    expect(memory.tables.get("user") ?? []).toHaveLength(0);
  });

  it("rejects an invalid code without a raw server error", async () => {
    const memory = createMemoryAuth();
    await sendSignInCode(memory);
    const response = await signInWithCode(memory, "000000");
    await expect(readErrorCode(response)).resolves.toBe("INVALID_OTP");
    expect(hasSessionCookie(response)).toBeFalsy();
    expect(memory.tables.get("user") ?? []).toHaveLength(0);
    expect(memory.tables.get("session") ?? []).toHaveLength(0);

    const missing = await signInWithCode(createMemoryAuth(), "000000");
    await expect(readErrorCode(missing)).resolves.toBe("INVALID_OTP");
  });

  it("lets only one of two concurrent sign-ins create a session", async () => {
    const memory = createMemoryAuth();
    const code = await sendSignInCode(memory);
    const [first, second] = await Promise.all([
      signInWithCode(memory, code),
      signInWithCode(memory, code),
    ]);
    const outcomes = await Promise.all(
      [first, second].map(async (response) => {
        if (response.status === 200 && hasSessionCookie(response)) {
          return "signed-in";
        }
        const errorCode = await readErrorCode(response);
        return errorCode === "INVALID_OTP" ? "rejected" : "other";
      })
    );
    expect(outcomes.filter((outcome) => outcome === "signed-in")).toHaveLength(
      1
    );
    expect(outcomes.filter((outcome) => outcome === "rejected")).toHaveLength(
      1
    );
    expect(memory.tables.get("session")).toHaveLength(1);
    expect(memory.tables.get("user")).toHaveLength(1);
  });
});
