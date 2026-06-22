<template>
  <div class="pnl">
    <div class="pnl-head">
      <div class="pnl-title">
        <FileIcon />
        {{ labels.title }}
      </div>
      <Badge v-if="meshInfo" :variant="meshInfo.is_watertight ? 'success' : 'destructive'">
        {{ meshInfo.is_watertight ? labels.watertight : labels.notWatertight }}
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
        <h4>{{ dragOver ? labels.dropFile : labels.uploadTitle }}</h4>
        <p>{{ labels.uploadHint }}</p>
        <input
          ref="fileInput"
          type="file"
          accept=".stl"
          class="hidden"
          @change="onFileSelected"
        />
      </div>

      <p v-if="loading" class="mt-3 text-sm text-signal">{{ labels.uploading }}</p>
      <p v-if="localError && !loading" class="mt-3 text-sm text-destructive">{{ localError }}</p>
      <p v-if="error && !loading" class="mt-3 text-sm text-destructive">{{ error }}</p>

      <p v-if="meshInfo && !meshInfo.is_watertight" class="mt-2 text-xs font-medium text-destructive">
        {{ labels.nonWatertightWarning }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { File as FileIcon, Upload as UploadIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'

const props = defineProps({
  meshInfo: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  labels: {
    type: Object,
    default: () => ({
      title: 'Mesh file',
      watertight: 'Watertight',
      notWatertight: 'Not watertight',
      dropFile: 'Drop file here',
      uploadTitle: 'Upload an STL file',
      uploadHint: 'Drag & drop an STL file or click to browse',
      uploading: 'Uploading...',
      selectStl: 'Please select an .stl file',
      nonWatertightWarning: 'Mesh is not watertight - splitting may produce unexpected results.',
    }),
  },
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
    localError.value = props.labels.selectStl
    return
  }
  localError.value = ''
  emit('upload', file)
}
</script>
