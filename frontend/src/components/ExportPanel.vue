<template>
  <div class="right-bottom">
    <button
      type="button"
      class="export-btn"
      :class="`export-btn--${cost?.kind || 'free'}`"
      :disabled="!hasChunks || loading"
      @click="$emit('export-package')"
    >
      <span class="export-btn__main">
        <Loader2Icon v-if="loading" :size="16" :stroke-width="2" class="animate-spin" />
        <DownloadIcon v-else :size="16" :stroke-width="2" />
        <span>{{ loading ? labels.preparing : labels.downloadPackage }}</span>
      </span>
      <span v-if="hasChunks && !loading && cost?.label" class="export-btn__cost">
        <component :is="costIcon" :size="12" :stroke-width="2" />
        {{ cost.label }}
      </span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  Download as DownloadIcon,
  Loader2 as Loader2Icon,
  Coins as CoinsIcon,
  Sparkles as SparklesIcon,
  Check as CheckIcon,
  LogIn as LogInIcon,
} from '@lucide/vue'

const props = defineProps({
  hasChunks: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  cost: { type: Object, default: () => ({ kind: 'free', label: '' }) },
  labels: {
    type: Object,
    default: () => ({
      preparing: 'Preparing package...',
      downloadPackage: 'Download package (STL + PDF ZIP)',
    }),
  },
})
defineEmits(['export-package'])

const costIcon = computed(() => {
  switch (props.cost?.kind) {
    case 'credit': return CoinsIcon
    case 'unlocked': return CheckIcon
    case 'login': return LogInIcon
    default: return SparklesIcon
  }
})
</script>
