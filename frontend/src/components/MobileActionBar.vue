<template>
  <div class="mobile-action-bar">
    <Button
      class="mab-btn"
      data-testid="bar-split"
      :disabled="!canSplit || loading"
      @click="$emit('split')"
    >
      <span v-if="loading" class="split-spinner" />
      {{ loading ? (progressLabel || labels.working) : labels.splitMesh }}
    </Button>
    <button
      type="button"
      class="mab-btn mab-btn--export"
      data-testid="bar-export"
      :disabled="!hasChunks || loading"
      @click="$emit('export-package')"
    >
      <span>{{ labels.export }}</span>
      <small v-if="cost?.label">{{ cost.label }}</small>
    </button>
  </div>
</template>

<script setup>
import { Button } from '@/components/ui/button'

defineProps({
  canSplit: { type: Boolean, default: false },
  hasChunks: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  progressLabel: { type: String, default: '' },
  cost: { type: Object, default: () => ({}) },
  labels: {
    type: Object,
    default: () => ({ splitMesh: 'Split', export: 'Export', working: 'Working…' }),
  },
})
defineEmits(['split', 'export-package'])
</script>
