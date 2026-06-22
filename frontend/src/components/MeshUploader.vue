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

      <div v-if="meshInfo" class="mt-3">
        <div class="spec-row"><span class="k">File</span><span class="v">{{ meshInfo.filename }}</span></div>
        <div class="spec-row"><span class="k">Vertices</span><span class="v">{{ meshInfo.verts?.toLocaleString() }}</span></div>
        <div class="spec-row"><span class="k">Faces</span><span class="v">{{ meshInfo.faces?.toLocaleString() }}</span></div>
        <div v-if="meshInfo.bounds" class="spec-row"><span class="k">Bounds</span><span class="v">{{ boundsLabel }}</span></div>
      </div>
      <p v-if="meshInfo && !meshInfo.is_watertight" class="mt-2 text-xs font-medium text-destructive">
        Mesh is not watertight — splitting may produce unexpected results.
      </p>

      <div v-if="meshInfo && chunks.length > 0" class="mt-3 space-y-1 text-sm">
        <p class="font-medium">Chunks ({{ chunks.length }}):</p>
        <div v-for="chunk in chunks" :key="chunk.index" class="ml-2">
          <span class="text-foreground">{{ chunk.label }}</span>
          <span class="text-muted-foreground ml-1">— {{ (chunk.volume / 1000).toFixed(1) }} cm³</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { File as FileIcon, Upload as UploadIcon } from '@lucide/vue'
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

const boundsLabel = computed(() => {
  const bounds = props.meshInfo?.bounds
  if (!bounds) return ''
  if (typeof bounds === 'object' && bounds.min && bounds.max) {
    return `${(bounds.max.x - bounds.min.x).toFixed(1)} × ${(bounds.max.y - bounds.min.y).toFixed(1)} × ${(bounds.max.z - bounds.min.z).toFixed(1)} mm`
  }
  if (Array.isArray(bounds)) return `${bounds.map((v) => Number(v).toFixed(1)).join(' × ')} mm`
  return String(bounds)
})

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
