<template>
  <div class="pnl">
    <div class="pnl-head">
      <div class="pnl-title">
        <RulerIcon />
        {{ labels.title }}
      </div>
      <span class="pnl-meta">{{ percent }}%</span>
    </div>
    <div class="pnl-body space-y-2">
      <div class="grid grid-cols-3 gap-1.5">
        <div v-for="axis in ['x', 'y', 'z']" :key="axis" class="bv-field">
          <label :for="`scale-size-${axis}`">{{ axis.toUpperCase() }} (mm)</label>
          <Input
            :id="`scale-size-${axis}`"
            type="number"
            min="0.01"
            step="0.1"
            class="h-8 font-mono text-xs"
            :model-value="roundedSize[axis]"
            :disabled="!enabled || loading || !baseSize"
            @update:model-value="onSizeInput(axis, $event)"
          />
        </div>
      </div>
      <div class="flex flex-wrap gap-2" :aria-label="labels.presets">
        <Button
          v-for="preset in presets"
          :key="preset.label"
          type="button"
          variant="outline"
          size="xs"
          :disabled="!enabled || loading"
          @click="applyPreset(preset.value)"
        >
          {{ preset.label }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Ruler as RulerIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const props = defineProps({
  modelValue: { type: Number, default: 1 },
  enabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  meshInfo: { type: Object, default: null },
  labels: {
    type: Object,
    default: () => ({
      title: 'Scale',
      presets: 'Scale presets',
    }),
  },
})

const emit = defineEmits(['update:modelValue', 'apply'])

const draftScale = ref(props.modelValue)
const presets = [
  { label: '50%', value: 0.5 },
  { label: '100%', value: 1 },
  { label: '200%', value: 2 },
  { label: '2540%', value: 25.4 },
]

// meshInfo.bounds reflects the mesh at the CURRENT scale, so dividing by the
// current scale recovers the original (scale=1) size — the fixed reference
// every axis field scales from, keeping X/Y/Z always in proportion.
const baseSize = computed(() => {
  const bounds = props.meshInfo?.bounds
  const currentScale = props.modelValue || 1
  if (!bounds?.min || !bounds?.max) return null
  return {
    x: (bounds.max.x - bounds.min.x) / currentScale,
    y: (bounds.max.y - bounds.min.y) / currentScale,
    z: (bounds.max.z - bounds.min.z) / currentScale,
  }
})

const draftSize = computed(() => {
  if (!baseSize.value) return { x: 0, y: 0, z: 0 }
  return {
    x: baseSize.value.x * draftScale.value,
    y: baseSize.value.y * draftScale.value,
    z: baseSize.value.z * draftScale.value,
  }
})

const roundedSize = computed(() => ({
  x: round(draftSize.value.x),
  y: round(draftSize.value.y),
  z: round(draftSize.value.z),
}))

const numericDraft = computed(() => Number(draftScale.value))
const isValid = computed(() => Number.isFinite(numericDraft.value) && numericDraft.value > 0 && numericDraft.value <= 25.4)
const percent = computed(() => Math.round(props.modelValue * 100))

watch(() => props.modelValue, (value) => {
  draftScale.value = value
})

function round(value) {
  return Math.round(value * 100) / 100
}

function onSizeInput(axis, value) {
  if (!baseSize.value || !baseSize.value[axis]) return
  const target = Number(value)
  if (!Number.isFinite(target) || target <= 0) return
  draftScale.value = target / baseSize.value[axis]
  apply()
}

function applyPreset(value) {
  draftScale.value = value
  apply()
}

function apply() {
  if (!isValid.value) return
  emit('update:modelValue', numericDraft.value)
  emit('apply', numericDraft.value)
}
</script>
