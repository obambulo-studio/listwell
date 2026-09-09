import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CHECK_RUNNERS } from "../src/checks";
import {
  CHECK_DEFINITIONS,
  CHECK_IDS,
  checksForCategory,
  isQueuedCheck,
} from "../src/registry";
import { checkIdSchema } from "../src/schemas";

const contentDir = path.join(import.meta.dirname, "../../../content/checks");

describe("check registry", () => {
  it("covers every content/checks markdown id", () => {
    const markdownIds = readdirSync(contentDir)
      .flatMap((name) =>
        name.endsWith(".md") ? [name.replace(/\.md$/u, "")] : []
      )
      .toSorted();

    expect([...CHECK_IDS].toSorted()).toStrictEqual(markdownIds);
  });

  it("has a runner for every check id", () => {
    for (const id of checkIdSchema.options) {
      expect(CHECK_RUNNERS[id]).toBeTypeOf("function");
      expect(CHECK_DEFINITIONS[id].id).toBe(id);
    }
  });

  it("only queues website-performance", () => {
    expect(CHECK_IDS.filter(isQueuedCheck)).toStrictEqual([
      "website-performance",
    ]);
  });

  it("scopes food-delivery and menu checks to food businesses", () => {
    const foodIds = new Set(checksForCategory("food").map((check) => check.id));
    const servicesIds = new Set(
      checksForCategory("services").map((check) => check.id)
    );

    expect({
      foodDelivery: foodIds.has("uber-eats-listing"),
      foodMenu: foodIds.has("website-menu-jsonld"),
      linkedInOnFood: foodIds.has("linkedin-profile"),
      linkedInOnServices: servicesIds.has("linkedin-profile"),
    }).toStrictEqual({
      foodDelivery: true,
      foodMenu: true,
      linkedInOnFood: false,
      linkedInOnServices: true,
    });
  });
});
