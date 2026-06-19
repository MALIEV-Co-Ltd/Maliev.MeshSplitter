<template>
  <div class="min-h-screen bg-gray-50 p-4">
    <div class="grid gap-4 lg:grid-cols-3 max-w-7xl mx-auto">
      <!-- Left column: configuration panels -->
      <div class="lg:col-span-1 space-y-4">
        <div class="bg-white rounded-lg shadow p-4">
          <MeshUploader />
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <BuildVolumeConfig />
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <SplitConfig />
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <ConnectorConfig />
        </div>
      </div>

      <!-- Right column: preview + parts + export -->
      <div class="lg:col-span-2 space-y-4">
        <div class="bg-white rounded-lg shadow">
          <ThreePreview />
        </div>
        <div class="bg-white rounded-lg shadow">
          <PartList />
        </div>
        <div class="bg-white rounded-lg shadow">
          <ExportPanel />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import MeshUploader from './components/MeshUploader.vue'
import BuildVolumeConfig from './components/BuildVolumeConfig.vue'
import SplitConfig from './components/SplitConfig.vue'
import ConnectorConfig from './components/ConnectorConfig.vue'
import ThreePreview from './components/ThreePreview.vue'
import PartList from './components/PartList.vue'
import ExportPanel from './components/ExportPanel.vue'
</script>
