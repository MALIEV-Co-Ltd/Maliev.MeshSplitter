<template>
  <div class="min-h-screen bg-gray-50 p-4">
    <div class="grid gap-4 lg:grid-cols-3 max-w-7xl mx-auto">
      <div class="lg:col-span-1 space-y-4">
        <div class="bg-white rounded-lg shadow p-4">
          <MeshUploader @uploaded="onUploaded" />
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <BuildVolumeConfig v-model="buildVolume" />
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <SplitConfig :v="buildVolume" :ok="hasMesh" :err="splitError" @split="onSplit" />
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <ConnectorConfig @applied="onApplied" />
        </div>
      </div>

      <div class="lg:col-span-2 space-y-4">
        <div class="bg-white rounded-lg shadow">
          <ThreePreview :chunks="previewChunks" />
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <PartList :chunks="chunks" @select="onSelectChunk" />
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <ExportPanel :hasChunks="chunks.length > 0" @export-stl="onExportStl" @export-pdf="onExportPdf" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useMeshApi } from './composables/useMeshApi'

import MeshUploader from './components/MeshUploader.vue'
import BuildVolumeConfig from './components/BuildVolumeConfig.vue'
import SplitConfig from './components/SplitConfig.vue'
import ConnectorConfig from './components/ConnectorConfig.vue'
import ThreePreview from './components/ThreePreview.vue'
import PartList from './components/PartList.vue'
import ExportPanel from './components/ExportPanel.vue'

const { meshInfo, chunks, splitMesh, exportStl, exportPdf } = useMeshApi()

const buildVolume = ref([250, 250, 250])
const previewChunks = ref([])
const splitError = ref(null)
const hasMesh = ref(false)

function onUploaded() {
  hasMesh.value = true
  previewChunks.value = []
  splitError.value = null
}

async function onSplit(volume, divisions) {
  splitError.value = null
  try {
    await splitMesh(volume, divisions)
  } catch (e) {
    splitError.value = e.message
  }
}

async function onApplied() {
}

function onSelectChunk(index) {
}

function onExportStl() {
  exportStl()
}

function onExportPdf() {
  exportPdf()
}
</script>
