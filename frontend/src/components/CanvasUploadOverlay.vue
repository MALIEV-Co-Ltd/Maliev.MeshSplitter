<template>
  <div class="canvas-upload">
    <input ref="fileInput" type="file" accept=".stl" class="hidden" @change="onFileSelected" />
    <button
      v-if="!hasMesh"
      type="button"
      class="canvas-dropzone"
      data-testid="canvas-dropzone"
      @click="browse"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <UploadIcon :size="26" :stroke-width="1.5" />
      <span class="canvas-dropzone__title">{{ labels.uploadTitle }}</span>
      <span class="canvas-dropzone__hint">{{ labels.uploadHint }}</span>
      <span v-if="localError" class="canvas-dropzone__err">{{ localError }}</span>
    </button>
    <button
      v-else
      type="button"
      class="canvas-replace"
      data-testid="canvas-replace"
      :aria-label="labels.replace"
      @click="browse"
    >
      <UploadIcon :size="14" :stroke-width="1.75" /> {{ labels.replace }}
    </button>
  </div>
</template>

<script setup>
import { Upload as UploadIcon } from '@lucide/vue'
import { useFileUpload } from '@/composables/useFileUpload'

const props = defineProps({
  hasMesh: { type: Boolean, default: false },
  labels: {
    type: Object,
    default: () => ({
      uploadTitle: 'Upload an STL file',
      uploadHint: 'Tap to browse',
      replace: 'Replace',
      selectStl: 'Please select an .stl file',
      fileTooLarge: 'File is too large. Maximum size is 200 MB.',
    }),
  },
})
const emit = defineEmits(['upload'])
const { fileInput, localError, browse, onFileSelected, onDrop } = useFileUpload(emit, props.labels)
</script>
