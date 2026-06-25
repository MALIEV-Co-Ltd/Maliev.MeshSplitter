<template>
  <div class="pnl">
    <div class="pnl-head">
      <div class="pnl-title">
        <BoxIcon />
        {{ labels.title }}
      </div>
    </div>
    <div class="pnl-body space-y-2">
      <div ref="selectRoot" class="bv-select">
        <button
          id="build-volume-preset"
          type="button"
          class="bv-select-trigger"
          aria-haspopup="listbox"
          :aria-expanded="isOpen"
          @click="isOpen = !isOpen"
        >
          <span class="bv-option-text">
            <span class="bv-option-name">{{ selectedPreset ? selectedPreset.name : labels.customManual }}</span>
            <span v-if="selectedPreset" class="bv-option-volume">{{ volumeText(selectedPreset.value) }}</span>
          </span>
          <ChevronDownIcon :size="14" :stroke-width="1.75" :class="{ 'rotate-180': isOpen }" />
        </button>

        <div v-if="isOpen" class="bv-select-menu" role="listbox">
          <button
            type="button"
            class="bv-option"
            role="option"
            :aria-selected="selectedPresetId === 'custom'"
            @click="selectPreset('custom')"
          >
            <span class="bv-option-name">{{ labels.customManual }}</span>
          </button>
          <button
            v-for="preset in presets"
            :key="preset.id"
            type="button"
            class="bv-option"
            role="option"
            :aria-selected="selectedPresetId === preset.id"
            @click="selectPreset(preset.id)"
          >
            <span class="bv-option-name">{{ preset.name }}</span>
            <span class="bv-option-volume">{{ volumeText(preset.value) }}</span>
          </button>
        </div>
      </div>
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
import { onClickOutside } from '@vueuse/core'
import { Box as BoxIcon, ChevronDown as ChevronDownIcon } from '@lucide/vue'
import { Input } from '@/components/ui/input'

const props = defineProps({
  modelValue: { type: Array, required: true },
  labels: {
    type: Object,
    default: () => ({
      title: 'Build volume',
      customManual: 'Custom (manual)',
    }),
  },
})
const emit = defineEmits(['update:modelValue'])

const localVolume = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

// Build volumes verified against each manufacturer's published spec (single
// extruder / default mode where a printer reports several). Keep these grounded
// in real datasheets — a wrong Z silently lets a part exceed the printer.
//
// Bambu X1C/X1/A1/P1S/P1P hardware is 256x256x256mm, but Bambu Studio defaults
// the printable Z to 250mm to protect the filament-cutter mechanism — reaching
// 256mm requires manually clearing the "excluded bed area" safety setting. We
// target the out-of-the-box default so split parts fit without that override.
const presets = [
  { id: 'bambu-x1c', name: 'Bambu Lab X1C / X1 / A1', value: [256, 256, 250] },
  { id: 'bambu-p1s', name: 'Bambu Lab P1S', value: [256, 256, 250] },
  { id: 'bambu-p1p', name: 'Bambu Lab P1P', value: [256, 256, 250] },
  { id: 'bambu-a1-mini', name: 'Bambu Lab A1 mini', value: [180, 180, 180] },
  { id: 'prusa-mk4', name: 'Prusa MK4 / MK4S', value: [250, 210, 220] },
  { id: 'mk3', name: 'Prusa MK3S+', value: [250, 210, 210] },
  { id: 'prusa-xl', name: 'Prusa XL', value: [360, 360, 360] },
  { id: 'creality-k1', name: 'Creality K1 / K1C', value: [220, 220, 250] },
  { id: 'k1-max', name: 'Creality K1 Max', value: [300, 300, 300] },
  { id: 'ender-3v3-ke', name: 'Creality Ender-3 V3 KE', value: [220, 220, 240] },
  { id: 'kobra-2-plus', name: 'Anycubic Kobra 2 Plus', value: [320, 320, 400] },
  { id: 'kobra-max', name: 'Anycubic Kobra Max', value: [400, 400, 450] },
  { id: 's3', name: 'Ultimaker S3', value: [230, 190, 200] },
  { id: 's5', name: 'Ultimaker S5', value: [330, 240, 300] },
  { id: 's7', name: 'Ultimaker S7', value: [330, 240, 300] },
  { id: 'raise3d-pro2', name: 'Raise3D Pro2 Plus', value: [305, 305, 605] },
  { id: 'raise3d-pro3', name: 'Raise3D Pro3', value: [300, 300, 300] },
  { id: 'snapmaker-j1', name: 'Snapmaker J1 / J1s', value: [300, 200, 200] },
  { id: 'form3', name: 'Formlabs Form 3 (Resin)', value: [145, 145, 185] },
  { id: 'form3-plus', name: 'Formlabs Form 3+ (Resin)', value: [145, 145, 193] },
]

const selectedPresetId = ref('custom')
const isOpen = ref(false)
const selectRoot = ref(null)
const presetMap = Object.fromEntries(presets.map((preset) => [preset.id, preset.value]))
const selectedPreset = computed(() => presets.find((preset) => preset.id === selectedPresetId.value) || null)

onClickOutside(selectRoot, () => { isOpen.value = false })

function volumeText(value) {
  return `${value[0]} × ${value[1]} × ${value[2]} mm`
}

function syncPresetFromModel(value) {
  const match = presets.find((preset) => preset.value[0] === value[0] && preset.value[1] === value[1] && preset.value[2] === value[2])
  selectedPresetId.value = match ? match.id : 'custom'
}

watch(() => props.modelValue, (value) => syncPresetFromModel(value), { immediate: true, deep: true })

function selectPreset(id) {
  selectedPresetId.value = id
  isOpen.value = false
  const selected = presetMap[id]
  if (selected) emit('update:modelValue', [...selected])
}

function updateAxis(i, val) {
  const next = [...localVolume.value]
  next[i] = Number(val)
  selectedPresetId.value = 'custom'
  emit('update:modelValue', next)
}
</script>
