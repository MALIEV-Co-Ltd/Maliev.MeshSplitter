<template>
  <div class="flex gap-3">
    <Button class="flex-1" :disabled="!hasChunks || loading" @click="$emit('export-package')">
      Download package (STL + PDF ZIP)
    </Button>
  </div>
</template>

<script setup>
import { Button } from '@/components/ui/button'

defineProps({
  hasChunks: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})
defineEmits(['export-package'])
</script>
