<template>
  <PublicLanding
    v-if="showPublicLanding"
    :pricing="creditPricing"
    :store-domain="shopifyStoreDomain"
    :launch-url="launchUrl"
  />
  <main v-else class="app-shell min-h-screen">
    <div class="mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
      <header class="app-header">
        <div>
          <p class="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">Maliev MeshSplitter</p>
          <h1 class="text-2xl font-semibold text-foreground sm:text-3xl">Print-ready mesh splitting</h1>
        </div>
        <div class="header-stats" aria-label="Workflow status">
          <span>{{ chunks.length || 0 }} parts</span>
          <span>{{ meshInfo?.is_watertight ? 'Watertight' : 'Awaiting mesh' }}</span>
        </div>
      </header>
    <div class="grid gap-5 xl:grid-cols-[minmax(320px,420px)_1fr]">
      <div class="space-y-4">
        <div class="panel-card">
          <MeshUploader :mesh-info="meshInfo" :chunks="chunks" :loading="loading" :error="error" @upload="onUpload" />
        </div>
        <CreditsPanel
          :account="creditAccount"
          :pricing="creditPricing"
          :error="creditError"
          :store-domain="shopifyStoreDomain"
        />
        <ScaleConfig v-model="scaleInput" :enabled="!!meshInfo" :loading="loading" @apply="onScaleApply" />
        <BuildVolumeConfig v-model="buildVolume" />
        <SplitConfig :v="buildVolume" :ok="!!meshInfo" :err="visibleError" :loading="splitAuthorizing || loading" :divisions="divisions" @update:divisions="divisions = $event" @split="onSplit" />
        <ConnectorConfig :error="error" :success="connectorSuccess" @apply="onApply" />
      </div>

      <div class="space-y-4">
        <Card class="preview-card">
          <CardContent class="p-0">
            <ThreePreview :chunks="chunks" :mesh-info="meshInfo" :mesh-geometry="meshGeometry" :build-volume="buildVolume" :divisions="divisions" :up-axis="upAxis" />
          </CardContent>
        </Card>
        <PartList :chunks="chunks" @select="onSelectChunk" />
        <ExportPanel
          :has-chunks="chunks.length > 0"
          :loading="loading"
          @export-package="onExportPackage"
        />
      </div>
    </div>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { useMeshProcessor } from './composables/useMeshProcessor'
import { useCredits } from './composables/useCredits'

import MeshUploader from './components/MeshUploader.vue'
import CreditsPanel from './components/CreditsPanel.vue'
import ScaleConfig from './components/ScaleConfig.vue'
import BuildVolumeConfig from './components/BuildVolumeConfig.vue'
import SplitConfig from './components/SplitConfig.vue'
import ConnectorConfig from './components/ConnectorConfig.vue'
import ThreePreview from './components/ThreePreview.vue'
import PartList from './components/PartList.vue'
import ExportPanel from './components/ExportPanel.vue'
import PublicLanding from './components/PublicLanding.vue'

const {
  meshInfo, meshGeometry, chunks, loading, error, scaleFactor, buildVolume,
  loadStl, setScaleFactor, split, applyConnectors, downloadExportPackage,
} = useMeshProcessor()

const credits = useCredits()
const creditAccount = credits.account
const creditPricing = credits.pricing
const creditError = credits.error
const shopifyStoreDomain = import.meta.env.VITE_SHOPIFY_STORE_DOMAIN || ''
const storefrontBasePath = '/tools/mesh-splitter'
const currentPath = window.location.pathname.replace(/\/+$/, '')
const showPublicLanding = currentPath === storefrontBasePath
const launchUrl = `${storefrontBasePath}/app`
const connectorSuccess = ref('')
const divisions = ref([2, 2, 1])
const upAxis = ref('Z')
const splitAuthorizing = ref(false)
const exportSessionId = ref('')
const scaleInput = ref(1)
const visibleError = computed(() => error.value || creditError.value || '')

onMounted(() => {
  const refreshCredits = showPublicLanding ? credits.refreshPricing : credits.refresh
  refreshCredits().catch(() => {
    // The credit panel shows the authorization error.
  })
})

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
    scaleInput.value = scaleFactor.value
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

function onScaleApply(value) {
  connectorSuccess.value = ''
  setScaleFactor(value)
}

async function onSplit(volume, gridDivisions) {
  connectorSuccess.value = ''
  splitAuthorizing.value = true
  try {
    await split(volume, gridDivisions)
    exportSessionId.value = createExportSessionId({
      filename: meshInfo.value?.filename,
      divisions: gridDivisions,
      buildVolume: volume,
      chunkCount: chunks.value.length,
    })
  } catch {
    // error set by composable
  } finally {
    splitAuthorizing.value = false
  }
}

async function onApply(config) {
  connectorSuccess.value = ''
  try {
    await applyConnectors(config)
    connectorSuccess.value = 'Connectors applied'
  } catch { /* error set by composable */ }
}

function onSelectChunk(index) {
  // future: highlight chunk in preview
}

async function exportAfterCredit(format, downloadFn) {
  if (!chunks.value.length) return
  await credits.consumeExport({
    idempotencyKey: createExportKey(format),
    metadata: {
      filename: meshInfo.value?.filename,
      format,
      divisions: divisions.value,
      buildVolume: buildVolume.value,
      chunkCount: chunks.value.length,
    },
  })
  await downloadFn()
}

function createExportKey(format) {
  if (!exportSessionId.value) {
    exportSessionId.value = createExportSessionId({
      filename: meshInfo.value?.filename,
      divisions: divisions.value,
      buildVolume: buildVolume.value,
      chunkCount: chunks.value.length,
    })
  }
  return `${format}:${exportSessionId.value}`
}

function onExportPackage() {
  return exportAfterCredit('package', downloadExportPackage)
}

function createExportSessionId({ filename, divisions, buildVolume, chunkCount }) {
  const random = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  return `session:${filename || 'mesh'}:${buildVolume.join('x')}:${divisions.join('x')}:${chunkCount}:${random}`
}
</script>
