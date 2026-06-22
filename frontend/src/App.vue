<template>
  <PublicLanding
    v-if="showPublicLanding"
    :pricing="creditPricing"
    :account="creditAccount"
    :has-account-data="hasCreditAccount"
    :credits-loading="creditLoading"
    :store-domain="shopifyStoreDomain"
    :home-url="storeHomeUrl"
    :launch-url="launchUrl"
    :sign-in-url="signInUrl"
  />
  <main v-else class="app-shell">
    <header class="app-header">
      <a class="app-logo app-logo-link" :href="storeHomeUrl" aria-label="Go to MALIEV shop">
        <img :src="logoUrl" alt="MALIEV" />
        <span>MeshSplitter</span>
      </a>
      <div class="app-status" aria-label="Workflow status">
        <span class="status-chip" :class="{ ok: meshInfo?.is_watertight }">
          <span class="dot"></span>{{ meshInfo?.is_watertight ? 'Watertight' : 'Awaiting mesh' }}
        </span>
        <span class="status-chip">{{ chunks.length || 0 }} parts</span>
        <span class="status-chip credit-chip" :title="creditChipTitle">
          <Loader2Icon v-if="showCreditSpinner" :size="12" :stroke-width="2" class="coin-icon animate-spin" />
          <CoinsIcon v-else :size="12" :stroke-width="1.75" class="coin-icon" />
          {{ creditChipText }}
        </span>
      </div>
      <div class="header-right">
        <Button variant="outline" size="sm" @click="showCreditDialog">
          Buy credits
        </Button>
      </div>
    </header>
    <div class="workspace-grid">
      <section class="col-left">
        <MeshUploader :mesh-info="meshInfo" :loading="loading" :error="error" @upload="onUpload" />
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
        <div v-if="meshInfo" class="canvas-inspector" aria-label="Mesh details">
          <div class="canvas-inspector__head">
            <span>Mesh details</span>
            <span>{{ meshInfo.is_watertight ? 'Watertight' : 'Check mesh' }}</span>
          </div>
          <div class="canvas-inspector__grid">
            <div><span>File</span><strong>{{ meshInfo.filename }}</strong></div>
            <div><span>Vertices</span><strong>{{ meshInfo.verts?.toLocaleString() }}</strong></div>
            <div><span>Faces</span><strong>{{ meshInfo.faces?.toLocaleString() }}</strong></div>
            <div><span>Bounds</span><strong>{{ previewDims }}</strong></div>
            <div><span>Scale</span><strong>{{ scaleFactor.toFixed(3) }}x</strong></div>
          </div>
        </div>
        <div class="canvas-label">3D PREVIEW{{ previewDims ? ` · ${previewDims}` : '' }} · SCALE {{ scaleFactor.toFixed(3) }}&times;</div>
        <div class="canvas-hint">DRAG TO ROTATE &middot; SCROLL TO ZOOM</div>
      </section>

      <section class="col-right">
        <BuildVolumeConfig v-model="buildVolume" />
        <ScaleConfig v-model="scaleInput" :enabled="!!meshInfo" :loading="loading" :mesh-info="meshInfo" @apply="onScaleApply" />
        <SplitConfig :v="buildVolume" :ok="!!meshInfo" :err="visibleError" :success="connectorSuccess" :loading="splitAuthorizing || loading" :divisions="divisions" @update:divisions="divisions = $event" @split="onSplit" />
        <ExportPanel
          :has-chunks="chunks.length > 0"
          :loading="loading || exportingPackage"
          @export-package="onExportPackage"
        />
      </section>
    </div>
    <dialog ref="creditDialog" class="credit-modal" @click.self="closeCreditDialog">
      <div class="credit-modal__panel">
        <header class="credit-modal__head">
          <div>
            <p class="credit-modal__eyebrow">
              <CoinsIcon :size="13" :stroke-width="1.75" class="coin-icon" />
              Credits
            </p>
            <h2>Get extra credits</h2>
            <p class="credit-modal__sub">Purchase a pack to split and export more parts.</p>
          </div>
          <button class="credit-modal__close" type="button" aria-label="Close" @click="closeCreditDialog">
            <XIcon :size="16" :stroke-width="1.75" />
          </button>
        </header>

        <div class="credit-modal__free">
          <span>Free this month</span>
          <span class="credit-modal__free-val">{{ creditAccount.freeRemaining }} / {{ creditAccount.freeLimit }}</span>
        </div>

        <p v-if="creditError" class="text-sm text-destructive">{{ creditError }}</p>

        <div v-if="creditPricing.creditPacks.length" class="credit-pack-list">
          <a v-for="pack in creditPricing.creditPacks" :key="pack.sku" :href="productUrl(pack)" class="credit-pack">
            <span class="credit-pack__info">
              <span class="credit-pack__name">{{ pack.name }}</span>
              <span class="credit-pack__credits">{{ pack.credits }} credits</span>
            </span>
            <span class="credit-pack__price">{{ formatPrice(pack.priceCents, pack.currency) }}</span>
          </a>
          <p class="credit-modal__currency-note">
            Prices in {{ creditPricing.creditPacks[0].currency }} via the MALIEV Shopify store.
          </p>
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
import { Coins as CoinsIcon, Loader2 as Loader2Icon, X as XIcon } from '@lucide/vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useMeshProcessor } from './composables/useMeshProcessor'
import { useCredits } from './composables/useCredits'
import logoUrl from './assets/logos/maliev-wordmark-black.svg'

import MeshUploader from './components/MeshUploader.vue'
import ScaleConfig from './components/ScaleConfig.vue'
import BuildVolumeConfig from './components/BuildVolumeConfig.vue'
import SplitConfig from './components/SplitConfig.vue'
import ThreePreview from './components/ThreePreview.vue'
import PartList from './components/PartList.vue'
import ExportPanel from './components/ExportPanel.vue'
import PublicLanding from './components/PublicLanding.vue'

const {
  meshInfo, meshGeometry, chunks, loading, error, scaleFactor, buildVolume,
  loadStl, setScaleFactor, split, applyConnectors, buildExportPackage, saveBlob,
} = useMeshProcessor()

const credits = useCredits()
const creditAccount = credits.account
const creditPricing = credits.pricing
const creditError = credits.error
const creditLoading = credits.loading
const hasCreditAccount = credits.hasAccountData
const shopifyStoreDomain = import.meta.env.VITE_SHOPIFY_STORE_DOMAIN || ''
const storefrontBasePath = '/tools/mesh-splitter'
const currentPath = window.location.pathname.replace(/\/+$/, '')
const showPublicLanding = currentPath === storefrontBasePath
const launchUrl = `${storefrontBasePath}/app`
const storeHomeUrl = shopifyStoreDomain ? `https://${shopifyStoreDomain}/` : 'https://shop.maliev.com/'
const signInUrl = computed(() => buildCustomerLoginUrl(currentPath || storefrontBasePath))
const connectorSuccess = ref('')
const creditDialog = ref(null)
const divisions = ref([2, 2, 1])
const upAxis = ref('Z')
const splitAuthorizing = ref(false)
const exportSessionId = ref('')
const exportingPackage = ref(false)
const scaleInput = ref(1)
const selectedChunkIndex = ref(null)
const visibleError = computed(() => error.value || creditError.value || '')
const showCreditSpinner = computed(() => creditLoading.value && !hasCreditAccount.value)
const creditChipText = computed(() => {
  if (showCreditSpinner.value) return 'Credits'
  const freeRemaining = Number(creditAccount.value.freeRemaining ?? creditPricing.value.freeGenerationsPerMonth ?? 0)
  if (hasCreditAccount.value) {
    const paidCredits = Number(creditAccount.value.paidCredits ?? Math.max(0, (creditAccount.value.availableGenerations ?? 0) - freeRemaining))
    return `${freeRemaining} free · ${paidCredits} credits`
  }
  return `${freeRemaining} free`
})
const creditChipTitle = computed(() => {
  if (showCreditSpinner.value) return 'Fetching credit data'
  if (hasCreditAccount.value) return 'Free monthly exports and paid account credits'
  return 'Free monthly exports shown until account credit data loads'
})
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
  const refreshCredits = showPublicLanding ? credits.refreshPublic : credits.refresh
  refreshCredits().catch(() => {
    // The credit panel shows the authorization error.
  })
})

function buildCustomerLoginUrl(returnPath) {
  const normalizedReturnPath = returnPath?.startsWith('/') ? returnPath : storefrontBasePath
  const loginUrl = new URL('/account/login', storeHomeUrl)
  loginUrl.searchParams.set('return_to', normalizedReturnPath)
  loginUrl.searchParams.set('return_url', normalizedReturnPath)
  return loginUrl.toString()
}

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

async function onSplit(volume, gridDivisions, connectorConfig) {
  connectorSuccess.value = ''
  splitAuthorizing.value = true
  try {
    await split(volume, gridDivisions)
    selectedChunkIndex.value = null
    if (connectorConfig?.type && connectorConfig.type !== 'None') {
      await applyConnectors(connectorConfig)
      connectorSuccess.value = 'Connectors applied'
    }
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

async function exportAfterCredit(format, buildFn) {
  if (!chunks.value.length) return
  exportingPackage.value = true
  try {
    // Build the file first; a failed/blank render must never burn a paid credit.
    const { blob, filename } = await buildFn()
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
    saveBlob(blob, filename)
  } finally {
    exportingPackage.value = false
  }
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
  return exportAfterCredit('package', buildExportPackage)
}

function createExportSessionId({ filename, divisions, buildVolume, chunkCount }) {
  const random = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  return `session:${filename || 'mesh'}:${buildVolume.join('x')}:${divisions.join('x')}:${chunkCount}:${random}`
}
</script>
