<template>
  <div>
    <h3 class="text-lg font-semibold mb-3">Upload STL</h3>

    <div
      class="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
      :class="dragOver ? 'border-blue-500 bg-blue-50' : error ? 'border-red-400 bg-red-50' : 'border-gray-300 hover:border-gray-400'"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
      @click="fileInput?.click()"
    >
      <p class="text-sm text-gray-600">
        {{ dragOver ? 'Drop file here' : 'Drag & drop an STL file or click to browse' }}
      </p>
      <input
        ref="fileInput"
        type="file"
        accept=".stl"
        class="hidden"
        @change="onFileSelected"
      />
    </div>

    <div v-if="loading" class="mt-3 text-sm text-blue-600">Uploading...</div>

    <div v-if="error" class="mt-3 text-sm text-red-600">{{ error }}</div>

    <div v-if="meshInfo" class="mt-3 space-y-1 text-sm">
      <p><span class="font-medium">File:</span> {{ meshInfo.filename }}</p>
      <p><span class="font-medium">Vertices:</span> {{ meshInfo.verts?.toLocaleString() }}</p>
      <p><span class="font-medium">Faces:</span> {{ meshInfo.faces?.toLocaleString() }}</p>
      <p>
        <span class="font-medium">Watertight:</span>
        <span :class="meshInfo.is_watertight ? 'text-green-600' : 'text-red-600'">
          {{ meshInfo.is_watertight ? 'Yes' : 'No' }}
        </span>
      </p>
      <p v-if="meshInfo.bounds">
        <span class="font-medium">Bounds:</span>
        {{ meshInfo.bounds.map(v => v.toFixed(1)).join(' × ') }} mm
      </p>
      <p v-if="!meshInfo.is_watertight" class="text-red-600 font-medium mt-2">
        Mesh is not watertight — splitting may produce unexpected results.
      </p>
    </div>

    <div v-if="meshInfo && chunks.length > 0" class="mt-3 space-y-1 text-sm">
      <p class="font-medium">Chunks ({{ chunks.length }}):</p>
      <div v-for="chunk in chunks" :key="chunk.index" class="ml-2">
        <span class="text-gray-700">{{ chunk.label }}</span>
        <span class="text-gray-500 ml-1">— {{ (chunk.volume / 1000).toFixed(1) }} cm³</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useMeshApi } from '../composables/useMeshApi'

const emit = defineEmits(['uploaded'])

const { meshInfo, chunks, loading, error, uploadStl } = useMeshApi()

const dragOver = ref(false)
const fileInput = ref(null)

async function onDrop(e) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) await handleFile(file)
}

async function onFileSelected(e) {
  const file = e.target?.files?.[0]
  if (file) await handleFile(file)
}

async function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.stl')) {
    error.value = 'Please select an .stl file'
    return
  }
  try {
    const info = await uploadStl(file)
    emit('uploaded', info)
  } catch {
    // error is set by composable
  }
}
</script>
