<template>
  <div class="flex gap-3">
    <button
      :disabled="!hasChunks"
      class="flex-1 px-4 py-2 rounded text-sm font-medium transition-colors"
      :class="hasChunks ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'"
      @click="$emit('export-stl')"
    >
      Download STLs (ZIP)
    </button>
    <button
      :disabled="!hasChunks"
      class="flex-1 px-4 py-2 rounded text-sm font-medium transition-colors"
      :class="hasChunks ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'"
      @click="$emit('export-pdf')"
    >
      Assembly PDF
    </button>
  </div>
</template>

<script setup>
defineProps({ hasChunks: { type: Boolean, default: false } })
defineEmits(['export-stl', 'export-pdf'])
</script>
