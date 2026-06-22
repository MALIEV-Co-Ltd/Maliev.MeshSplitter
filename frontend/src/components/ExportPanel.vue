<template>
  <div class="right-bottom">
    <Button class="flex-1 justify-center gap-2" :disabled="!hasChunks || loading" @click="$emit('export-package')">
      <DownloadIcon :size="14" :stroke-width="1.75" />
      Download package (STL + PDF ZIP)
    </Button>
  </div>
</template>

<script setup>
import { Download as DownloadIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

defineProps({
  hasChunks: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})
defineEmits(['export-package'])
</script>
