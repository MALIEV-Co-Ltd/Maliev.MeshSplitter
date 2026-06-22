<template>
  <div class="pnl">
    <div class="pnl-head">
      <div class="pnl-title">
        <BoxIcon />
        Build volume
      </div>
    </div>
    <div class="pnl-body space-y-2">
      <select
        id="build-volume-preset"
        v-model="selectedPresetId"
        class="bv-select flex h-8 w-full rounded-sm border border-input bg-background px-2.5 font-mono text-xs text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="custom">Custom (manual)</option>
        <option v-for="preset in presets" :key="preset.id" :value="preset.id">
          {{ preset.label }}
        </option>
      </select>
      <div class="grid grid-cols-3 gap-1.5">
        <div v-for="(axis, i) in ['X', 'Y', 'Z']" :key="axis" class="bv-field">
          <label :for="`build-volume-${axis}`">{{ axis }} (mm)</label>
          <Input
            :id="`build-volume-${axis}`"
            type="number"
            min="1"
            step="1"
            class="h-8 font-mono text-xs"
            :model-value="localVolume[i]"
            @update:model-value="updateAxis(i, $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Box as BoxIcon } from '@lucide/vue'
import { Input } from '@/components/ui/input'

const props = defineProps({
  modelValue: { type: Array, required: true },
})
const emit = defineEmits(['update:modelValue'])

const localVolume = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const presets = [
  { id: 'bambu-x1c', label: 'Bambu Lab X1C / A1 | 256 x 256 x 256 mm', value: [256, 256, 256] },
  { id: 'bambu-p1p', label: 'Bambu Lab P1P | 256 x 256 x 256 mm', value: [256, 256, 256] },
  { id: 'bambu-p1s', label: 'Bambu Lab P1S / P1P+ | 256 x 256 x 256 mm', value: [256, 256, 256] },
  { id: 'prusa-mk4', label: 'Prusa MK4/MK4S | 250 x 210 x 220 mm', value: [250, 210, 220] },
  { id: 'prusa-xl', label: 'Prusa XL | 360 x 360 x 360 mm', value: [360, 360, 360] },
  { id: 'ender-3v3-ke', label: 'Creality Ender-3 V3 KE | 300 x 300 x 350 mm', value: [300, 300, 350] },
  { id: 'creality-k1', label: 'Creality K1 / K1 Max | 220 x 220 x 250 mm', value: [220, 220, 250] },
  { id: 'kobra-2-plus', label: 'Anycubic Kobra 2 Plus | 300 x 300 x 350 mm', value: [300, 300, 350] },
  { id: 's3', label: 'Ultimaker S3 | 230 x 230 x 250 mm', value: [230, 230, 250] },
  { id: 's5', label: 'Ultimaker S5 | 330 x 240 x 300 mm', value: [330, 240, 300] },
  { id: 's7', label: 'Ultimaker S7 | 330 x 240 x 300 mm', value: [330, 240, 300] },
  { id: 'raise3d-pro2', label: 'Raise3D Pro2 Plus | 305 x 305 x 605 mm', value: [305, 305, 605] },
  { id: 'bambu-a1-mini', label: 'Bambu Lab A1 mini | 180 x 180 x 180 mm', value: [180, 180, 180] },
  { id: 'k1-max', label: 'Creality K1 Max | 300 x 300 x 300 mm', value: [300, 300, 300] },
  { id: 'kobra-max', label: 'Anycubic Kobra Max | 300 x 300 x 300 mm', value: [300, 300, 300] },
  { id: 'snapmaker-j1', label: 'Snapmaker J1 | 255 x 255 x 260 mm', value: [255, 255, 260] },
  { id: 'snapmaker-x1e', label: 'Snapmaker X1E | 360 x 360 x 360 mm', value: [360, 360, 360] },
  { id: 'form3', label: 'Formlabs Form 3 (Resin) | 145 x 145 x 185 mm', value: [145, 145, 185] },
  { id: 'form3-plus', label: 'Formlabs Form 3+ (Resin) | 145 x 145 x 185 mm', value: [145, 145, 185] },
  { id: 'pro3-e1', label: 'Raise3D Pro3 E1 | 300 x 300 x 305 mm', value: [300, 300, 305] },
  { id: 'mk3', label: 'Prusa MK3S+ | 250 x 210 x 210 mm', value: [250, 210, 210] },
]

const selectedPresetId = ref('custom')
const presetMap = Object.fromEntries(presets.map((preset) => [preset.id, preset.value]))

function syncPresetFromModel(value) {
  const match = presets.find((preset) => preset.value[0] === value[0] && preset.value[1] === value[1] && preset.value[2] === value[2])
  selectedPresetId.value = match ? match.id : 'custom'
}

watch(() => props.modelValue, (value) => syncPresetFromModel(value), { immediate: true, deep: true })

watch(selectedPresetId, (id) => {
  if (id === 'custom') return
  const selected = presetMap[id]
  if (selected) emit('update:modelValue', [...selected])
})

function updateAxis(i, val) {
  const next = [...localVolume.value]
  next[i] = Number(val)
  selectedPresetId.value = 'custom'
  emit('update:modelValue', next)
}
</script>
