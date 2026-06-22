<template>
  <div class="right-bottom">
    <Button class="flex-1 justify-center gap-2" :disabled="!hasChunks || loading" @click="$emit('export-package')">
      <Loader2Icon v-if="loading" :size="14" :stroke-width="2" class="animate-spin" />
      <DownloadIcon v-else :size="14" :stroke-width="1.75" />
      {{ loading ? 'Preparing package…' : 'Download package (STL + PDF ZIP)' }}
    </Button>
  </div>
</template>

<script setup>
import { Download as DownloadIcon, Loader2 as Loader2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

defineProps({
  hasChunks: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})
defineEmits(['export-package'])
</script>
