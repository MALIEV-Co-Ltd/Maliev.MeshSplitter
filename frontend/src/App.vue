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
    :locale="locale"
    :is-dark="isDark"
    @toggle-locale="toggleLocale"
    @toggle-theme="toggleTheme"
  />
  <main v-else class="app-shell">
    <header class="app-header">
      <a class="app-logo app-logo-link" :href="storeHomeUrl" aria-label="Go to MALIEV shop">
        <img :src="logoUrl" alt="MALIEV" />
        <span>Mesh Splitter</span>
      </a>
      <div v-if="!isMobile" class="app-status" aria-label="Workflow status">
        <span class="status-chip" :class="{ ok: meshInfo?.is_watertight }">
          <span class="dot"></span>{{ meshInfo?.is_watertight ? uiCopy.watertight : uiCopy.awaitingMesh }}
        </span>
        <span class="status-chip">{{ chunks.length || 0 }} {{ uiCopy.parts }}</span>
        <button type="button" class="status-chip credit-chip credit-chip--action" :title="uiCopy.getCredits" @click="showCreditDialog">
          <Loader2Icon v-if="showCreditSpinner" :size="12" :stroke-width="2" class="coin-icon animate-spin" />
          <CoinsIcon v-else :size="12" :stroke-width="1.75" class="coin-icon" />
          {{ creditChipText }}
        </button>
        <span v-if="previewInfo?.optimized" class="status-chip performance-chip" :title="previewStatusTitle">
          {{ uiCopy.previewOptimized }}
        </span>
      </div>
      <div class="header-right">
        <button v-if="isMobile" type="button" class="status-chip credit-chip credit-chip--action" :title="uiCopy.getCredits" @click="showCreditDialog">
          <Loader2Icon v-if="showCreditSpinner" :size="12" :stroke-width="2" class="coin-icon animate-spin" />
          <CoinsIcon v-else :size="12" :stroke-width="1.75" class="coin-icon" />
          {{ creditChipText }}
        </button>
        <Button variant="ghost" size="icon-sm" :aria-label="uiCopy.toggleTheme" @click="toggleTheme">
          <SunIcon v-if="isDark" :size="16" :stroke-width="1.75" />
          <MoonIcon v-else :size="16" :stroke-width="1.75" />
        </Button>
        <Button variant="ghost" size="sm" class="language-toggle" @click="toggleLocale">
          {{ locale === 'th' ? 'EN' : 'ไทย' }}
        </Button>
        <Button v-if="!isMobile" variant="outline" size="sm" @click="showCreditDialog">
          {{ uiCopy.buyCredits }}
        </Button>
      </div>
    </header>
    <div class="workspace-grid">
      <section class="col-center">
        <span class="canvas-version" aria-label="App version">v{{ appVersion }}</span>
        <Card class="preview-card h-full rounded-none border-x border-y-0 shadow-none">
          <CardContent class="p-0 h-full">
            <ThreePreview
              ref="threePreviewRef"
              :preview-info="previewInfo"
              :mesh-info="meshInfo"
              :mesh-geometry="previewMeshGeometry || meshGeometry"
              :chunks="previewChunks"
              :build-volume="buildVolume"
              :divisions="divisions"
              :up-axis="upAxis"
              :is-dark="isDark"
              :selected-chunk-index="selectedChunkIndex"
              :connector-positions="connectorPositions"
              :reapplying-connectors="reapplyingConnectors"
              :show-labels="showLabels"
              :problem-edges="problemEdges"
              :scale-factor="scaleFactor"
              @connector-drag-start="onConnectorDragStart"
              @connector-drag-end="onConnectorDragEnd"
            />
          </CardContent>
        </Card>
        <CanvasUploadOverlay v-if="isMobile" :has-mesh="!!meshInfo" :labels="uiCopy.uploader" @upload="onUpload" />
        <div v-if="meshInfo && !isMobile" class="canvas-inspector" aria-label="Mesh details">
          <div class="canvas-inspector__head">
            <span>{{ uiCopy.meshDetails }}</span>
            <span>{{ meshInfo.is_watertight ? uiCopy.watertight : uiCopy.checkMesh }}</span>
          </div>
          <div class="canvas-inspector__grid">
            <div><span>{{ uiCopy.file }}</span><strong>{{ meshInfo.filename }}</strong></div>
            <div><span>{{ uiCopy.vertices }}</span><strong>{{ meshInfo.verts?.toLocaleString() }}</strong></div>
            <div><span>{{ uiCopy.faces }}</span><strong>{{ meshInfo.faces?.toLocaleString() }}</strong></div>
            <div><span>{{ uiCopy.bounds }}</span><strong>{{ previewDims }}</strong></div>
            <div><span>{{ uiCopy.scale }}</span><strong>{{ scaleFactor.toFixed(3) }}x</strong></div>
            <div v-if="previewInfo?.optimized"><span>{{ uiCopy.previewQuality }}</span><strong>{{ previewFaceSummary }}</strong></div>
          </div>
        </div>
        <div class="canvas-label">{{ uiCopy.preview }}{{ previewDims ? ` · ${previewDims}` : '' }} · {{ uiCopy.scale.toUpperCase() }} {{ scaleFactor.toFixed(3) }}&times;{{ previewInfo?.optimized ? ` · ${uiCopy.previewOptimized}` : '' }}</div>
        <div class="canvas-hint">{{ uiCopy.canvasHint }}</div>
        <div v-if="connectorPositions.length > 0 && selectedPartIndex != null" class="canvas-drag-tip">{{ uiCopy.connectorDragTip }}</div>
        <div v-if="reapplyingConnectors" class="canvas-processing" aria-label="Processing">
          <span class="canvas-spinner" />
          {{ progressLabel || uiCopy.working }}
        </div>
        <button v-if="chunks.length > 0" class="canvas-label-toggle" :class="{ active: showLabels }" :aria-label="uiCopy.toggleLabels" :title="uiCopy.toggleLabels" @click="showLabels = !showLabels"><TagsIcon :size="13" :stroke-width="1.75" /> Labels</button>
        <NonManifoldErrorDialog
          v-if="problemEdges.length > 0"
          :boundary-holes="boundaryHoles"
          :boundary-edges="boundaryEdges"
          :non-manifold-edges="nonManifoldEdgeCount"
          :labels="uiCopy.errorDialog"
          @view-problem="frameToProblemEdges"
          @dismiss="dismissProblemEdges"
        />
      </section>

      <div class="cols-stack">
        <section class="col-left">
          <MeshUploader v-if="!isMobile" :mesh-info="meshInfo" :loading="loading" :progress-label="progressLabel" :error="visibleError" :labels="uiCopy.uploader" @upload="onUpload" />
          <PartList
            :chunks="chunks"
            :selected-chunk-index="selectedChunkIndex"
            :compact="isMobile"
            :labels="uiCopy.partList"
            @select="onSelectChunk"
          />
        </section>

        <section class="col-right">
        <template v-if="isMobile">
          <AccordionSection :title="uiCopy.buildVolume.title" :icon="BoxIcon" :open="openSection === 'volume'" @toggle="toggleSection('volume')">
            <BuildVolumeConfig v-model="buildVolume" :labels="uiCopy.buildVolume" />
          </AccordionSection>
          <AccordionSection :title="uiCopy.scaleConfig.title" :icon="RulerIcon" :open="openSection === 'scale'" @toggle="toggleSection('scale')">
            <ScaleConfig v-model="scaleInput" :enabled="!!meshInfo" :loading="loading" :mesh-info="meshInfo" :labels="uiCopy.scaleConfig" @apply="onScaleApply" />
          </AccordionSection>
          <AccordionSection :title="uiCopy.splitConfig.title" :icon="LayersIcon" :open="openSection === 'split'" @toggle="toggleSection('split')">
            <SplitConfig ref="splitConfigRef" :v="buildVolume" :ok="canSplitMesh" :loading="splitAuthorizing || loading" :progress-label="progressLabel" :divisions="divisions" :labels="uiCopy.splitConfig" :show-split-button="false" @split="onSplit" />
          </AccordionSection>
        </template>
        <template v-else>
          <BuildVolumeConfig v-model="buildVolume" :labels="uiCopy.buildVolume" />
          <ScaleConfig v-model="scaleInput" :enabled="!!meshInfo" :loading="loading" :mesh-info="meshInfo" :labels="uiCopy.scaleConfig" @apply="onScaleApply" />
          <SplitConfig :v="buildVolume" :ok="canSplitMesh" :loading="splitAuthorizing || loading" :progress-label="progressLabel" :divisions="divisions" :labels="uiCopy.splitConfig" @split="onSplit" />
          <ExportPanel
            :has-chunks="chunks.length > 0 && canSplitMesh"
            :loading="loading || exportingPackage"
            :cost="exportCost"
            :labels="uiCopy.exportPanel"
            @export-package="onExportPackage"
          />
        </template>
        </section>
      </div>
    </div>
    <MobileActionBar
      v-if="isMobile"
      :can-split="canSplitMesh"
      :has-chunks="chunks.length > 0 && canSplitMesh"
      :loading="loading || exportingPackage || splitAuthorizing"
      :progress-label="progressLabel"
      :cost="exportCost"
      :labels="uiCopy.mobileActionBar"
      @split="onMobileSplit"
      @export-package="onExportPackage"
    />
    <dialog ref="creditDialog" class="credit-modal" @click.self="closeCreditDialog">
      <div class="credit-modal__panel">
        <header class="credit-modal__head">
          <div>
            <p class="credit-modal__eyebrow">
              <CoinsIcon :size="13" :stroke-width="1.75" class="coin-icon" />
              {{ uiCopy.credits }}
            </p>
            <h2>{{ uiCopy.getCredits }}</h2>
            <p class="credit-modal__sub">{{ uiCopy.creditSub }}</p>
          </div>
          <button class="credit-modal__close" type="button" aria-label="Close" @click="closeCreditDialog">
            <XIcon :size="16" :stroke-width="1.75" />
          </button>
        </header>

        <div class="credit-modal__free">
          <span>{{ uiCopy.freeThisMonth }}</span>
          <span class="credit-modal__free-val">{{ creditAccount.freeRemaining }} / {{ creditAccount.freeLimit }}</span>
        </div>

        <p v-if="creditError" class="text-sm text-destructive">{{ creditError }}</p>

        <div v-if="creditPricing.creditPacks.length" class="credit-pack-list">
          <a v-for="pack in creditPricing.creditPacks" :key="pack.sku" :href="productUrl(pack)" class="credit-pack-card">
            <span class="credit-pack-card__eyebrow">{{ pack.name }}</span>
            <span class="credit-pack-card__credits">{{ pack.credits }} {{ uiCopy.credits }}</span>
            <span class="credit-pack-card__price">
              {{ formatPrice(pack.priceCents, pack.currency) }}
              <small>{{ pricePerCredit(pack) }} / {{ uiCopy.exportUnit }}</small>
            </span>
            <span v-if="pack.bestFor" class="credit-pack-card__summary">{{ pack.bestFor }}</span>
            <span class="credit-pack-card__cta">{{ uiCopy.buyCredits }}</span>
          </a>
          <p class="credit-modal__currency-note">
            {{ uiCopy.pricesIn }} {{ creditPricing.creditPacks[0].currency }} {{ uiCopy.viaStore }}
          </p>
        </div>
        <p v-else class="text-sm text-muted-foreground">
          {{ uiCopy.creditPacksLoading }}
        </p>
      </div>
    </dialog>
    <dialog ref="loginDialog" class="credit-modal login-modal" @click.self="closeLoginDialog">
      <div class="credit-modal__panel login-modal__panel">
        <header class="credit-modal__head">
          <div>
            <p class="credit-modal__eyebrow">
              <CoinsIcon :size="13" :stroke-width="1.75" class="coin-icon" />
              {{ uiCopy.loginRequired.eyebrow }}
            </p>
            <h2>{{ uiCopy.loginRequired.title }}</h2>
            <p class="credit-modal__sub">{{ uiCopy.loginRequired.body }}</p>
          </div>
          <button class="credit-modal__close" type="button" :aria-label="uiCopy.close" @click="closeLoginDialog">
            <XIcon :size="16" :stroke-width="1.75" />
          </button>
        </header>
        <div class="login-modal__benefits">
          <div v-for="benefit in uiCopy.loginRequired.benefits" :key="benefit">
            <span class="login-modal__check">✓</span>
            <span>{{ benefit }}</span>
          </div>
        </div>
        <div class="login-modal__actions">
          <Button as-child class="justify-center">
            <a :href="signInUrl">{{ uiCopy.loginRequired.cta }}</a>
          </Button>
          <Button variant="outline" class="justify-center" @click="closeLoginDialog">
            {{ uiCopy.loginRequired.keepReviewing }}
          </Button>
        </div>
      </div>
    </dialog>
    <RepairConfirmDialog v-if="repairPreview" :preview="repairPreview" :labels="uiCopy.repairDialog" @confirm="acceptRepair" @cancel="rejectRepair" />
  </main>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Coins as CoinsIcon, Loader2 as Loader2Icon, X as XIcon, Sun as SunIcon, Moon as MoonIcon, Tags as TagsIcon, Box as BoxIcon, Ruler as RulerIcon, Layers2 as LayersIcon } from '@lucide/vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useMeshProcessor } from './composables/useMeshProcessor'
import { useCredits } from './composables/useCredits'
import { useIsMobile } from './composables/useIsMobile'
import logoWordmarkBlack from './assets/logos/maliev-wordmark-black.svg'
import logoWordmarkWhite from './assets/logos/maliev-wordmark-white.svg'

import MeshUploader from './components/MeshUploader.vue'
import ScaleConfig from './components/ScaleConfig.vue'
import BuildVolumeConfig from './components/BuildVolumeConfig.vue'
import SplitConfig from './components/SplitConfig.vue'
import RepairConfirmDialog from './components/RepairConfirmDialog.vue'
import ThreePreview from './components/ThreePreview.vue'
import PartList from './components/PartList.vue'
import ExportPanel from './components/ExportPanel.vue'
import NonManifoldErrorDialog from './components/NonManifoldErrorDialog.vue'
import AccordionSection from './components/AccordionSection.vue'
import MobileActionBar from './components/MobileActionBar.vue'
import CanvasUploadOverlay from './components/CanvasUploadOverlay.vue'
import PublicLanding from './components/PublicLanding.vue'
import { calculateAutoDivisions } from './mesh/splitPlanning'
import { exportIdempotencyKey } from './lib/exportIdentity'
import { buildCustomerLoginUrl, STOREFRONT_BASE_PATH, signInReturnPath } from './auth/customerLogin'
import pkg from '../package.json'

// Shown small in the canvas corner so we can see at a glance which release is
// live in production. Bundled at build time from the frontend package version.
const appVersion = pkg.version

// Mobile layout: a reactive breakpoint flag drives the accordion, the fixed
// action bar, and which upload UI renders. Desktop is unaffected.
const isMobile = useIsMobile()
const openSection = ref(null)
function toggleSection(name) {
  openSection.value = openSection.value === name ? null : name
}
const splitConfigRef = ref(null)
function onMobileSplit() {
  splitConfigRef.value?.requestSplit()
}

const {
  meshInfo, meshGeometry, previewMeshGeometry, previewInfo, chunks, previewChunks,
  connectorPositions, reapplyingConnectors, problemEdges,
  loading, progressLabel, setProgressLabels, repairPreview, acceptRepair, rejectRepair, error, scaleFactor, buildVolume,
  loadStl, setScaleFactor, split, applyConnectors, updateConnectorPosition,
  prepareExport, buildExportPackage, saveBlob, clearProblemEdges,
} = useMeshProcessor()

const credits = useCredits()
const creditAccount = credits.account
const creditPricing = credits.pricing
const creditError = credits.error
const creditLoading = credits.loading
const hasCreditAccount = credits.hasAccountData
const shopifyStoreDomain = import.meta.env.VITE_SHOPIFY_STORE_DOMAIN || ''
const storefrontBasePath = STOREFRONT_BASE_PATH
const currentPath = window.location.pathname.replace(/\/+$/, '')
const showPublicLanding = currentPath === storefrontBasePath
const launchUrl = `${storefrontBasePath}/app`
const currentReturnPath = signInReturnPath(window.location, { basePath: storefrontBasePath, appPath: launchUrl })
const storeHomeUrl = shopifyStoreDomain ? `https://${shopifyStoreDomain}/` : 'https://shop.maliev.com/'
const locale = ref(resolveInitialLocale())
const signInUrl = computed(() => buildCustomerLoginUrl({
  returnPath: currentReturnPath,
  storeHomeUrl,
  fallbackPath: storefrontBasePath,
}))
const creditDialog = ref(null)
const loginDialog = ref(null)
const divisions = ref([2, 2, 1])
const upAxis = ref('Z')
const splitAuthorizing = ref(false)
const showLabels = ref(true)
const threePreviewRef = ref(null)
const boundaryHoles = computed(() => problemEdges.value.filter(e => e.type !== 'nonManifold').length)
const boundaryEdges = computed(() => problemEdges.value.filter(e => e.type !== 'nonManifold').reduce((sum, h) => sum + h.positions.length / 3, 0))
const nonManifoldEdgeCount = computed(() => problemEdges.value.filter(e => e.type === 'nonManifold').length)
// The split inputs that produced the current chunks. The build volume can be
// edited after a split without re-splitting, so the value used for billing must
// be captured at split time, not read live.
const lastSplitContext = ref(null)
// Export keys already charged this session -> their authorization. Lets repeat
// downloads of the same configuration rebuild instantly with no second charge
// (the backend is also idempotent on the key; this is the UX layer).
const exportedAuthByKey = ref(new Map())
const exportingPackage = ref(false)
const scaleInput = ref(1)
const selectedChunkIndex = ref(null)
const selectedPartIndex = computed(() => {
  const idx = selectedChunkIndex.value
  if (idx == null) return null
  const chunk = chunks.value[idx]
  return chunk && !chunk.isKey ? idx : null
})
const appTranslations = {
  en: {
    buyCredits: 'Buy credits',
    toggleTheme: 'Toggle light / dark theme',
    watertight: 'Watertight',
    awaitingMesh: 'Awaiting mesh',
    parts: 'parts',
    free: 'free',
    credits: 'credits',
    meshDetails: 'Mesh details',
    checkMesh: 'Check mesh',
    file: 'File',
    vertices: 'Vertices',
    faces: 'Faces',
    bounds: 'Bounds',
    scale: 'Scale',
    preview: '3D PREVIEW',
    previewOptimized: 'Optimized preview',
    previewQuality: 'Preview',
    previewFaces: 'preview faces',
    printFaces: 'print faces',
    canvasHint: 'DRAG TO ROTATE · SCROLL TO ZOOM',
    connectorDragTip: 'Drag to reposition connector',
    toggleLabels: 'Toggle part labels',
    working: 'Working…',
    progress: {
      loading: 'Loading file…',
      checking: 'Checking mesh…',
      repairing: 'Repairing mesh…',
      splitting: 'Splitting mesh…',
      processing: 'Processing chunks…',
      analyzing: 'Analyzing connectors…',
      adding: 'Adding connectors…',
      updating: 'Updating connectors…',
    },
    close: 'Close',
    getCredits: 'Get extra credits',
    creditSub: 'Purchase a pack to split and export more parts.',
    freeThisMonth: 'Free this month',
    pricesIn: 'Prices in',
    viaStore: 'via the MALIEV Shopify store.',
    exportUnit: 'export',
    creditPacksLoading: 'Credit packs load when connected to the MALIEV store.',
    repairDialog: {
      title: 'Mesh repair required',
      body: 'The mesh is not watertight and has been automatically repaired. Review the result below.',
      before: 'Before repair',
      after: 'After repair',
      faces: 'faces',
      verts: 'verts',
      keepOriginal: 'Keep original',
      useRepaired: 'Use repaired mesh',
    },
    errorDialog: {
      title: 'Cannot split mesh',
      body: 'The model has holes or gaps that could not be repaired automatically. Review the highlighted areas in the 3D view.',
      holes: 'boundary holes',
      edges: 'boundary edges',
      nonManifold: 'non-manifold edges',
      dismiss: 'Dismiss',
      viewProblem: 'View on model',
    },
    uploader: {
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
    },
    partList: {
      title: 'Parts',
      total: 'total',
      empty: 'No parts yet. Upload and split a mesh.',
    },
    buildVolume: {
      title: 'Build volume',
      customManual: 'Custom (manual)',
    },
    scaleConfig: {
      title: 'Scale',
      presets: 'Scale presets',
    },
    splitConfig: {
      title: 'Split & connectors',
      part: 'part',
      parts: 'parts',
      connectors: 'Connectors',
      working: 'Working...',
      splitMesh: 'Split mesh',
      autoSplitLabel: 'Auto',
      connectorWarningTitle: 'No connector selected',
      connectorWarningBody: 'Printed parts may be difficult to align without connectors. Select Dowel, Mortise & Tenon, or Key unless you intentionally want plain cut faces.',
      connectorWarningCancel: 'Choose connector',
      connectorWarningConfirm: 'Split without connectors',
      connectorConfig: {
        reference: 'Reference',
        diameter: 'Diameter (mm)',
        depth: 'Depth (mm)',
        tenonWidth: 'Tenon width (mm)',
        tenonThickness: 'Tenon thickness (mm)',
        insertDepth: 'Insert depth (mm)',
        keyWidth: 'Key width (mm)',
        keyThickness: 'Key thickness (mm)',
        clearance: 'Clearance (mm)',
        perFace: 'Connectors per face',
        types: {
          dowel: 'Dowel',
          mortise: 'Mortise & Tenon',
          key: 'Key',
          none: 'None',
        },
      },
    },
    exportPanel: {
      preparing: 'Preparing package...',
      downloadPackage: 'Download package (STL + PDF ZIP)',
      costFree: 'Free ({n})',
        costCredit: 'Uses 1 credit',
        costUnlocked: 'Already paid · re-download is free',
        costSignIn: 'Sign in to export',
    },
    mobileActionBar: {
      splitMesh: 'Split',
      export: 'Export',
      working: 'Working…',
    },
    loginRequired: {
      eyebrow: 'Free account required',
      title: 'Sign in to export your split package',
      body: 'You can upload, scale, split, and review models without signing in. Export is free for your first 3 packages each month, then you can buy credits through MALIEV.',
      benefits: [
        '3 free exports every month',
        'Keep your credits connected to your Shopify customer account',
        'Return to this Mesh Splitter page after login',
      ],
      cta: 'Sign in free',
      keepReviewing: 'Keep reviewing',
    },
  },
  th: {
    buyCredits: 'ซื้อเครดิต',
    toggleTheme: 'สลับธีมสว่าง / มืด',
    watertight: 'ปิดผิวสมบูรณ์',
    awaitingMesh: 'รอไฟล์',
    parts: 'ชิ้น',
    free: 'ฟรี',
    credits: 'เครดิต',
    meshDetails: 'รายละเอียดเมช',
    checkMesh: 'ตรวจสอบเมช',
    file: 'ไฟล์',
    vertices: 'จุดยอด',
    faces: 'หน้า',
    bounds: 'ขนาด',
    scale: 'สเกล',
    preview: 'พรีวิว 3D',
    previewOptimized: 'พรีวิวแบบประหยัด',
    previewQuality: 'พรีวิว',
    previewFaces: 'หน้าในพรีวิว',
    printFaces: 'หน้าไฟล์จริง',
    canvasHint: 'ลากเพื่อหมุน · เลื่อนเพื่อซูม',
    connectorDragTip: 'ลากเพื่อเลื่อนตำแหน่งตัวต่อ',
    toggleLabels: 'ซ่อน/แสดงป้ายชื่อชิ้นงาน',
    working: 'กำลังทำงาน…',
    progress: {
      loading: 'กำลังโหลดไฟล์…',
      checking: 'กำลังตรวจสอบเมช…',
      repairing: 'กำลังซ่อมเมช…',
      splitting: 'กำลังแยกเมช…',
      processing: 'กำลังประมวลผลชิ้นงาน…',
      analyzing: 'กำลังวิเคราะห์ตำแหน่งตัวต่อ…',
      adding: 'กำลังเพิ่มตัวต่อ…',
      updating: 'กำลังอัปเดตตัวต่อ…',
    },
    close: 'ปิด',
    getCredits: 'ซื้อเครดิตเพิ่ม',
    creditSub: 'ซื้อแพ็กเครดิตเพื่อแยกและส่งออกชิ้นงานเพิ่ม',
    freeThisMonth: 'ฟรีเดือนนี้',
    pricesIn: 'ราคาเป็น',
    viaStore: 'ผ่านร้าน MALIEV Shopify',
    exportUnit: 'การส่งออก',
    creditPacksLoading: 'แพ็กเครดิตจะโหลดเมื่อเชื่อมต่อร้าน MALIEV',
    repairDialog: {
      title: 'จำเป็นต้องซ่อมเมช',
      body: 'เมชไม่ปิดผิว ระบบได้ซ่อมอัตโนมัติแล้ว ตรวจสอบผลลัพธ์ด้านล่าง',
      before: 'ก่อนซ่อม',
      after: 'หลังซ่อม',
      faces: 'หน้า',
      verts: 'จุด',
      keepOriginal: 'ใช้ต้นฉบับ',
      useRepaired: 'ใช้เมชที่ซ่อมแล้ว',
    },
    errorDialog: {
      title: 'ไม่สามารถตัดโมเดลได้',
      body: 'โมเดลมีรูหรือช่องว่างที่ไม่สามารถซ่อมโดยอัตโนมัติ ตรวจสอบพื้นที่ที่ไฮไลต์ในมุมมอง 3D',
      holes: 'รูขอบ',
      edges: 'ขอบรอยต่อ',
      nonManifold: 'ขอบที่ไม่ปิดผิว',
      dismiss: 'ปิด',
      viewProblem: 'ดูบนโมเดล',
    },
    uploader: {
      title: 'ไฟล์เมช',
      watertight: 'ปิดผิวสมบูรณ์',
      notWatertight: 'เมชไม่ปิดผิว',
      dropFile: 'วางไฟล์ที่นี่',
      uploadTitle: 'อัปโหลดไฟล์ STL',
      uploadHint: 'ลากไฟล์ STL มาวาง หรือคลิกเพื่อเลือกไฟล์',
      uploading: 'กำลังโหลด...',
      fileTooLarge: 'ไฟล์ใหญ่เกินไป ขนาดสูงสุด 200 MB',
      selectStl: 'กรุณาเลือกไฟล์ .stl',
      nonWatertightWarning: 'เมซไม่ปิดผิว ระบบจะพยายามซ่อมอัตโนมัติก่อนแยกชิ้นงาน',
      replace: 'เปลี่ยนไฟล์',
      loadedWatertight: 'โหลดเมชแบบปิดผิวสมบูรณ์แล้ว',
      loadedNotWatertight: 'โหลดเมชแล้ว · ผิวไม่ปิดสมบูรณ์',
      verts: 'จุดยอด',
      faces: 'หน้า',
    },
    partList: {
      title: 'รายการชิ้นงาน',
      total: 'ทั้งหมด',
      empty: 'ยังไม่มีชิ้นงาน อัปโหลดและแยกเมชก่อน',
    },
    buildVolume: {
      title: 'ขนาดพื้นที่พิมพ์',
      customManual: 'กำหนดเอง',
    },
    scaleConfig: {
      title: 'ปรับขนาด',
      presets: 'ค่าปรับขนาดสำเร็จรูป',
    },
    splitConfig: {
      title: 'แยกชิ้นงานและตัวต่อ',
      part: 'ชิ้น',
      parts: 'ชิ้น',
      connectors: 'ตัวต่อ',
      working: 'กำลังทำงาน...',
      splitMesh: 'แยกเมช',
      autoSplitLabel: 'อัตโนมัติ',
      connectorWarningTitle: 'ยังไม่ได้เลือกตัวต่อ',
      connectorWarningBody: 'ชิ้นงานที่พิมพ์แล้วอาจจัดแนวยากถ้าไม่มีตัวต่อ เลือกเดือยกลม เดือยสี่เหลี่ยม หรือคีย์ล็อก เว้นแต่ตั้งใจใช้หน้าตัดเรียบ',
      connectorWarningCancel: 'เลือกตัวต่อ',
      connectorWarningConfirm: 'แยกโดยไม่มีตัวต่อ',
      connectorConfig: {
        reference: 'ตัวอย่าง',
        diameter: 'เส้นผ่านศูนย์กลาง (มม.)',
        depth: 'ความลึก (มม.)',
        tenonWidth: 'ความกว้างเดือย (มม.)',
        tenonThickness: 'ความหนาเดือย (มม.)',
        insertDepth: 'ความลึกเสียบ (มม.)',
        keyWidth: 'ความกว้างคีย์ (มม.)',
        keyThickness: 'ความหนาคีย์ (มม.)',
        clearance: 'ระยะเผื่อ (มม.)',
        perFace: 'จำนวนตัวต่อต่อหน้า',
        types: {
          dowel: 'เดือยกลม',
          mortise: 'เดือยสี่เหลี่ยม',
          key: 'คีย์ล็อก',
          none: 'ไม่ใช้ตัวต่อ',
        },
      },
    },
    exportPanel: {
      preparing: 'กำลังเตรียมแพ็กเกจ...',
      downloadPackage: 'ดาวน์โหลดแพ็กเกจ (STL + PDF ZIP)',
      costFree: 'ฟรี ({n})',
        costCredit: 'ใช้ 1 เครดิต',
        costUnlocked: 'ชำระแล้ว · ดาวน์โหลดซ้ำฟรี',
        costSignIn: 'เข้าสู่ระบบเพื่อส่งออก',
    },
    mobileActionBar: {
      splitMesh: 'แยก',
      export: 'ส่งออก',
      working: 'กำลังทำงาน…',
    },
    loginRequired: {
      eyebrow: 'ต้องมีบัญชีฟรี',
      title: 'เข้าสู่ระบบเพื่อส่งออกไฟล์',
      body: 'คุณสามารถอัปโหลด ปรับขนาด แยกชิ้นงาน และตรวจสอบโมเดลได้โดยไม่ต้องเข้าสู่ระบบ การส่งออกฟรี 3 ครั้งแรกต่อเดือน หลังจากนั้นซื้อเครดิตผ่าน MALIEV ได้',
      benefits: [
        'ส่งออกฟรี 3 ครั้งทุกเดือน',
        'เครดิตผูกกับบัญชีลูกค้า Shopify ของคุณ',
        'หลังเข้าสู่ระบบจะกลับมาที่หน้า Mesh Splitter นี้',
      ],
      cta: 'เข้าสู่ระบบฟรี',
      keepReviewing: 'กลับไปตรวจสอบต่อ',
    },
  },
}
const uiCopy = computed(() => appTranslations[locale.value] || appTranslations.en)
const visibleError = computed(() => {
  // When the mesh is watertight, problem edges on the 3D view are a visual cue
  // and the text error can be suppressed. But if the mesh itself is non-watertight,
  // the user needs to see the error to understand why the split button is disabled.
  if (meshInfo.value?.is_watertight !== false && problemEdges.value.length > 0) return ''
  return error.value || (hasCreditAccount.value ? creditError.value : '') || ''
})
// A loaded mesh is splittable only once it is watertight. Load already attempts
// automatic repair, so a mesh that is still non-watertight is non-repairable —
// splitting it would just fail, so Split (and therefore Export) stay disabled.
const canSplitMesh = computed(() => !!meshInfo.value && !!meshInfo.value.is_watertight)
const showCreditSpinner = computed(() => creditLoading.value && !hasCreditAccount.value)
const creditChipText = computed(() => {
  if (showCreditSpinner.value) return uiCopy.value.credits
  const freeRemaining = Number(creditAccount.value.freeRemaining ?? creditPricing.value.freeGenerationsPerMonth ?? 0)
  if (hasCreditAccount.value) {
    const paidCredits = Number(creditAccount.value.paidCredits ?? Math.max(0, (creditAccount.value.availableGenerations ?? 0) - freeRemaining))
    return `${freeRemaining} ${uiCopy.value.free} · ${paidCredits} ${uiCopy.value.credits}`
  }
  return `${freeRemaining} ${uiCopy.value.free}`
})
const creditChipTitle = computed(() => {
  if (showCreditSpinner.value) return uiCopy.value.credits
  if (hasCreditAccount.value) return `${uiCopy.value.free} / ${uiCopy.value.credits}`
  return uiCopy.value.free
})
const previewFaceSummary = computed(() => {
  if (!previewInfo.value?.optimized) return ''
  return `${formatWhole(previewInfo.value.previewFaces)} / ${formatWhole(previewInfo.value.originalFaces)}`
})
const previewStatusTitle = computed(() => {
  if (!previewInfo.value?.optimized) return ''
  return `${formatWhole(previewInfo.value.previewFaces)} ${uiCopy.value.previewFaces}; ${formatWhole(previewInfo.value.originalFaces)} ${uiCopy.value.printFaces}`
})
const exportRequiresLogin = computed(() => import.meta.env.VITE_CREDITS_ENFORCEMENT === 'required' && !hasCreditAccount.value)
const currentExportKey = computed(() => {
  if (!chunks.value.length || !lastSplitContext.value) return ''
  return exportIdempotencyKey({
    format: 'package',
    meshInfo: meshInfo.value,
    scaleFactor: scaleFactor.value,
    buildVolume: lastSplitContext.value.buildVolume,
    connectorConfig: lastSplitContext.value.connectorConfig,
  })
})
const exportAlreadyUnlocked = computed(() => Boolean(currentExportKey.value) && exportedAuthByKey.value.has(currentExportKey.value))
// Total exports this account can still produce (free allowance + paid credits).
// Only meaningful once we actually have the account's data.
const availableExports = computed(() => {
  const acc = creditAccount.value
  const free = Number(acc.freeRemaining ?? 0)
  const paid = Number(acc.paidCredits ?? Math.max(0, (acc.availableGenerations ?? 0) - free))
  return free + paid
})
const exportCost = computed(() => {
  const copy = uiCopy.value.exportPanel
  if (exportAlreadyUnlocked.value) return { kind: 'unlocked', label: copy.costUnlocked }
  if (exportRequiresLogin.value) return { kind: 'login', label: copy.costSignIn }
  const free = Number(creditAccount.value.freeRemaining ?? 0)
  if (free > 0) return { kind: 'free', label: copy.costFree.replace('{n}', free) }
  return { kind: 'credit', label: copy.costCredit }
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

function resolveInitialLocale() {
  const queryLocale = new URLSearchParams(window.location.search).get('lang')
  const storedLocale = window.localStorage?.getItem('meshSplitterLocale')
  const browserLocale = navigator.language?.toLowerCase().startsWith('th') ? 'th' : 'en'
  return ['en', 'th'].includes(queryLocale) ? queryLocale : ['en', 'th'].includes(storedLocale) ? storedLocale : browserLocale
}

const theme = ref(resolveInitialTheme())
const isDark = computed(() => theme.value === 'dark')
// Dark theme swaps to the white wordmark so the logo stays legible on the dark header.
const logoUrl = computed(() => (isDark.value ? logoWordmarkWhite : logoWordmarkBlack))

function resolveInitialTheme() {
  const stored = window.localStorage?.getItem('meshSplitterTheme')
  if (stored === 'light' || stored === 'dark') return stored
  // Default to light (rather than following the OS) so first-time visitors —
  // especially on the marketing landing page — never land on dark by surprise.
  return 'light'
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

watch(theme, (value) => {
  document.documentElement.classList.toggle('dark', value === 'dark')
  window.localStorage?.setItem('meshSplitterTheme', value)
}, { immediate: true })

function toggleLocale() {
  locale.value = locale.value === 'th' ? 'en' : 'th'
  window.localStorage?.setItem('meshSplitterLocale', locale.value)
}

watch(locale, () => {
  setProgressLabels(uiCopy.value.progress)
}, { immediate: true })

watch(meshInfo, (info) => {
  if (info && info.bounds) {
    divisions.value = calculateAutoDivisions(info.bounds, buildVolume.value)
    scaleInput.value = scaleFactor.value
  }
})

watch(buildVolume, (bv) => {
  if (meshInfo.value && meshInfo.value.bounds) {
    divisions.value = calculateAutoDivisions(meshInfo.value.bounds, bv)
  }
})

async function onUpload(file) {
  selectedChunkIndex.value = null
  await loadStl(file)
}

function onScaleApply(value) {
  setScaleFactor(value)
}

async function onSplit(volume, gridDivisions, connectorConfig) {
  splitAuthorizing.value = true
  await new Promise(r => setTimeout(r, 0))
  try {
    await split(volume, gridDivisions)
    selectedChunkIndex.value = null
    if (connectorConfig?.type && connectorConfig.type !== 'None') {
      await applyConnectors(connectorConfig)
    }
    lastSplitContext.value = {
      buildVolume: [...volume],
      connectorConfig: { ...(connectorConfig || { type: 'None' }) },
    }
  } catch {
    // error set by composable
  } finally {
    splitAuthorizing.value = false
  }
}

function onSelectChunk(index) {
  // Clicking the already-selected part again clears isolation and shows the
  // whole assembly at full opacity again (toggle behaviour).
  selectedChunkIndex.value = selectedChunkIndex.value === index ? null : index
}

function onConnectorDragStart(id) {
}

function onConnectorDragEnd(id, position) {
  updateConnectorPosition(id, position)
}

function frameToProblemEdges() {
  threePreviewRef.value?.frameToProblem()
}
function dismissProblemEdges() {
  clearProblemEdges()
}

function productUrl(pack) {
  if (!shopifyStoreDomain) return `/products/${pack.handle}`
  return `https://${shopifyStoreDomain}/products/${pack.handle}`
}

function pricePerCredit(pack) {
  const credits = Number(pack.credits) || 1
  return formatPrice(Math.round(Number(pack.priceCents) / credits), pack.currency)
}

function formatPrice(priceCents, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(priceCents / 100)
}

function formatWhole(value) {
  return Number(value || 0).toLocaleString()
}

function showCreditDialog() {
  creditDialog.value?.showModal()
}

function closeCreditDialog() {
  creditDialog.value?.close()
}

function showLoginDialog() {
  loginDialog.value?.showModal()
}

function closeLoginDialog() {
  loginDialog.value?.close()
}

async function exportAfterCredit(format, buildFn) {
  if (!chunks.value.length) return
  const key = currentExportKey.value

  // Same configuration already paid for this session: rebuild and download
  // again with no second charge (skip both consume and complete).
  if (key && exportedAuthByKey.value.has(key)) {
    exportingPackage.value = true
    try {
      const { blob, filename } = await buildFn({ authorization: exportedAuthByKey.value.get(key), locale: locale.value })
      saveBlob(blob, filename)
    } finally {
      exportingPackage.value = false
    }
    return
  }

  if (exportRequiresLogin.value) {
    showLoginDialog()
    return
  }

  // Out of free exports AND paid credits: send the customer to the purchase
  // dialog instead of attempting a charge that can't succeed.
  if (hasCreditAccount.value && availableExports.value <= 0) {
    showCreditDialog()
    return
  }

  exportingPackage.value = true
  try {
    // Repair + validate the parts BEFORE charging. If nothing can be exported,
    // prepareExport throws (its message is surfaced via the composable error
    // state) and we return without spending a credit. Repairable/false-positive
    // parts are healed here; genuinely broken ones are isolated so a single bad
    // part never blocks the rest of the download.
    let prepared
    try {
      prepared = await prepareExport()
    } catch {
      return
    }

    const metadata = {
      filename: meshInfo.value?.filename,
      format,
      divisions: divisions.value,
      buildVolume: lastSplitContext.value?.buildVolume ?? buildVolume.value,
      chunkCount: prepared.exportable.length,
      isolatedParts: prepared.failed.map((part) => part.label),
    }
    const transaction = await credits.consumeExport({ idempotencyKey: key, metadata })
    const authorization = transaction.authorization
    if (import.meta.env.VITE_CREDITS_ENFORCEMENT === 'required' && !authorization?.token) {
      throw new Error('Export authorization is unavailable')
    }
    // Charge is recorded against this key now; cache the authorization so repeat
    // downloads of the same configuration are free re-builds.
    if (key) exportedAuthByKey.value = new Map(exportedAuthByKey.value).set(key, authorization)

    const { blob, filename } = await buildFn({
      authorization,
      transaction,
      locale: locale.value,
      preparedExportable: prepared.exportable,
      preparedFailed: prepared.failed,
    })
    await credits.completeExport({
      authorizationToken: authorization?.token,
      metadata: {
        ...metadata,
        packageFilename: filename,
        packageBytes: blob.size,
      },
    })
    saveBlob(blob, filename)
  } finally {
    exportingPackage.value = false
  }
}

function onExportPackage() {
  return exportAfterCredit('package', buildExportPackage)
}
</script>
