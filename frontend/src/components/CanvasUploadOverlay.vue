<template>
  <div class="canvas-upload">
    <input ref="fileInput" type="file" accept=".stl,.3mf,.obj" class="hidden" @change="onFileSelected" />
    <input ref="companionInput" data-testid="mobile-obj-companion-input" type="file" accept=".mtl,.png,.jpg,.jpeg,.webp,.bmp" multiple class="hidden" @change="onCompanionSelected" />
    <button
      v-if="!hasMesh && !awaitingObjCompanions"
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
    <div v-if="awaitingObjCompanions" class="canvas-companion-prompt" role="dialog" :aria-label="labels.objCompanionTitle">
      <strong>{{ pendingObj?.name }}</strong>
      <span>{{ labels.objCompanionTitle }}</span>
      <button type="button" @click="browseCompanions">{{ labels.addObjCompanions }}</button>
      <button type="button" @click="continueWithoutMaterials">{{ labels.continueWithoutMaterials }}</button>
      <span v-if="localError" class="canvas-dropzone__err">{{ localError }}</span>
    </div>
    <button
      v-else-if="hasMesh"
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
      uploadTitle: 'Upload an STL, 3MF, or OBJ file',
      uploadHint: 'Tap to browse',
      replace: 'Replace',
      objCompanionTitle: 'Does this OBJ have material files?',
      addObjCompanions: 'Add MTL / textures',
      continueWithoutMaterials: 'Continue without materials',
      selectObjCompanions: 'Select one MTL file and any referenced texture images.',
      selectStl: 'Select one STL, 3MF, or OBJ model and an optional MTL.',
      fileTooLarge: 'File is too large. Maximum size is 200 MB.',
    }),
  },
})
const emit = defineEmits(['upload'])
const {
  fileInput,
  companionInput,
  localError,
  pendingObj,
  awaitingObjCompanions,
  browse,
  browseCompanions,
  continueWithoutMaterials,
  onFileSelected,
  onCompanionSelected,
  onDrop,
} = useFileUpload(emit, props.labels)
</script>
