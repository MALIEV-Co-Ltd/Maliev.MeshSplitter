<template>
  <div class="pnl">
    <div class="pnl-head">
      <div class="pnl-title">
        <FileIcon />
        {{ labels.title }}
      </div>
      <!-- Watertight status is already shown in the top status bar and the
        canvas mesh-details panel, so it isn't repeated here. Once a mesh is
        loaded this slot holds the compact Replace control instead. -->
      <button v-if="meshInfo" type="button" class="mesh-replace-btn" :disabled="loading" @click="browse()">
        <UploadIcon :size="13" :stroke-width="1.75" />
        {{ labels.replace }}
      </button>
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
        @click="browse()"
      >
        <div class="drop-icon">
          <UploadIcon :size="18" :stroke-width="1.75" />
        </div>
        <h4>{{ dragOver ? labels.dropFile : labels.uploadTitle }}</h4>
        <p>{{ labels.uploadHint }}</p>
      </div>

      <div v-else class="mesh-loaded">
        <div class="mesh-loaded__row">
          <span class="mesh-loaded__thumb">
            <img v-if="meshInfo.thumbnail" :src="meshInfo.thumbnail" alt="" />
            <FileIcon v-else :size="20" :stroke-width="1.5" />
          </span>
          <div class="mesh-loaded__info">
            <span class="mesh-loaded__name" :title="meshInfo.filename">{{ meshInfo.filename }}</span>
            <span class="mesh-loaded__stats">
              {{ Number(meshInfo.verts || 0).toLocaleString() }} {{ labels.verts }} ·
              {{ Number(meshInfo.faces || 0).toLocaleString() }} {{ labels.faces }}
            </span>
          </div>
        </div>
      </div>

      <p v-if="loading && !meshInfo" class="mt-3 text-sm text-signal flex items-center gap-2">
        <span class="mesh-uploader__spinner"></span>
        {{ progressLabel || labels.uploading }}
      </p>
      <p v-if="localError && !loading" class="mt-3 text-sm text-destructive">{{ localError }}</p>
      <p v-if="error && !loading" class="mt-3 text-sm text-destructive">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { File as FileIcon, Upload as UploadIcon } from '@lucide/vue'
import { useFileUpload } from '@/composables/useFileUpload'

const props = defineProps({
  meshInfo: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  progressLabel: { type: String, default: '' },
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
      uploading: 'Loading...',
      fileTooLarge: 'File is too large. Maximum size is 200 MB.',
      selectStl: 'Please select an .stl file',
      replace: 'Replace file',
      loadedWatertight: 'Watertight mesh loaded',
      loadedNotWatertight: 'Mesh loaded · not watertight',
      verts: 'vertices',
      faces: 'faces',
    }),
  },
})

const emit = defineEmits(['upload'])

const { fileInput, dragOver, localError, browse, onFileSelected, onDrop } = useFileUpload(emit, props.labels)
</script>

<style scoped>
.mesh-uploader__spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: mesh-uploader-spin 0.6s linear infinite;
}
@keyframes mesh-uploader-spin {
  to { transform: rotate(360deg); }
}
</style>
