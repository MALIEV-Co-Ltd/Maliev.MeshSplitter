<template>
  <div class="flex gap-3">
    <Button class="flex-1" :disabled="!hasChunks || loading" @click="$emit('export-stl')">
      Download STLs (ZIP)
    </Button>
    <Button class="flex-1" variant="secondary" :disabled="!hasChunks || loading" @click="$emit('export-pdf')">
      Assembly PDF
    </Button>
  </div>
</template>

<script setup>
import { Button } from '@/components/ui/button'

defineProps({
  hasChunks: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})
defineEmits(['export-stl', 'export-pdf'])
</script>
