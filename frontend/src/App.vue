<template>
  <PublicLanding
    v-if="showPublicLanding"
    :pricing="creditPricing"
    :store-domain="shopifyStoreDomain"
    :launch-url="launchUrl"
  />
  <main v-else class="app-shell">
    <header class="app-header">
      <div class="app-logo">
        <img :src="logoUrl" alt="MALIEV" />
        <span>MeshSplitter</span>
      </div>
      <div class="app-status" aria-label="Workflow status">
        <span class="status-chip" :class="{ ok: meshInfo?.is_watertight }">
          <span class="dot"></span>{{ meshInfo?.is_watertight ? 'Watertight' : 'Awaiting mesh' }}
        </span>
        <span class="status-chip">{{ chunks.length || 0 }} parts</span>
        <span class="status-chip">{{ creditAccount.freeRemaining }} free &middot; {{ creditAccount.availableGenerations }} credits</span>
      </div>
      <div class="header-right">
        <Button variant="outline" size="sm" @click="showCreditDialog">
          Buy credits
        </Button>
      </div>
    </header>
    <div class="workspace-grid">
      <section class="col-left">
        <MeshUploader :mesh-info="meshInfo" :chunks="chunks" :loading="loading" :error="error" @upload="onUpload" />
        <ScaleConfig v-model="scaleInput" :enabled="!!meshInfo" :loading="loading" @apply="onScaleApply" />
        <BuildVolumeConfig v-model="buildVolume" />
        <PartList
          :chunks="chunks"
          :selected-chunk-index="selectedChunkIndex"
          @select="onSelectChunk"
        />
      </section>

      <section class="col-center">
        <Card class="preview-card h-full rounded-none border-x border-y-0 shadow-none">
          <CardContent class="p-0 h-full">
            <ThreePreview
              :chunks="chunks"
              :mesh-info="meshInfo"
              :mesh-geometry="meshGeometry"
              :build-volume="buildVolume"
              :divisions="divisions"
              :up-axis="upAxis"
              :selected-chunk-index="selectedChunkIndex"
            />
          </CardContent>
        </Card>
        <div class="canvas-label">3D PREVIEW{{ previewDims ? ` · ${previewDims}` : '' }} · SCALE {{ scaleFactor.toFixed(3) }}&times;</div>
        <div class="canvas-hint">DRAG TO ROTATE &middot; SCROLL TO ZOOM</div>
      </section>

      <section class="col-right">
        <SplitConfig :v="buildVolume" :ok="!!meshInfo" :err="visibleError" :loading="splitAuthorizing || loading" :divisions="divisions" @update:divisions="divisions = $event" @split="onSplit" />
        <ConnectorConfig :error="error" :success="connectorSuccess" @apply="onApply" />
        <ExportPanel
          :has-chunks="chunks.length > 0"
          :loading="loading"
          @export-package="onExportPackage"
        />
      </section>
    </div>
    <dialog ref="creditDialog" class="credit-modal" @click.self="closeCreditDialog">
      <div class="credit-modal__panel">
        <header class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">Get extra credits</h2>
            <p class="text-sm text-muted-foreground">Purchase a pack to generate and export more parts.</p>
          </div>
          <Button size="sm" variant="outline" @click="closeCreditDialog">Close</Button>
        </header>
        <p v-if="creditError" class="text-sm text-destructive">{{ creditError }}</p>
        <div v-if="creditPricing.creditPacks.length" class="space-y-2 pt-2">
          <a
            v-for="pack in creditPricing.creditPacks"
            :key="pack.sku"
            :href="productUrl(pack)"
            class="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-accent"
          >
            <span>
              <span class="font-medium">{{ pack.name }}</span>
              <span class="block text-muted-foreground">{{ pack.credits }} credits</span>
            </span>
            <span class="font-semibold">{{ formatPrice(pack.priceCents, pack.currency) }}</span>
          </a>
        </div>
        <p v-else class="text-sm text-muted-foreground">
          Credit packs load from the backend when connected to Shopify.
        </p>
      </div>
    </dialog>
  </main>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useMeshProcessor } from './composables/useMeshProcessor'
import { useCredits } from './composables/useCredits'
import logoUrl from './assets/logos/maliev-wordmark-black.svg'

import MeshUploader from './components/MeshUploader.vue'
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
const creditDialog = ref(null)
const divisions = ref([2, 2, 1])
const upAxis = ref('Z')
const splitAuthorizing = ref(false)
const exportSessionId = ref('')
const scaleInput = ref(1)
const selectedChunkIndex = ref(null)
const visibleError = computed(() => error.value || creditError.value || '')
const previewDims = computed(() => {
  const bounds = meshInfo.value?.bounds
  if (!bounds) return ''
  if (bounds.min && bounds.max) {
    return `${(bounds.max.x - bounds.min.x).toFixed(0)} × ${(bounds.max.y - bounds.min.y).toFixed(0)} × ${(bounds.max.z - bounds.min.z).toFixed(0)} mm`
  }
  if (Array.isArray(bounds)) return `${bounds.map((v) => Number(v).toFixed(0)).join(' × ')} mm`
  return ''
})

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
  selectedChunkIndex.value = null
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
    selectedChunkIndex.value = null
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
  selectedChunkIndex.value = index
}

function productUrl(pack) {
  if (!shopifyStoreDomain) return `/products/${pack.handle}`
  return `https://${shopifyStoreDomain}/products/${pack.handle}`
}

function formatPrice(priceCents, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(priceCents / 100)
}

function showCreditDialog() {
  creditDialog.value?.showModal()
}

function closeCreditDialog() {
  creditDialog.value?.close()
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
