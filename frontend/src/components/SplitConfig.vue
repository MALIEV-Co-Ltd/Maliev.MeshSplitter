<template>
  <div>
    <h3 class="text-lg font-semibold mb-3">Split Configuration</h3>

    <div class="space-y-3">
      <div v-for="(axis, i) in ['X', 'Y', 'Z']" :key="axis">
        <label class="block text-xs text-gray-600 mb-1">{{ axis }} divisions: {{ divisions[i] }}</label>
        <input
          type="range"
          min="1"
          max="5"
          v-model.number="divisions[i]"
          class="w-full"
        />
      </div>
    </div>

    <p class="text-sm text-gray-600 mt-2">
      Total parts: <span class="font-semibold">{{ totalParts }}</span>
    </p>

    <p v-if="error" class="text-sm text-red-600 mt-1">{{ error }}</p>

    <button
      class="mt-3 w-full px-4 py-2 rounded text-sm font-medium transition-colors"
      :class="ok ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'"
      :disabled="!ok"
      @click="onSplit"
    >
      Split
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  v: { type: Array, required: true },
  ok: { type: Boolean, default: false },
  err: { type: String, default: '' },
})

const emit = defineEmits(['split'])

const divisions = defineModel('divisions', { type: Array, default: () => [1, 1, 1] })

const totalParts = computed(() => divisions.value.reduce((a, b) => a * b, 1))

function onSplit() {
  if (!props.ok) return
  const volume = props.v || [250, 250, 250]
  emit('split', volume, [...divisions.value])
}
</script>
