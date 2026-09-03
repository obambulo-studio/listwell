import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { categoryIdSchema, type CategoryId } from "../category";
import type { DiscoveredProfile } from "../channel";
import { businessInputFromDiscovery } from "../profiles";
import {
  businessSchema,
  createBusinessRequestSchema,
  type Business,
  type CreateBusinessRequest,
  type UpdateBusinessRequest,
} from "../schema";
import * as schema from "./schema";

const { businesses, businessLocations } = schema;

type MemoryStore = {
  businesses: Map<string, Omit<Business, "locations">>;
  locations: Map<number, Business["locations"][number]>;
  nextLocationId: number;
};

declare global {
  var listwellMemory: MemoryStore | undefined;
}

const memory: MemoryStore = globalThis.listwellMemory ?? {
  businesses: new Map<string, Omit<Business, "locations">>(),
  locations: new Map<number, Business["locations"][number]>(),
  nextLocationId: 1,
};
globalThis.listwellMemory = memory;

function nowIso(): string {
  return new Date().toISOString();
}

function parseBusinessRow(row: typeof schema.businesses.$inferSelect, locations: Business["locations"]): Business {
  return businessSchema.parse({
    ...row,
    category: categoryIdSchema.parse(row.category),
    locations,
  });
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  website_url TEXT,
  facebook_url TEXT,
  instagram_username TEXT,
  tiktok_username TEXT,
  x_username TEXT,
  linkedin_url TEXT,
  youtube_url TEXT,
  uber_eats_url TEXT,
  door_dash_url TEXT,
  deliveroo_url TEXT,
  menulog_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS business_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  google_place_id TEXT,
  apple_maps_id TEXT,
  name TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

let schemaReady = false;
let injectedD1: D1Database | null | undefined;

export function setTestD1(db: D1Database | null | undefined): void {
  injectedD1 = db;
  schemaReady = false;
}

export function resetBusinessStoreForTests(): void {
  memory.businesses.clear();
  memory.locations.clear();
  memory.nextLocationId = 1;
  injectedD1 = undefined;
  schemaReady = false;
}

async function applySchema(db: D1Database): Promise<void> {
  if (schemaReady) {
    return;
  }
  await db.exec(SCHEMA_SQL);
  schemaReady = true;
}

async function getD1(): Promise<D1Database | null> {
  if (injectedD1 !== undefined) {
    if (injectedD1) {
      await applySchema(injectedD1);
    }
    return injectedD1;
  }
  if (process.env.SKIP_OPENNEXT_DEV === "1") {
    return null;
  }
  try {
    const context = await getCloudflareContext({ async: true });
    if (!context.env.DB) {
      return null;
    }
    await applySchema(context.env.DB);
    return context.env.DB;
  } catch {
    return null;
  }
}

export async function listBusinesses(ids: string[]): Promise<Business[]> {
  if (ids.length === 0) {
    return [];
  }

  const dbBinding = await getD1();
  if (!dbBinding) {
    return ids
      .map((id) => {
        const row = memory.businesses.get(id);
        if (!row) {
          return null;
        }
        const locations = [...memory.locations.values()].filter((location) => location.businessId === id);
        return businessSchema.parse({ ...row, locations });
      })
      .filter((business): business is Business => business !== null);
  }

  const db = drizzle(dbBinding, { schema });
  const rows = await db.query.businesses.findMany({
    where: inArray(businesses.id, ids),
    with: { locations: true },
  });
  return rows.map((row) => parseBusinessRow(row, row.locations));
}

export async function getBusiness(id: string): Promise<Business | null> {
  const [business] = await listBusinesses([id]);
  return business ?? null;
}

export async function createBusiness(input: CreateBusinessRequest): Promise<Business> {
  const data = createBusinessRequestSchema.parse(input);
  const id = data.id ?? crypto.randomUUID();
  const timestamp = nowIso();

  const dbBinding = await getD1();
  if (!dbBinding) {
    const row = {
      id,
      name: data.name,
      category: data.category,
      websiteUrl: data.websiteUrl ?? null,
      facebookUsername: data.facebookUsername ?? null,
      instagramUsername: data.instagramUsername ?? null,
      tiktokUsername: data.tiktokUsername ?? null,
      xUsername: data.xUsername ?? null,
      linkedinUrl: data.linkedinUrl ?? null,
      youtubeUrl: data.youtubeUrl ?? null,
      uberEatsUrl: data.uberEatsUrl ?? null,
      doorDashUrl: data.doorDashUrl ?? null,
      deliverooUrl: data.deliverooUrl ?? null,
      menulogUrl: data.menulogUrl ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    memory.businesses.set(id, row);
    const locations = data.locations.map((location) => {
      const record = {
        id: memory.nextLocationId,
        businessId: id,
        googlePlaceId: location.googlePlaceId ?? null,
        appleMapsId: location.appleMapsId ?? null,
        name: location.name ?? null,
        address: location.address ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      memory.locations.set(memory.nextLocationId, record);
      memory.nextLocationId += 1;
      return record;
    });
    return businessSchema.parse({ ...row, locations });
  }

  const db = drizzle(dbBinding, { schema });
  const [inserted] = await db
    .insert(businesses)
    .values({
      id,
      name: data.name,
      category: data.category,
      websiteUrl: data.websiteUrl,
      facebookUsername: data.facebookUsername,
      instagramUsername: data.instagramUsername,
      tiktokUsername: data.tiktokUsername,
      xUsername: data.xUsername,
      linkedinUrl: data.linkedinUrl,
      youtubeUrl: data.youtubeUrl,
      uberEatsUrl: data.uberEatsUrl,
      doorDashUrl: data.doorDashUrl,
      deliverooUrl: data.deliverooUrl,
      menulogUrl: data.menulogUrl,
    })
    .returning();

  if (!inserted) {
    throw new Error("Failed to create business");
  }

  if (data.locations.length > 0) {
    await db.insert(businessLocations).values(
      data.locations.map((location) => ({
        businessId: id,
        googlePlaceId: location.googlePlaceId,
        appleMapsId: location.appleMapsId,
        name: location.name,
        address: location.address,
      })),
    );
  }

  const created = await getBusiness(id);
  if (!created) {
    throw new Error("Failed to load created business");
  }
  return created;
}

export async function persistDiscoveredBusiness(input: {
  name: string;
  category: CategoryId;
  profiles: DiscoveredProfile[];
  address?: string;
}): Promise<Business> {
  return createBusiness(businessInputFromDiscovery(input.name, input.category, input.profiles, input.address));
}

export async function updateBusiness(id: string, input: UpdateBusinessRequest): Promise<Business> {
  const existing = await getBusiness(id);
  if (!existing) {
    throw new Error("Business not found");
  }

  const timestamp = nowIso();
  const dbBinding = await getD1();
  if (!dbBinding) {
    const next = {
      ...existing,
      ...input,
      category: input.category ?? existing.category,
      updatedAt: timestamp,
    };
    const { locations: nextLocations, ...row } = next;
    memory.businesses.set(id, row);
    if (input.locations) {
      for (const [locationId, location] of memory.locations) {
        if (location.businessId === id) {
          memory.locations.delete(locationId);
        }
      }
      for (const location of input.locations) {
        const record = {
          id: memory.nextLocationId,
          businessId: id,
          googlePlaceId: location.googlePlaceId ?? null,
          appleMapsId: location.appleMapsId ?? null,
          name: location.name ?? null,
          address: location.address ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        memory.locations.set(memory.nextLocationId, record);
        memory.nextLocationId += 1;
      }
    }
    const locations = [...memory.locations.values()].filter((location) => location.businessId === id);
    return businessSchema.parse({ ...row, locations: nextLocations ?? locations });
  }

  const db = drizzle(dbBinding, { schema });
  const { locations, ...businessData } = input;
  if (Object.keys(businessData).length > 0) {
    await db
      .update(businesses)
      .set({ ...businessData, updatedAt: timestamp })
      .where(eq(businesses.id, id));
  }

  if (locations) {
    await db.delete(businessLocations).where(eq(businessLocations.businessId, id));
    if (locations.length > 0) {
      await db.insert(businessLocations).values(
        locations.map((location) => ({
          businessId: id,
          googlePlaceId: location.googlePlaceId,
          appleMapsId: location.appleMapsId,
          name: location.name,
          address: location.address,
        })),
      );
    }
  }

  const updated = await getBusiness(id);
  if (!updated) {
    throw new Error("Failed to load updated business");
  }
  return updated;
}

export async function findLocationWithGooglePlace(businessId: string) {
  const dbBinding = await getD1();
  if (!dbBinding) {
    return [...memory.locations.values()].find(
      (location) => location.businessId === businessId && location.googlePlaceId,
    ) ?? null;
  }

  const db = drizzle(dbBinding, { schema });
  return db.query.businessLocations.findFirst({
    where: and(eq(businessLocations.businessId, businessId), isNotNull(businessLocations.googlePlaceId)),
  });
}

export const idListQuerySchema = z.object({
  ids: z.string().optional(),
});
