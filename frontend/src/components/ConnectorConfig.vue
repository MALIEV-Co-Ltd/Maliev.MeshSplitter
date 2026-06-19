<template>
  <div>
    <h3 class="text-lg font-semibold mb-3">Connectors</h3>

    <div class="mb-3">
      <label class="block text-xs text-gray-600 mb-1">Type</label>
      <select
        v-model="connectorType"
        class="w-full border border-gray-300 rounded px-2 py-1 text-sm"
      >
        <option v-for="opt in types" :key="opt" :value="opt">{{ opt }}</option>
      </select>
    </div>

    <template v-if="connectorType !== 'None'">
      <div class="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label class="block text-xs text-gray-600 mb-1">Diameter (mm)</label>
          <input
            type="number"
            step="0.5"
            min="2"
            v-model.number="diameter"
            class="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-600 mb-1">Depth (mm)</label>
          <input
            type="number"
            step="0.5"
            min="2"
            v-model.number="depth"
            class="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label class="block text-xs text-gray-600 mb-1">Clearance (mm)</label>
          <input
            type="number"
            step="0.05"
            min="0"
            v-model.number="clearance"
            class="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-600 mb-1">Per face</label>
          <select
            v-model.number="perFace"
            class="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option :value="1">1</option>
            <option :value="2">2</option>
            <option :value="4">4</option>
          </select>
        </div>
      </div>
    </template>

    <div v-if="error" class="text-sm text-red-600 mb-2">{{ error }}</div>
    <div v-if="success" class="text-sm text-green-600 mb-2">{{ success }}</div>

    <button
      class="mt-1 w-full px-4 py-2 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
      @click="onApply"
    >
      Apply
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useMeshApi } from '../composables/useMeshApi'

const emit = defineEmits(['applied'])

const { addConnectors, error } = useMeshApi()

const types = ['Dowel', 'Mortise & Tenon', 'Key', 'None']
const connectorType = ref('None')
const diameter = ref(6)
const depth = ref(10)
const clearance = ref(0.1)
const perFace = ref(1)
const success = ref('')

async function onApply() {
  success.value = ''
  const config = { type: connectorType.value }
  if (connectorType.value !== 'None') {
    config.diameter = diameter.value
    config.depth = depth.value
    config.clearance = clearance.value
    config.perFace = perFace.value
  }
  try {
    await addConnectors(config)
    success.value = 'Connectors applied'
    emit('applied', config)
  } catch {
    // error set by composable
  }
}
</script>
