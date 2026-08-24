<template>
  <div class="canvas-upload">
    <input ref="fileInput" type="file" accept=".stl,.3mf,.obj,.mtl,.png,.jpg,.jpeg,.webp,.bmp" multiple class="hidden" @change="onFileSelected" />
    <input ref="folderInput" data-testid="mobile-obj-folder-input" type="file" webkitdirectory multiple class="hidden" @change="onFolderSelected" />
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
      v-if="!hasMesh"
      type="button"
      class="canvas-folder"
      @click="browseFolder"
    >
      <FolderOpenIcon :size="14" :stroke-width="1.75" /> {{ labels.loadObjFolder }}
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
import { FolderOpen as FolderOpenIcon, Upload as UploadIcon } from '@lucide/vue'
import { useFileUpload } from '@/composables/useFileUpload'

const props = defineProps({
  hasMesh: { type: Boolean, default: false },
  labels: {
    type: Object,
    default: () => ({
      uploadTitle: 'Upload an STL, 3MF, or OBJ file',
      uploadHint: 'Tap to browse',
      replace: 'Replace',
      loadObjFolder: 'Load OBJ folder',
      selectStl: 'Select one STL, 3MF, or OBJ model and an optional MTL.',
      fileTooLarge: 'File is too large. Maximum size is 200 MB.',
    }),
  },
})
const emit = defineEmits(['upload'])
const { fileInput, folderInput, localError, browse, browseFolder, onFileSelected, onFolderSelected, onDrop } = useFileUpload(emit, props.labels)
</script>
