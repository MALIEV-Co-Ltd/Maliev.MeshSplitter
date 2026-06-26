<template>
  <div class="parts-panel">
    <div class="parts-panel-head">
      <div class="pnl-title">
        <BoxesIcon />
        {{ labels.title }}
      </div>
      <span class="pnl-meta">{{ totalPartsCount }} {{ labels.total }}</span>
    </div>
    <div v-if="chunks.length === 0" class="parts-empty">
      <BoxesIcon :size="22" :stroke-width="1.5" class="parts-empty__icon" />
      <p class="parts-empty__text">{{ labels.empty }}</p>
    </div>
    <div v-else class="parts-scroll">
      <div
        v-if="keyChunks.length > 0"
        class="pl-row cursor-pointer"
        :class="{ 'ring-2': isKeySelected }"
        @click="selectKeys"
      >
        <span class="pl-thumb" :style="{ borderColor: '#ffd700' }">
          <span class="pl-thumb-dot" :style="{ backgroundColor: '#ffd700' }"></span>
        </span>
        <div class="pl-info">
          <span class="pl-label">Key x{{ keyChunks.length }}</span>
          <span v-if="!compact" class="pl-meta">{{ keyMetaLine }}</span>
          <span v-if="!compact" class="pl-meta pl-vol">{{ keyVolumeLabel }}</span>
        </div>
        <span class="pl-idx">K</span>
      </div>

      <div
        v-for="chunk in nonKeyChunks"
        :key="chunk.index"
        class="pl-row cursor-pointer"
        :class="{ 'ring-2': chunk.index === selectedChunkIndex }"
        @click="$emit('select', chunk.index)"
      >
        <span class="pl-thumb" :style="{ borderColor: colorHex(chunk.color) }">
          <img v-if="chunk.thumbnail" :src="chunk.thumbnail" alt="" />
          <span v-else class="pl-thumb-dot" :style="{ backgroundColor: colorHex(chunk.color) }"></span>
        </span>
        <div class="pl-info">
          <span class="pl-label">{{ chunk.label }}</span>
          <span v-if="!compact" class="pl-meta">{{ metaLine(chunk) }}</span>
          <span v-if="!compact" class="pl-meta pl-vol">{{ volumeLabel(chunk) }}</span>
        </div>
        <span class="pl-idx">{{ chunk.index + 1 }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Boxes as BoxesIcon } from '@lucide/vue'

const props = defineProps({
  chunks: { type: Array, default: () => [] },
  selectedChunkIndex: { type: Number, default: null },
  compact: { type: Boolean, default: false },
  labels: {
    type: Object,
    default: () => ({
      title: 'Parts',
      total: 'total',
      empty: 'No parts yet. Upload and split a mesh.',
    }),
  },
})
const emit = defineEmits(['select'])

const nonKeyChunks = computed(() => props.chunks.filter(c => !c.isKey))
const keyChunks = computed(() => props.chunks.filter(c => c.isKey))

const totalPartsCount = computed(() => {
  return nonKeyChunks.value.length + (keyChunks.value.length > 0 ? 1 : 0)
})

const isKeySelected = computed(() => {
  if (keyChunks.value.length === 0) return false
  return keyChunks.value.some(k => k.index === props.selectedChunkIndex)
})

function selectKeys() {
  if (keyChunks.value.length > 0) {
    emit('select', keyChunks.value[0].index)
  }
}

const keyMetaLine = computed(() => {
  if (keyChunks.value.length === 0) return ''
  const firstKey = keyChunks.value[0]
  return firstKey.dims
    ? `${firstKey.dims.x.toFixed(0)} × ${firstKey.dims.y.toFixed(0)} × ${firstKey.dims.z.toFixed(0)} mm`
    : ''
})

const keyVolumeLabel = computed(() => {
  if (keyChunks.value.length === 0) return ''
  const firstKey = keyChunks.value[0]
  const singleVol = Number(firstKey.volume || 0)
  const totalVol = singleVol * keyChunks.value.length
  const vol = `${(totalVol / 1000).toFixed(1)} cm³`
  const faces = Number(firstKey.faces || 0).toLocaleString()
  return `${vol} · ${faces} faces`
})

function colorHex(color) {
  if (typeof color !== 'number' || !Number.isFinite(color)) return '#64748b'
  return '#' + color.toString(16).padStart(6, '0')
}

function metaLine(chunk) {
  return chunk.dims
    ? `${chunk.dims.x.toFixed(0)} × ${chunk.dims.y.toFixed(0)} × ${chunk.dims.z.toFixed(0)} mm`
    : ''
}

function volumeLabel(chunk) {
  const vol = `${(Number(chunk.volume || 0) / 1000).toFixed(1)} cm³`
  const faces = Number(chunk.faces || 0).toLocaleString()
  return `${vol} · ${faces} faces`
}
</script>
