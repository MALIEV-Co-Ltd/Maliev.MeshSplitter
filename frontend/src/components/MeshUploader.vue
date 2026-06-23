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
      <input
        ref="fileInput"
        type="file"
        accept=".stl"
        class="hidden"
        @change="onFileSelected"
      />

      <div
        v-if="!meshInfo"
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
      </div>

      <div v-else class="mesh-loaded">
        <div class="mesh-loaded__row">
          <span class="mesh-loaded__icon"><FileIcon :size="18" :stroke-width="1.75" /></span>
          <div class="mesh-loaded__info">
            <span class="mesh-loaded__name" :title="meshInfo.filename">{{ meshInfo.filename }}</span>
            <span class="mesh-loaded__stats">
              {{ Number(meshInfo.verts || 0).toLocaleString() }} {{ labels.verts }} ·
              {{ Number(meshInfo.faces || 0).toLocaleString() }} {{ labels.faces }}
            </span>
          </div>
        </div>
        <div class="mesh-loaded__status" :class="meshInfo.is_watertight ? 'is-ok' : 'is-warn'">
          <component :is="meshInfo.is_watertight ? CheckIcon : AlertIcon" :size="13" :stroke-width="2" />
          {{ meshInfo.is_watertight ? labels.loadedWatertight : labels.loadedNotWatertight }}
        </div>
        <Button variant="outline" size="sm" class="w-full justify-center gap-2" :disabled="loading" @click="fileInput?.click()">
          <UploadIcon :size="14" :stroke-width="1.75" />
          {{ labels.replace }}
        </Button>
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
import { File as FileIcon, Upload as UploadIcon, Check as CheckIcon, AlertTriangle as AlertIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
      replace: 'Replace file',
      loadedWatertight: 'Watertight mesh loaded',
      loadedNotWatertight: 'Mesh loaded · not watertight',
      verts: 'vertices',
      faces: 'faces',
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
