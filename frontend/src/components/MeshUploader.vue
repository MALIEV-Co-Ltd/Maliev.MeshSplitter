<template>
  <div>
    <div
      class="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
      :class="dragOver ? 'border-primary bg-accent' : (error || localError) ? 'border-destructive bg-destructive/10' : 'border-border hover:border-muted-foreground'"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
      @click="fileInput?.click()"
    >
      <p class="text-sm text-muted-foreground">
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

    <div v-if="loading" class="mt-3 text-sm text-primary">Uploading...</div>
    <div v-if="localError && !loading" class="mt-3 text-sm text-destructive">{{ localError }}</div>
    <div v-if="error && !loading" class="mt-3 text-sm text-destructive">{{ error }}</div>

    <div v-if="meshInfo" class="mt-3 space-y-2">
      <div class="text-sm space-y-1">
        <p><span class="font-medium">File:</span> {{ meshInfo.filename }}</p>
        <p><span class="font-medium">Vertices:</span> {{ meshInfo.verts?.toLocaleString() }}</p>
        <p><span class="font-medium">Faces:</span> {{ meshInfo.faces?.toLocaleString() }}</p>
        <p>
          <span class="font-medium">Watertight:</span>
          <Badge :variant="meshInfo.is_watertight ? 'default' : 'destructive'">
            {{ meshInfo.is_watertight ? 'Yes' : 'No' }}
          </Badge>
        </p>
        <p v-if="meshInfo.bounds">
          <span class="font-medium">Bounds:</span>
          {{ typeof meshInfo.bounds === 'object' && meshInfo.bounds.min ? `${meshInfo.bounds.min.x.toFixed(1)} x ${meshInfo.bounds.min.y.toFixed(1)} x ${meshInfo.bounds.min.z.toFixed(1)} mm` : (Array.isArray(meshInfo.bounds) ? meshInfo.bounds.map(v => Number(v).toFixed(1)).join(' x ') : meshInfo.bounds) }} mm
        </p>
      </div>
      <p v-if="!meshInfo.is_watertight" class="text-sm text-destructive font-medium">
        Mesh is not watertight — splitting may produce unexpected results.
      </p>
    </div>

    <div v-if="meshInfo && chunks.length > 0" class="mt-3 space-y-1 text-sm">
      <p class="font-medium">Chunks ({{ chunks.length }}):</p>
      <div v-for="chunk in chunks" :key="chunk.index" class="ml-2">
        <span class="text-foreground">{{ chunk.label }}</span>
        <span class="text-muted-foreground ml-1">— {{ (chunk.volume / 1000).toFixed(1) }} cm³</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Badge } from '@/components/ui/badge'

const props = defineProps({
  meshInfo: { type: Object, default: null },
  chunks: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const emit = defineEmits(['upload'])

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

const localError = ref('')

function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.stl')) {
    localError.value = 'Please select an .stl file'
    return
  }
  localError.value = ''
  emit('upload', file)
}
</script>
