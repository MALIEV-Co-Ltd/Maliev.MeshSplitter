<template>
  <div>
    <h3 class="text-lg font-semibold mb-3">Parts ({{ chunks.length }})</h3>
    <div v-if="chunks.length === 0" class="text-sm text-gray-500">No parts yet. Upload and split a mesh.</div>
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      <div
        v-for="chunk in chunks"
        :key="chunk.index"
        class="border rounded p-3 cursor-pointer hover:shadow-md transition-shadow"
        @click="$emit('select', chunk.index)"
      >
        <div class="text-sm font-medium">{{ chunk.label }}</div>
        <div class="text-xs text-gray-500">#{{ chunk.index }}</div>
        <div class="text-xs text-gray-500">{{ (chunk.volume / 1000).toFixed(1) }} cm³</div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({ chunks: { type: Array, default: () => [] } })
defineEmits(['select'])
</script>
