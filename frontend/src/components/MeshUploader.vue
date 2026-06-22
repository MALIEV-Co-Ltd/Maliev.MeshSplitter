<template>
  <div class="pnl">
    <div class="pnl-head">
      <div class="pnl-title">
        <FileIcon />
        Mesh file
      </div>
      <Badge v-if="meshInfo" :variant="meshInfo.is_watertight ? 'success' : 'destructive'">
        {{ meshInfo.is_watertight ? 'Watertight' : 'Not watertight' }}
      </Badge>
    </div>
    <div class="pnl-body">
      <div
        class="drop-zone"
        :class="{ 'is-dragover': dragOver, 'is-error': (error || localError) && !loading }"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
        @click="fileInput?.click()"
      >
        <div class="drop-icon">
          <UploadIcon :size="18" :stroke-width="1.75" />
        </div>
        <h4>{{ dragOver ? 'Drop file here' : 'Upload an STL file' }}</h4>
        <p>Drag &amp; drop an STL file or click to browse</p>
        <input
          ref="fileInput"
          type="file"
          accept=".stl"
          class="hidden"
          @change="onFileSelected"
        />
      </div>

      <p v-if="loading" class="mt-3 text-sm text-signal">Uploading...</p>
      <p v-if="localError && !loading" class="mt-3 text-sm text-destructive">{{ localError }}</p>
      <p v-if="error && !loading" class="mt-3 text-sm text-destructive">{{ error }}</p>

      <p v-if="meshInfo && !meshInfo.is_watertight" class="mt-2 text-xs font-medium text-destructive">
        Mesh is not watertight - splitting may produce unexpected results.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { File as FileIcon, Upload as UploadIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'

defineProps({
  meshInfo: { type: Object, default: null },
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
