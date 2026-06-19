<template>
  <div class="min-h-screen bg-background p-4">
    <div class="grid gap-4 lg:grid-cols-3 max-w-7xl mx-auto">
      <div class="lg:col-span-1 space-y-4">
        <div class="bg-card rounded-lg border p-4">
          <MeshUploader :mesh-info="meshInfo" :chunks="chunks" :loading="loading" :error="error" @upload="onUpload" />
        </div>
        <BuildVolumeConfig v-model="buildVolume" />
        <SplitConfig :v="buildVolume" :ok="!!meshInfo" :err="error" :divisions="divisions" @update:divisions="divisions = $event" @split="onSplit" />
        <ConnectorConfig :error="error" :success="connectorSuccess" @apply="onApply" />
      </div>

      <div class="lg:col-span-2 space-y-4">
        <Card>
          <CardContent class="p-0">
            <ThreePreview :chunks="chunks" :mesh-info="meshInfo" :mesh-geometry="meshGeometry" :build-volume="buildVolume" :divisions="divisions" :up-axis="upAxis" />
          </CardContent>
        </Card>
        <PartList :chunks="chunks" @select="onSelectChunk" />
        <ExportPanel :has-chunks="chunks.length > 0" :loading="loading" @export-stl="downloadStl" @export-pdf="downloadPdf" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { useMeshProcessor } from './composables/useMeshProcessor'

import MeshUploader from './components/MeshUploader.vue'
import BuildVolumeConfig from './components/BuildVolumeConfig.vue'
import SplitConfig from './components/SplitConfig.vue'
import ConnectorConfig from './components/ConnectorConfig.vue'
import ThreePreview from './components/ThreePreview.vue'
import PartList from './components/PartList.vue'
import ExportPanel from './components/ExportPanel.vue'

const {
  meshInfo, meshGeometry, chunks, loading, error, buildVolume,
  loadStl, split, applyConnectors, downloadStl, downloadPdf, clearMesh,
} = useMeshProcessor()

const connectorSuccess = ref('')
const divisions = ref([2, 2, 1])
const upAxis = ref('Z')

function calcAutoDivisions(meshBounds, bv) {
  const sx = meshBounds.max.x - meshBounds.min.x
  const sy = meshBounds.max.y - meshBounds.min.y
  const sz = meshBounds.max.z - meshBounds.min.z
  return [
    Math.max(1, Math.ceil(sx / bv[0])),
    Math.max(1, Math.ceil(sy / bv[1])),
    Math.max(1, Math.ceil(sz / bv[2])),
  ]
}

watch(meshInfo, (info) => {
  if (info && info.bounds) {
    divisions.value = calcAutoDivisions(info.bounds, buildVolume.value)
  }
})

watch(buildVolume, (bv) => {
  if (meshInfo.value && meshInfo.value.bounds) {
    divisions.value = calcAutoDivisions(meshInfo.value.bounds, bv)
  }
})

async function onUpload(file) {
  connectorSuccess.value = ''
  await loadStl(file)
}

function onSplit(volume, gridDivisions) {
  connectorSuccess.value = ''
  try {
    split(volume, gridDivisions)
  } catch {
    // error set by composable
  }
}

function onApply(config) {
  connectorSuccess.value = ''
  try {
    applyConnectors(config)
    connectorSuccess.value = 'Connectors applied'
  } catch { /* error set by composable */ }
}

function onSelectChunk(index) {
  // future: highlight chunk in preview
}
</script>
