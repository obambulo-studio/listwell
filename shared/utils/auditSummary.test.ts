import { describe, expect, it, vi } from 'vitest'
import {
  WORKERS_AI_MODEL,
  buildFallbackSummary,
  buildListwellPrompt,
  extractModelText,
  filterToCitedChecks,
  introducesInventedScore,
  parseJsonObject,
  resolveWorkersAiBinding,
  summarizeAuditChecks,
} from './auditSummary'

const checks = [
  {
    id: 'website-title',
    title: 'Title contains business name and suburb/city',
    channelCategory: 'Website',
    status: 'fail' as const,
    points: 6,
    label: 'Title missing location: "Smith & Sons"',
  },
  {
    id: 'website-200-299',
    title: 'Website returns a successful status',
    channelCategory: 'Website',
    status: 'pass' as const,
    points: 8,
  },
  {
    id: 'google-listing-photos',
    title: 'Google listing has photos',
    channelCategory: 'Google Business Profile',
    status: 'fail' as const,
    points: 4,
  },
]

describe('resolveWorkersAiBinding', () => {
  it('returns the first candidate with a run function', () => {
    const ai = { run: vi.fn() }
    expect(resolveWorkersAiBinding(undefined, null, {}, ai)).toBe(ai)
  })

  it('returns null when the AI binding is missing', () => {
    expect(resolveWorkersAiBinding(undefined, null, { notAi: true })).toBeNull()
  })
})

describe('extractModelText and parseJsonObject', () => {
  it('reads Workers AI response shapes', () => {
    expect(extractModelText({ response: '{"ok":true}' })).toBe('{"ok":true}')
    expect(extractModelText({ result: { response: '{"ok":true}' } })).toBe('{"ok":true}')
  })

  it('strips markdown fences', () => {
    expect(parseJsonObject('```json\n{"overview":[]}\n```')).toEqual({ overview: [] })
  })
})

describe('citation and score guards', () => {
  it('drops claims that cite unknown checks', () => {
    const filtered = filterToCitedChecks({
      overview: [
        { text: 'Invented finding.', checkIds: ['not-a-check'] },
        { text: 'Title is missing the suburb.', checkIds: ['website-title'] },
      ],
      nextActions: [
        { text: 'Add photos.', checkIds: ['google-listing-photos'], priority: 1 },
      ],
    }, checks)

    expect(filtered?.overview).toEqual([
      { text: 'Title is missing the suburb.', checkIds: ['website-title'] },
    ])
    expect(filtered?.nextActions[0]?.checkIds).toEqual(['google-listing-photos'])
  })

  it('rejects invented percentages and scores', () => {
    expect(introducesInventedScore('Visibility score is 12%.', checks)).toBe(true)
    expect(introducesInventedScore('Title missing location: "Smith & Sons"', checks)).toBe(false)
    expect(introducesInventedScore('Highest listed weight is 6 points.', checks)).toBe(false)
  })

  it('returns null when every claim lacks a valid citation', () => {
    expect(filterToCitedChecks({
      overview: [{ text: 'All good.', checkIds: ['missing'] }],
      nextActions: [],
    }, checks)).toBeNull()
  })
})

describe('buildFallbackSummary', () => {
  it('prioritises failed checks by provided points and cites them', () => {
    const summary = buildFallbackSummary(checks, 'ai_binding_missing')

    expect(summary.available).toBe(false)
    expect(summary.source).toBe('fallback')
    expect(summary.degradedReason).toBe('ai_binding_missing')
    expect(summary.overview[0]?.checkIds).toEqual(['website-title', 'google-listing-photos'])
    expect(summary.nextActions.map(action => action.checkIds[0])).toEqual([
      'website-title',
      'google-listing-photos',
    ])
    expect(summary.overview[0]?.text).toBe(
      '2 checks did not pass. The highest-weight miss is Title contains business name and suburb/city.',
    )
    expect(summary.overview[0]?.text).not.toMatch(/points/i)
    expect(JSON.stringify(summary)).not.toMatch(/visimate/i)
  })

  it('does not invent an overall score when checks are empty', () => {
    const summary = buildFallbackSummary([], 'no_completed_checks')
    expect(summary.overview).toEqual([])
    expect(summary.nextActions).toEqual([])
    expect(summary.degradedReason).toBe('no_completed_checks')
  })
})

describe('summarizeAuditChecks', () => {
  it('degrades when the AI binding is missing', async () => {
    const summary = await summarizeAuditChecks({
      businessName: 'Smith & Sons',
      checks,
      ai: null,
    })

    expect(summary.degradedReason).toBe('ai_binding_missing')
    expect(summary.source).toBe('fallback')
  })

  it('keeps a cited Workers AI brief and drops invented scores', async () => {
    const ai = {
      run: vi.fn().mockResolvedValue({
        response: JSON.stringify({
          overview: [
            { text: 'The title is missing the suburb.', checkIds: ['website-title'] },
            { text: 'Overall score is 41%.', checkIds: ['website-title'] },
          ],
          nextActions: [
            { text: 'Add the suburb to the title.', checkIds: ['website-title'], priority: 1 },
          ],
        }),
      }),
    }

    const summary = await summarizeAuditChecks({
      businessName: 'Smith & Sons',
      checks,
      ai,
    })

    expect(ai.run).toHaveBeenCalledWith(WORKERS_AI_MODEL, expect.any(Object))
    expect(summary.available).toBe(true)
    expect(summary.source).toBe('workers-ai')
    expect(summary.overview.map(claim => claim.text)).toEqual([
      'The title is missing the suburb.',
    ])
    expect(summary.nextActions[0]?.checkIds).toEqual(['website-title'])
  })

  it('falls back when the model invents every claim', async () => {
    const summary = await summarizeAuditChecks({
      businessName: 'Smith & Sons',
      checks,
      ai: {
        run: vi.fn().mockResolvedValue({
          response: JSON.stringify({
            overview: [{ text: 'Score is 99%.', checkIds: ['nope'] }],
            nextActions: [],
          }),
        }),
      },
    })

    expect(summary.source).toBe('fallback')
    expect(summary.degradedReason).toBe('model_output_invalid')
  })

  it('falls back when the model request fails', async () => {
    const summary = await summarizeAuditChecks({
      businessName: 'Smith & Sons',
      checks,
      ai: {
        run: vi.fn().mockRejectedValue(new Error('binding unavailable')),
      },
    })

    expect(summary.degradedReason).toBe('model_request_failed')
  })
})

describe('Listwell copy', () => {
  it('names Listwell and never Visimate in the model prompt', () => {
    const prompt = buildListwellPrompt('Smith & Sons', checks)
    expect(prompt).toContain('Listwell')
    expect(prompt).toMatch(/Do not mention Visimate/)
    expect(prompt).not.toMatch(/You are Visimate/i)
  })
})
