<template>
  <div class="min-h-screen bg-background p-4">
    <div class="grid gap-4 lg:grid-cols-3 max-w-7xl mx-auto">
      <div class="lg:col-span-1 space-y-4">
        <div class="bg-card rounded-lg border p-4">
          <MeshUploader :mesh-info="meshInfo" :chunks="chunks" :loading="loading" :error="error" @upload="onUpload" />
        </div>
        <BuildVolumeConfig v-model="buildVolume" />
        <SplitConfig :v="buildVolume" :ok="!!meshInfo" :err="error" @split="onSplit" />
        <ConnectorConfig :error="error" :success="connectorSuccess" @apply="onApply" />
      </div>

      <div class="lg:col-span-2 space-y-4">
        <Card>
          <CardContent class="p-0">
            <ThreePreview :chunks="chunks" :mesh-info="meshInfo" />
          </CardContent>
        </Card>
        <PartList :chunks="chunks" @select="onSelectChunk" />
        <ExportPanel :has-chunks="chunks.length > 0" :loading="loading" @export-stl="downloadStl" @export-pdf="downloadPdf" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
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
  meshInfo, chunks, loading, error, buildVolume,
  loadStl, split, applyConnectors, downloadStl, downloadPdf, clearMesh,
} = useMeshProcessor()

const connectorSuccess = ref('')

async function onUpload(file) {
  connectorSuccess.value = ''
  await loadStl(file)
}

function onSplit(volume, divisions) {
  connectorSuccess.value = ''
  try {
    split(volume, divisions)
  } catch {
    // error set by composable
  }
}

function onApply(config) {
  connectorSuccess.value = ''
  applyConnectors(config)
  connectorSuccess.value = 'Connectors applied'
}

function onSelectChunk(index) {
  // future: highlight chunk in preview
}
</script>
