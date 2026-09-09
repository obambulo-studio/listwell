import { SignJWT, importPKCS8 } from "jose";
import { z } from "zod";

import type { AuditEngineEnv } from "../types";

const applePlaceSchema = z.object({
  coordinate: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .optional(),
  country: z.string().optional(),
  countryCode: z.string().optional(),
  formattedAddressLines: z.array(z.string()).optional(),
  id: z.string(),
  name: z.string(),
});

const appleSearchSchema = z.object({
  results: z.array(applePlaceSchema).default([]),
});

const tokenResponseSchema = z.object({
  accessToken: z.string(),
});

const decodePrivateKey = (value: string): string => {
  if (value.includes("BEGIN PRIVATE KEY")) {
    return value;
  }
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
  return new TextDecoder("utf-8").decode(bytes);
};

export const generateAppleMapKitToken = async (
  env: AuditEngineEnv
): Promise<string> => {
  if (
    !env.appleMapkitTeamId ||
    !env.appleMapkitKeyId ||
    !env.appleMapkitPrivateKey
  ) {
    throw new Error("Missing Apple MapKit configuration");
  }

  const privateKey = decodePrivateKey(env.appleMapkitPrivateKey);
  const issuedAt = Math.floor(Date.now() / 1000);

  return await new SignJWT({
    exp: issuedAt + 60 * 60,
    iat: issuedAt,
    iss: env.appleMapkitTeamId,
  })
    .setProtectedHeader({
      alg: "ES256",
      kid: env.appleMapkitKeyId,
      typ: "JWT",
    })
    .sign(await importPKCS8(privateKey, "ES256"));
};

const appleAccessToken = async (
  env: AuditEngineEnv,
  fetchImpl: typeof fetch
): Promise<string> => {
  const authorizationToken = await generateAppleMapKitToken(env);
  const response = await fetchImpl("https://maps-api.apple.com/v1/token", {
    headers: { Authorization: `Bearer ${authorizationToken}` },
  });
  const parsed = tokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("No access token received from Apple Maps API");
  }
  return parsed.data.accessToken;
};

export const searchAppleMaps = async (
  query: string,
  env: AuditEngineEnv,
  fetchImpl: typeof fetch = fetch,
  userLocation?: string
) => {
  if (query.length < 2) {
    return { results: [] };
  }

  const token = await appleAccessToken(env, fetchImpl);
  const params = new URLSearchParams({
    lang: "en",
    limitToCountries: "AU",
    q: `${query}, Australia`,
    resultTypeFilter: "PointOfInterest",
  });
  if (userLocation) {
    params.append("userLocation", userLocation);
  }

  const response = await fetchImpl(
    `https://maps-api.apple.com/v1/search?${params}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const parsed = appleSearchSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : { results: [] };
};

export const fetchApplePlace = async (
  id: string,
  env: AuditEngineEnv,
  fetchImpl: typeof fetch = fetch
) => {
  const token = await appleAccessToken(env, fetchImpl);
  const response = await fetchImpl(
    `https://maps-api.apple.com/v1/place/${id}?lang=en`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const parsed = applePlaceSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
};
