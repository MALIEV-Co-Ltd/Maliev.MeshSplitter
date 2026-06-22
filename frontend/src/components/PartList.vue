<template>
  <div class="parts-panel">
    <div class="parts-panel-head">
      <div class="pnl-title">
        <BoxesIcon />
        Parts
      </div>
      <span class="pnl-meta">{{ chunks.length }} total</span>
    </div>
    <div v-if="chunks.length === 0" class="pnl-body">
      <p class="text-sm text-muted-foreground">No parts yet. Upload and split a mesh.</p>
    </div>
    <div v-else class="parts-scroll">
      <div
        v-for="chunk in chunks"
        :key="chunk.index"
        class="pl-row cursor-pointer"
        :class="{ 'ring-2': chunk.index === selectedChunkIndex }"
        @click="$emit('select', chunk.index)"
      >
        <span class="pl-dot" :style="{ backgroundColor: colorHex(chunk.color) }"></span>
        <div class="pl-info">
          <span class="pl-label">{{ chunk.label }}</span>
          <span class="pl-vol">{{ (chunk.volume / 1000).toFixed(1) }} cm³</span>
        </div>
        <span class="pl-idx">{{ chunk.index + 1 }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Boxes as BoxesIcon } from '@lucide/vue'

defineProps({
  chunks: { type: Array, default: () => [] },
  selectedChunkIndex: { type: Number, default: null },
})
defineEmits(['select'])

function colorHex(color) {
  if (typeof color !== 'number' || !Number.isFinite(color)) return '#64748b'
  return '#' + color.toString(16).padStart(6, '0')
}
</script>
