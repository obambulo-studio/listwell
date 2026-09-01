import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CHECK_DEFINITIONS, CHECK_IDS, checksForCategory, isQueuedCheck } from '../src/registry'
import { CHECK_RUNNERS } from '../src/checks'
import { checkIdSchema } from '../src/schemas'

const contentDir = join(dirname(fileURLToPath(import.meta.url)), '../../../content/checks')

describe('check registry', () => {
  it('covers every content/checks markdown id', () => {
    const markdownIds = readdirSync(contentDir)
      .filter((name) => name.endsWith('.md'))
      .map((name) => name.replace(/\.md$/, ''))
      .sort()

    expect([...CHECK_IDS].sort()).toEqual(markdownIds)
  })

  it('has a runner for every check id', () => {
    for (const id of checkIdSchema.options) {
      expect(CHECK_RUNNERS[id]).toBeTypeOf('function')
      expect(CHECK_DEFINITIONS[id].id).toBe(id)
    }
  })

  it('only queues website-performance', () => {
    expect(CHECK_IDS.filter(isQueuedCheck)).toEqual(['website-performance'])
  })

  it('scopes food-delivery and menu checks to food businesses', () => {
    const foodIds = checksForCategory('food').map((check) => check.id)
    const servicesIds = checksForCategory('services').map((check) => check.id)

    expect(foodIds).toContain('uber-eats-listing')
    expect(foodIds).toContain('website-menu-jsonld')
    expect(servicesIds).not.toContain('uber-eats-listing')
    expect(servicesIds).not.toContain('website-menu-jsonld')
    expect(servicesIds).toContain('linkedin-profile')
    expect(foodIds).not.toContain('linkedin-profile')
  })
})
