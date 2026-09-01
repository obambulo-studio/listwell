<script setup lang="ts">
import { z } from 'zod';

const route = useRoute();
const id = route.params.id as string;

const { data: business } = await useFetch<Business>(`/api/businesses/${id}`);

if (!business.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Business not found'
  })
}

const { data: checkContent } = await useAsyncData('checkContent', async () => {
  const checkContent = await queryCollection('checks')
    .all()

  return checkContent.filter(check => check.businessCategories?.includes(business.value!.category) || check.businessCategories === null)
})

const resultSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('check'),
    label: z.string().optional(),
    value: z.boolean().nullable().default(null),
  }),
])

const checkSchema = z.object({
  id: z.string(),
  title: z.string(),
  channelCategory: z.string(),
  status: z.enum(['idle', 'pending', 'pass', 'fail', 'error']),
  result: resultSchema.nullable().default(null),
  startTime: z.number().optional(), // Timestamp when check started
  endTime: z.number().optional(), // Timestamp when check completed
  duration: z.number().optional(), // Duration in milliseconds
  points: z.number().default(0),
  content: z.any()
})

type Check = z.infer<typeof checkSchema>

const checks = ref<Check[]>([])
const addCheck = async (title: string, checkId: string, channelCategory: string, points: any, content: any) => {
  const startTime = Date.now()
  const check: Ref<Check> = ref(checkSchema.parse({
    id: checkId,
    title,
    channelCategory,
    status: 'pending',
    startTime,
    points: points[business.value!.category] || 0,
    content
  }))
  checks.value.push(unref(check))
  try {
    const result = await $fetch(`/api/businesses/${id}/checks/${checkId}`)
    const endTime = Date.now()
    check.value.endTime = endTime
    check.value.duration = endTime - startTime
    check.value.result = resultSchema.parse(result)
    // Set status based on result value
    if (check.value.result?.type === 'check') {
      check.value.status = check.value.result.value === true ? 'pass' : 'fail'
    } else {
      check.value.status = 'error'
    }
  } catch (error) {
    console.error('Error adding check:', error)
    check.value.status = 'error'
    const endTime = Date.now()
    check.value.endTime = endTime
    check.value.duration = endTime - startTime
  }
}

const refreshChecks = () => {
  if (!checkContent.value) return;

  checks.value = []

  checkContent.value.forEach(checkContentItem => {
    addCheck(checkContentItem.title, checkContentItem.path.split('/').pop()!, checkContentItem.channelCategory, checkContentItem.points, checkContentItem)
  })
}
watchEffect(refreshChecks)

// Organize checks by channel
const channelChecks = computed<Record<string, Check[]>>(() => {
  const channels: Record<string, Check[]> = {}

  // Group checks by channel
  checks.value.forEach(check => {
    const channelName = check.channelCategory
    if (!channels[channelName]) {
      channels[channelName] = []
    }
    channels[channelName].push(check)
  })

  return channels
})

// Track total time taken for all checks (end of last check - start of first check)
const totalCheckTime = computed(() => {
  const completedChecks = checks.value.filter(check => check.startTime !== undefined && check.endTime !== undefined)
  if (completedChecks.length === 0) return 0

  const firstStartTime = Math.min(...completedChecks.map(check => check.startTime || Infinity))
  const lastEndTime = Math.max(...completedChecks.map(check => check.endTime || 0))

  return lastEndTime - firstStartTime
})

// Selection state for the tree
const selectedCheckId = ref<string | undefined>(undefined)
const selectedCheck = computed(() => {
  return checks.value.find(c => c.id === selectedCheckId.value)
})

// Transform checks into tree structure with custom sorting
const treeData = computed(() => {
  const sortedChannels = Object.entries(channelChecks.value).map(([channelName, channelChecks]) => {
    // Sort checks within each channel
    const sortedChecks = [...channelChecks].sort((a, b) => {
      // Status priority: pending → failed → errored → passed
      const statusOrder = { pending: 0, fail: 1, error: 2, pass: 3, idle: 4 }
      const statusDiff = (statusOrder[a.status] || 4) - (statusOrder[b.status] || 4)

      if (statusDiff !== 0) return statusDiff

      // Within same status, sort by highest points to lowest
      return b.points - a.points
    })

    // Calculate channel score
    const totalPoints = channelChecks.reduce((acc, check) => acc + check.points, 0)
    const passedPoints = channelChecks.reduce((acc, check) => acc + (check.status === 'pass' ? check.points : 0), 0)

    return {
      label: channelName,
      value: channelName,
      totalPoints,
      passedPoints,
      checks: sortedChecks
    }
  }).sort((a, b) => {
    return a.label.localeCompare(b.label)
  })

  return sortedChannels
})

const getCheckIcon = (status: string) => {
  switch (status) {
    case 'fail': return 'lucide-x'
    case 'pass': return 'lucide-check'
    case 'error': return 'lucide-bug'
    case 'pending': return 'lucide-loader'
    default: return 'lucide-help-circle'
  }
}

const getCheckIconColor = (status: string) => {
  switch (status) {
    case 'pass': return 'text-success-500/70'
    case 'fail': return 'text-error-500'
    case 'error': return 'text-warning-500'
    case 'pending': return 'text-primary-500 animate-spin'
    default: return 'text-gray-500'
  }
}

const colorMode = useColorMode();
let originalColorMode: string;
const beforePrint = (...args: any[]) => {
  if (!import.meta.client) return;

  originalColorMode = colorMode.preference;
  colorMode.preference = 'light';
}

const afterPrint = () => {
  if (!import.meta.client) return;

  colorMode.preference = originalColorMode;
}

onMounted(() => {
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeprint', beforePrint);
  window.removeEventListener('afterprint', afterPrint);
})

const print = () => {
  if (!import.meta.client) return;

  // Remove the event listener to prevent duplicate calls
  window.removeEventListener('beforeprint', beforePrint);
  beforePrint();

  // Wait for the next tick to ensure DOM updates
  nextTick(() => {
    window.print();

    window.addEventListener('beforeprint', beforePrint);
  });
}

// Utility functions still needed for the template
const formatTime = (time: number) => {
  if (time < 1000) {
    return `${time}ms`
  }
  return `${(time / 1000).toFixed(1)}s`
}

// For A4 styling
const todayDate = new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

// Get status colors for semantic UI
const getStatusColor = (status: string) => {
  switch (status) {
    case 'pass': return 'success'
    case 'fail': return 'error'
    case 'error': return 'warning'
    case 'pending': return 'neutral'
    default: return 'neutral'
  }
}

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'pass': return 'Pass'
    case 'fail': return 'Fail'
    case 'error': return 'Error'
    case 'pending': return 'Pending'
    default: return 'Unknown'
  }
}

const getCheckItemClasses = (check: any) => {
  if (check.id == selectedCheckId.value) {
    return 'text-primary bg-elevated'
  }

  switch (check.status) {
    case 'fail': return 'text-gray-900 dark:text-white'
    default: return 'text-gray-500 dark:text-gray-400'
  }
}

const checksAsSelectItems = computed(() => {
  if (!channelChecks.value) return []

  return Object.entries(channelChecks.value).flatMap(([categoryName, channels]) =>
    [{
      type: 'label' as const,
      label: categoryName,
    }, ...channels.map(check => ({
      label: check.title,
      value: check.id,
      icon: getCheckIcon(check.status),
      type: 'item' as const,
      ui: {
        itemLeadingIcon: getCheckIconColor(check.status),
      }
    })), {
      type: 'separator' as const
    }]
  )
})

const completedChecksPayload = computed(() =>
  checks.value
    .filter(check => check.status === 'pass' || check.status === 'fail' || check.status === 'error')
    .map(check => ({
      id: check.id,
      title: check.title,
      channelCategory: check.channelCategory,
      status: check.status,
      points: check.points,
      label: check.result?.label,
    }))
)

const checksFinished = computed(() =>
  checks.value.length > 0 &&
  checks.value.every(check => check.status !== 'pending' && check.status !== 'idle')
)

const auditSummary = ref<AuditSummaryResult | null>(null)
const summaryLoading = ref(false)

watch(checksFinished, async (finished) => {
  if (!finished) {
    auditSummary.value = null
    return
  }

  summaryLoading.value = true
  try {
    const response = await $fetch(`/api/businesses/${id}/summary`, {
      method: 'POST',
      body: { checks: completedChecksPayload.value },
    })
    auditSummary.value = auditSummaryResultSchema.parse(response)
  }
  catch (error) {
    console.error('Error loading Listwell summary:', error)
    auditSummary.value = buildFallbackSummary(
      z.array(completedCheckSchema).parse(completedChecksPayload.value),
      'model_request_failed',
    )
  }
  finally {
    summaryLoading.value = false
  }
})
</script>

<template>
  <UContainer as="main" v-if="business" class="py-6">
    <!-- Print-only layout -->
    <div class="hidden print:block">
      <!-- Print header -->
      <div class="mb-8 border-b pb-4">
        <h1 class="text-2xl font-bold font-display tracking-tight">{{ business.name }}</h1>
        <p class="text-sm text-gray-600">Generated on {{ todayDate }}</p>
      </div>

      <AuditExecutiveSummary
        class="mb-8 break-inside-avoid"
        :summary="auditSummary"
        :loading="summaryLoading"
        :checks-finished="checksFinished"
        :checks="checks"
        @select-check="selectedCheckId = $event"
      />

      <!-- Page break before detailed sections -->
      <div class="page-break"></div>

      <!-- All checks expanded for print -->
      <div v-for="[channelName, channelChecks] in Object.entries(channelChecks)" :key="channelName"
        class="mb-8 break-inside-avoid">
        <h2 class="text-lg font-bold mb-4 border-b pb-2">{{ channelName }}</h2>

        <div v-for="check in channelChecks" :key="check.id" class="mb-6 break-inside-avoid">
          <div class="flex items-center gap-2 mb-2">
            <UIcon :name="getCheckIcon(check.status)" :class="getCheckIconColor(check.status)" />
            <h3 class="font-semibold">{{ check.title }}</h3>
            <UBadge :color="getStatusColor(check.status)" variant="soft" class="capitalize">
              {{ getStatusLabel(check.status) }}
            </UBadge>
            <span class="text-xs text-gray-500">({{ check.points }} points)</span>
          </div>

          <div v-if="check.result?.label" class="text-sm italic text-gray-600 mb-2">
            {{ check.result.label }}
          </div>

          <ContentRenderer v-if="check.content" :value="check.content" tag="article"
            class="prose prose-xs max-w-none print-content" :prose="false" />
        </div>
      </div>
    </div>

    <!-- Screen-only layout -->
    <div class="print:hidden">
      <UBreadcrumb :items="[
        {
          label: 'Home',
          icon: 'i-lucide-house',
          to: '/'
        },
        {
          label: business.name,
          icon: 'i-lucide-building',
          to: `/${business.id}/`
        }
      ]" />

      <div class="flex max-md:flex-col md:items-center justify-between mt-2 gap-3">
        <h1 class="text-4xl font-bold text-gray-900 dark:text-white font-display tracking-tight">{{ business.name }}</h1>

        <div class="flex items-center gap-2">
          <UButton icon="i-lucide-download" color="neutral" variant="ghost" aria-label="Download PDF" @click="print()">
            Download / Print
          </UButton>

          <UButton icon="i-lucide-pencil" color="neutral" variant="soft" :to="`/${business.id}/edit/`">
            Edit
          </UButton>
        </div>
      </div>

      <AuditExecutiveSummary
        class="mt-10"
        :summary="auditSummary"
        :loading="summaryLoading"
        :checks-finished="checksFinished"
        :checks="checks"
        @select-check="selectedCheckId = $event"
      />

      <div class="grid grid-cols-1 gap-8 mt-8">
        <UCard variant="subtle">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-xl font-bold">{{ business.name }}</h2>

            <UButton icon="i-lucide-pencil" color="neutral" variant="link" :to="`/${business.id}/edit/`">
              Edit
            </UButton>
          </div>

          <div class="mt-4 space-y-4">
            <BusinessChannels :business="business">
              <UBadge color="neutral" variant="subtle" class="text-sm" leading-icon="i-lucide-tag">
                {{ business.category }}
              </UBadge>
            </BusinessChannels>

            <div v-if="business.locations?.length" class="space-y-3">
              <div class="space-y-2">
                <div v-for="location in business.locations" :key="location.id" class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div v-if="location.name" class="font-medium text-sm">{{ location.name }}
                    <span class="inline-flex items-center gap-4 ml-1 text-xs text-gray-500">
                    <span v-if="location.googlePlaceId" class="flex items-center gap-1">
                      <UIcon :name="CHANNEL_CONFIG['google-maps']['icon']" class="size-3" :class="CHANNEL_CONFIG['google-maps']['iconColor']" />
                      Google Maps
                    </span>
                    <span v-if="location.appleMapsId"  class="flex items-center gap-1">
                      <UIcon :name="CHANNEL_CONFIG['apple-maps']['icon']" class="size-3" :class="CHANNEL_CONFIG['apple-maps']['iconColor']" />
                      Apple Maps
                    </span>
                  </span>
                  </div>
                  <div v-if="location.address" class="text-sm text-gray-600 dark:text-gray-400">{{ location.address }}</div>
                  
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <UCard variant="subtle">
          <div class="flex max-md:flex-col gap-12">
            <!-- Left Column: Tree View -->
            <div class="md:shrink-0 md:w-sm flex flex-col gap-4">
              <div class="flex items-center justify-between">
                <h3 class="text-lg font-semibold">Checks</h3>
                <UButton icon="i-lucide-refresh-ccw" color="neutral" variant="subtle" size="sm" @click="refreshChecks"
                  aria-label="Refresh checks">
                  Refresh
                </UButton>
              </div>

              <UAccordion type="multiple" :default-value="channelChecks ? Object.keys(channelChecks) : []"
                :items="treeData" class="max-md:hidden">
                <template #default="{ item }">
                  <span class="text-sm font-semibold text-gray-600 dark:text-gray-400">{{ item.label }}</span>
                  <UBadge :color="item.passedPoints === item.totalPoints ? 'success' : 'warning'" variant="soft"
                    class="ml-3">
                    {{ Math.round(item.passedPoints / item.totalPoints * 100) }}
                  </UBadge>
                </template>

                <template #content="{ item }">
                  <div class="flex flex-col">
                    <button type="button" v-for="check in item.checks" :key="check.id"
                      class="flex items-center gap-1.5 py-1.5 px-2 text-sm font-semibold rounded-lg hover:bg-elevated w-full"
                      @click="selectedCheckId = check.id" :class="[getCheckItemClasses(check)]">
                      <UIcon :name="getCheckIcon(check.status)" :class="getCheckIconColor(check.status)" />
                      <span class="truncate">{{ check.title }}</span>
                    </button>
                  </div>
                </template>
              </UAccordion>
            </div>

            <USelect v-model="selectedCheckId" :items="checksAsSelectItems" placeholder="Select a check"
              class="md:hidden sticky top-3" size="xl" :clearable="false" />

            <!-- Right Column: Details Panel -->
            <div class="w-full">
              <div v-if="!selectedCheck" class="flex items-center justify-center h-full text-center">
                <div class="text-gray-500 dark:text-gray-400">
                  <UIcon name="i-lucide-mouse-pointer-click" class="size-8 mx-auto mb-2" />
                  <p class="text-sm">Select a check from the <span class="max-md:hidden">tree</span><span
                      class="md:hidden">dropdown</span> to view details</p>
                </div>
              </div>

              <div v-else class="space-y-4">
                <!-- Check Header -->
                <div class="border-b border-gray-100 dark:border-gray-800 pb-4">
                  <div class="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <span>{{ selectedCheck.channelCategory }}</span>
                    <span>{{ selectedCheck.points }} points</span>
                    <UBadge :color="getStatusColor(selectedCheck.status)" variant="soft" class="capitalize">
                      {{ getStatusLabel(selectedCheck.status) }}
                    </UBadge>
                    <span v-if="selectedCheck.duration">{{ formatTime(selectedCheck.duration) }}</span>
                  </div>

                  <div v-if="selectedCheck.result?.label" class="mt-2 text-sm italic text-gray-600 dark:text-gray-400">
                    {{ selectedCheck.result.label }}
                  </div>
                </div>

                <ContentRenderer v-if="selectedCheck" :value="selectedCheck.content" tag="article"
                  class="prose prose-sm dark:prose-invert" :prose="false" />

                <div v-else class="text-sm text-gray-500 dark:text-gray-400 italic">
                  No additional information available for this check.
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </UContainer>
</template>

<style>
@page {
  margin: 1in;
  size: A4;
}

@media print {
  .page-break {
    page-break-before: always;
  }

  .break-inside-avoid {
    break-inside: avoid;
  }

  .print-content h1,
  .print-content h2,
  .print-content h3 {
    break-after: avoid;
  }

  .print-content {
    font-size: 11px;
    line-height: 1.4;
  }

  .print-content p {
    margin-bottom: 0.5rem;
  }

  .print-content ul,
  .print-content ol {
    margin-bottom: 0.5rem;
  }

  .print-content li {
    margin-bottom: 0.25rem;
  }
}
</style>