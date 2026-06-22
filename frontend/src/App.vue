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
    @toggle-locale="toggleLocale"
  />
  <main v-else class="app-shell">
    <header class="app-header">
      <a class="app-logo app-logo-link" :href="storeHomeUrl" aria-label="Go to MALIEV shop">
        <img :src="logoUrl" alt="MALIEV" />
        <span>Mesh Splitter</span>
      </a>
      <div class="app-status" aria-label="Workflow status">
        <span class="status-chip" :class="{ ok: meshInfo?.is_watertight }">
          <span class="dot"></span>{{ meshInfo?.is_watertight ? uiCopy.watertight : uiCopy.awaitingMesh }}
        </span>
        <span class="status-chip">{{ chunks.length || 0 }} {{ uiCopy.parts }}</span>
        <span class="status-chip credit-chip" :title="creditChipTitle">
          <Loader2Icon v-if="showCreditSpinner" :size="12" :stroke-width="2" class="coin-icon animate-spin" />
          <CoinsIcon v-else :size="12" :stroke-width="1.75" class="coin-icon" />
          {{ creditChipText }}
        </span>
      </div>
      <div class="header-right">
        <Button variant="ghost" size="sm" class="language-toggle" @click="toggleLocale">
          {{ locale === 'th' ? 'EN' : 'ไทย' }}
        </Button>
        <Button variant="outline" size="sm" @click="showCreditDialog">
          {{ uiCopy.buyCredits }}
        </Button>
      </div>
    </header>
    <div class="workspace-grid">
      <section class="col-left">
        <MeshUploader :mesh-info="meshInfo" :loading="loading" :error="error" :labels="uiCopy.uploader" @upload="onUpload" />
        <PartList
          :chunks="chunks"
          :selected-chunk-index="selectedChunkIndex"
          :labels="uiCopy.partList"
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
            <span>{{ uiCopy.meshDetails }}</span>
            <span>{{ meshInfo.is_watertight ? uiCopy.watertight : uiCopy.checkMesh }}</span>
          </div>
          <div class="canvas-inspector__grid">
            <div><span>{{ uiCopy.file }}</span><strong>{{ meshInfo.filename }}</strong></div>
            <div><span>{{ uiCopy.vertices }}</span><strong>{{ meshInfo.verts?.toLocaleString() }}</strong></div>
            <div><span>{{ uiCopy.faces }}</span><strong>{{ meshInfo.faces?.toLocaleString() }}</strong></div>
            <div><span>{{ uiCopy.bounds }}</span><strong>{{ previewDims }}</strong></div>
            <div><span>{{ uiCopy.scale }}</span><strong>{{ scaleFactor.toFixed(3) }}x</strong></div>
          </div>
        </div>
        <div class="canvas-label">{{ uiCopy.preview }}{{ previewDims ? ` · ${previewDims}` : '' }} · {{ uiCopy.scale.toUpperCase() }} {{ scaleFactor.toFixed(3) }}&times;</div>
        <div class="canvas-hint">{{ uiCopy.canvasHint }}</div>
      </section>

      <section class="col-right">
        <BuildVolumeConfig v-model="buildVolume" :labels="uiCopy.buildVolume" />
        <ScaleConfig v-model="scaleInput" :enabled="!!meshInfo" :loading="loading" :mesh-info="meshInfo" :labels="uiCopy.scaleConfig" @apply="onScaleApply" />
        <SplitConfig :v="buildVolume" :ok="!!meshInfo" :err="visibleError" :success="connectorSuccess" :loading="splitAuthorizing || loading" :divisions="divisions" :labels="uiCopy.splitConfig" @update:divisions="divisions = $event" @split="onSplit" />
        <ExportPanel
          :has-chunks="chunks.length > 0"
          :loading="loading || exportingPackage"
          :labels="uiCopy.exportPanel"
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
          <a v-for="pack in creditPricing.creditPacks" :key="pack.sku" :href="productUrl(pack)" class="credit-pack">
            <span class="credit-pack__info">
              <span class="credit-pack__name">{{ pack.name }}</span>
              <span class="credit-pack__credits">{{ pack.credits }} credits</span>
            </span>
            <span class="credit-pack__price">{{ formatPrice(pack.priceCents, pack.currency) }}</span>
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
const locale = ref(resolveInitialLocale())
const signInUrl = computed(() => buildCustomerLoginUrl(currentPath || storefrontBasePath))
const connectorSuccess = ref('')
const creditDialog = ref(null)
const loginDialog = ref(null)
const divisions = ref([2, 2, 1])
const upAxis = ref('Z')
const splitAuthorizing = ref(false)
const exportSessionId = ref('')
const exportingPackage = ref(false)
const scaleInput = ref(1)
const selectedChunkIndex = ref(null)
const appTranslations = {
  en: {
    buyCredits: 'Buy credits',
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
    canvasHint: 'DRAG TO ROTATE · SCROLL TO ZOOM',
    close: 'Close',
    getCredits: 'Get extra credits',
    creditSub: 'Purchase a pack to split and export more parts.',
    freeThisMonth: 'Free this month',
    pricesIn: 'Prices in',
    viaStore: 'via the MALIEV Shopify store.',
    creditPacksLoading: 'Credit packs load from the backend when connected to Shopify.',
    connectorsApplied: 'Connectors applied',
    uploader: {
      title: 'Mesh file',
      watertight: 'Watertight',
      notWatertight: 'Not watertight',
      dropFile: 'Drop file here',
      uploadTitle: 'Upload an STL file',
      uploadHint: 'Drag & drop an STL file or click to browse',
      uploading: 'Uploading...',
      selectStl: 'Please select an .stl file',
      nonWatertightWarning: 'Mesh is not watertight. Mesh Splitter will try automatic repair before splitting.',
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
    watertight: 'ปิดผิวสมบูรณ์',
    awaitingMesh: 'รอเมช',
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
    canvasHint: 'ลากเพื่อหมุน · เลื่อนเพื่อซูม',
    close: 'ปิด',
    getCredits: 'ซื้อเครดิตเพิ่ม',
    creditSub: 'ซื้อแพ็กเครดิตเพื่อแยกและส่งออกชิ้นงานเพิ่ม',
    freeThisMonth: 'ฟรีเดือนนี้',
    pricesIn: 'ราคาเป็น',
    viaStore: 'ผ่านร้าน MALIEV Shopify',
    creditPacksLoading: 'แพ็กเครดิตจะโหลดจาก backend เมื่อเชื่อมต่อ Shopify',
    connectorsApplied: 'เพิ่มตัวต่อเรียบร้อย',
    uploader: {
      title: 'ไฟล์เมช',
      watertight: 'ปิดผิวสมบูรณ์',
      notWatertight: 'เมชไม่ปิดผิว',
      dropFile: 'วางไฟล์ที่นี่',
      uploadTitle: 'อัปโหลดไฟล์ STL',
      uploadHint: 'ลากไฟล์ STL มาวาง หรือคลิกเพื่อเลือกไฟล์',
      uploading: 'กำลังอัปโหลด...',
      selectStl: 'กรุณาเลือกไฟล์ .stl',
      nonWatertightWarning: 'เมชไม่ปิดผิว ระบบจะพยายามซ่อมอัตโนมัติก่อนแยกชิ้นงาน',
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
const visibleError = computed(() => error.value || (hasCreditAccount.value ? creditError.value : '') || '')
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
const exportRequiresLogin = computed(() => import.meta.env.VITE_CREDITS_ENFORCEMENT === 'required' && !hasCreditAccount.value)
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

function resolveInitialLocale() {
  const queryLocale = new URLSearchParams(window.location.search).get('lang')
  const storedLocale = window.localStorage?.getItem('meshSplitterLocale')
  const browserLocale = navigator.language?.toLowerCase().startsWith('th') ? 'th' : 'en'
  return ['en', 'th'].includes(queryLocale) ? queryLocale : ['en', 'th'].includes(storedLocale) ? storedLocale : browserLocale
}

function toggleLocale() {
  locale.value = locale.value === 'th' ? 'en' : 'th'
  window.localStorage?.setItem('meshSplitterLocale', locale.value)
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
      connectorSuccess.value = uiCopy.value.connectorsApplied
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

function showLoginDialog() {
  loginDialog.value?.showModal()
}

function closeLoginDialog() {
  loginDialog.value?.close()
}

async function exportAfterCredit(format, buildFn) {
  if (!chunks.value.length) return
  if (exportRequiresLogin.value) {
    showLoginDialog()
    return
  }
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
