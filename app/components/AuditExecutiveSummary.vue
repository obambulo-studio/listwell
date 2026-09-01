<script setup lang="ts">
const props = defineProps<{
  summary: AuditSummaryResult | null
  loading: boolean
  checksFinished: boolean
  checks: Array<{ id: string, title: string }>
}>()

const emit = defineEmits<{
  selectCheck: [id: string]
}>()

const titlesById = computed(() => {
  const titles = new Map<string, string>()
  for (const check of props.checks) {
    titles.set(check.id, check.title)
  }
  return titles
})

const heading = computed(() => {
  if (!props.summary || props.summary.nextActions.length === 0) {
    return 'What the checks found'
  }
  return 'What should change first'
})

function titleFor(id: string): string {
  return titlesById.value.get(id) ?? id
}

function selectCheck(id: string) {
  emit('selectCheck', id)
}

const degradedCaption = computed(() => {
  if (!props.summary || props.summary.available) {
    return null
  }

  if (props.summary.degradedReason === 'ai_binding_missing') {
    return 'Listwell wrote this from the completed checks. Workers AI is not bound on this deploy.'
  }

  if (props.summary.degradedReason === 'no_completed_checks') {
    return 'The brief appears when a check has finished.'
  }

  return 'Listwell wrote this from the completed checks after Workers AI could not return a cited brief.'
})
</script>

<template>
  <section v-if="checksFinished || loading || summary" class="max-w-3xl">
    <h2 class="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
      {{ heading }}
    </h2>

    <p v-if="loading && !summary" class="mt-3 text-base text-gray-600 dark:text-gray-400">
      Listwell is writing the brief from the completed checks.
    </p>

    <template v-else-if="summary">
      <div v-if="summary.overview.length" class="mt-3 space-y-3 text-base leading-7 text-gray-800 dark:text-gray-200">
        <p v-for="(claim, index) in summary.overview" :key="`${claim.text}-${index}`">
          {{ claim.text }}
          <span class="block mt-1 text-sm text-gray-500 dark:text-gray-400">
            From
            <template v-for="(checkId, citationIndex) in claim.checkIds" :key="checkId">
              <button
                type="button"
                class="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
                @click="selectCheck(checkId)"
              >
                {{ titleFor(checkId) }}
              </button>
              <span v-if="citationIndex < claim.checkIds.length - 1">, </span>
            </template>
          </span>
        </p>
      </div>

      <ol v-if="summary.nextActions.length" class="mt-6 space-y-4">
        <li
          v-for="action in summary.nextActions"
          :key="`${action.priority}-${action.text}`"
          class="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3"
        >
          <span class="text-sm tabular-nums text-gray-500 dark:text-gray-400 pt-0.5">
            {{ action.priority }}
          </span>
          <div>
            <p class="text-base leading-7 text-gray-900 dark:text-white">
              {{ action.text }}
            </p>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              From
              <template v-for="(checkId, citationIndex) in action.checkIds" :key="checkId">
                <button
                  type="button"
                  class="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
                  @click="selectCheck(checkId)"
                >
                  {{ titleFor(checkId) }}
                </button>
                <span v-if="citationIndex < action.checkIds.length - 1">, </span>
              </template>
            </p>
          </div>
        </li>
      </ol>

      <p v-else-if="summary.overview.length" class="mt-6 text-base text-gray-600 dark:text-gray-400">
        No failed checks to act on.
      </p>

      <p v-if="degradedCaption" class="mt-4 text-sm text-gray-500 dark:text-gray-400">
        {{ degradedCaption }}
      </p>
    </template>
  </section>
</template>
