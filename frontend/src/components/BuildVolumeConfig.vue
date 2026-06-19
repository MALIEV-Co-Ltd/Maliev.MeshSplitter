<template>
  <div>
    <h3 class="text-lg font-semibold mb-3">Build Volume</h3>

    <div class="grid grid-cols-3 gap-2 mb-3">
      <div>
        <label class="block text-xs text-gray-600 mb-1">X (mm)</label>
        <input
          type="number"
          min="1"
          step="1"
          v-model.number="localVolume[0]"
          class="w-full border border-gray-300 rounded px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label class="block text-xs text-gray-600 mb-1">Y (mm)</label>
        <input
          type="number"
          min="1"
          step="1"
          v-model.number="localVolume[1]"
          class="w-full border border-gray-300 rounded px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label class="block text-xs text-gray-600 mb-1">Z (mm)</label>
        <input
          type="number"
          min="1"
          step="1"
          v-model.number="localVolume[2]"
          class="w-full border border-gray-300 rounded px-2 py-1 text-sm"
        />
      </div>
    </div>

    <div class="flex gap-2 flex-wrap">
      <button
        v-for="preset in presets"
        :key="preset.label"
        class="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 transition-colors"
        @click="setPreset(preset)"
      >
        {{ preset.label }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Array, required: true },
})
const emit = defineEmits(['update:modelValue'])

const localVolume = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const presets = [
  { label: 'X1C', value: [250, 250, 250] },
  { label: 'MK4', value: [250, 210, 220] },
  { label: 'V2.4', value: [350, 350, 350] },
]

function setPreset(preset) {
  emit('update:modelValue', [...preset.value])
}
</script>
