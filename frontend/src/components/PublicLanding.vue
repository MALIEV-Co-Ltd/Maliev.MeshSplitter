<template>
  <main class="landing-shell">
    <header class="lnd-header">
      <a class="lnd-logo" :href="homeUrl" aria-label="Go to MALIEV shop">
        <img :src="logoSrc" alt="MALIEV" />
      </a>
      <nav class="lnd-nav">
        <a href="#">{{ copy.nav.home }}</a>
        <a href="#capabilities">{{ copy.nav.capabilities }}</a>
        <a href="#how-it-works">{{ copy.nav.workflow }}</a>
        <a href="#pricing">{{ copy.nav.pricing }}</a>
      </nav>
      <div class="lnd-header-right">
        <div class="lnd-toggles">
          <button class="lnd-icon-btn" type="button" :aria-label="copy.actions.toggleTheme" @click="emit('toggle-theme')">
            <SunIcon v-if="isDark" :size="16" :stroke-width="1.75" />
            <MoonIcon v-else :size="16" :stroke-width="1.75" />
          </button>
          <button class="lnd-icon-btn lnd-icon-btn--text" type="button" @click="emit('toggle-locale')">{{ localeLabel }}</button>
        </div>
        <span v-if="hasAccountData" class="lnd-credit-chip">
          {{ account.freeRemaining }} {{ copy.credit.free }} &middot; {{ account.paidCredits }} {{ copy.credit.credits }}
        </span>
        <span v-else-if="creditsLoading" class="lnd-credit-chip lnd-credit-chip--loading">{{ copy.credit.loading }}</span>
        <a v-else class="lnd-btn lnd-btn-outline" :href="signInUrl">{{ copy.actions.signIn }}</a>
        <a class="lnd-btn lnd-btn-ink" :href="launchUrl">{{ copy.actions.launch }}</a>
      </div>
    </header>

    <section class="landing-hero">
      <div class="landing-copy">
        <p class="landing-kicker">{{ copy.hero.kicker }}</p>
        <h1>{{ copy.hero.title }}</h1>
        <p class="landing-lede">{{ copy.hero.lede }}</p>
        <div class="landing-actions">
          <a class="landing-primary" :href="launchUrl">{{ copy.actions.launch }}</a>
          <a class="landing-secondary" href="#pricing">{{ copy.actions.viewPricing }}</a>
        </div>
        <dl class="landing-proof">
          <div>
            <dt>3</dt>
            <dd>{{ copy.proof.free }}</dd>
          </div>
          <div>
            <dt>100%</dt>
            <dd>{{ copy.proof.local }}</dd>
          </div>
          <div>
            <dt>STL + PDF</dt>
            <dd>{{ copy.proof.package }}</dd>
          </div>
        </dl>
      </div>

      <div class="mesh-stage" aria-label="Mesh splitting workflow preview">
        <div class="splitter-visual">
          <img
            :src="heroImageUrl"
            alt="Low-poly rabbit STL split into labeled printable parts inside a 250 by 250 by 250 millimeter build volume with connector tabs"
          />
        </div>
      </div>
    </section>

    <section class="landing-band video-band" aria-label="Promo video">
      <div class="section-heading">
        <p>{{ copy.video.kicker }}</p>
        <h2>{{ copy.video.title }}</h2>
      </div>
      <div class="promo-video-frame">
        <video
          ref="promoVideo"
          class="promo-video"
          :src="promoVideoUrl"
          loop
          muted
          playsinline
          controls
          preload="metadata"
          aria-label="MeshSplitter promo video"
        ></video>
      </div>
    </section>

    <section id="pricing" class="pricing-section" aria-label="Pricing">
      <div class="pricing-shell">
        <div class="pricing-heading">
          <p>{{ copy.nav.pricing }}</p>
          <h2>{{ copy.pricing.title }}</h2>
          <span>{{ copy.pricing.lede }}</span>
        </div>
        <div class="pricing-grid">
          <article class="pricing-card free-plan">
            <div class="pricing-card-top">
              <p class="plan-eyebrow">{{ copy.pricing.freePlan }}</p>
              <h3>{{ copy.pricing.freeExports }}</h3>
              <p class="plan-price">
                <span>{{ copy.credit.freeLabel }}</span>
                <small>{{ copy.pricing.perMonth }}</small>
              </p>
              <p class="plan-summary">{{ copy.pricing.freeSummary }}</p>
              <a class="plan-cta" :href="signInUrl">{{ copy.actions.signInStart }}</a>
            </div>
            <div class="plan-features">
              <p>{{ copy.pricing.includes }}</p>
              <ul>
                <li v-for="feature in copy.pricing.freeFeatures" :key="feature">{{ feature }}</li>
              </ul>
            </div>
          </article>

          <a
            v-for="pack in pricing.creditPacks"
            :key="pack.sku"
            class="pricing-card price-plan"
            :class="{ featured: isFeaturedPack(pack) }"
            :href="productUrl(pack)"
          >
            <div class="pricing-card-top">
              <div class="plan-title-row">
                <p class="plan-eyebrow">{{ pack.name }}</p>
                <span v-if="isFeaturedPack(pack)" class="popular-badge">{{ copy.pricing.bestValue }}</span>
              </div>
              <h3>{{ pack.credits }} {{ copy.credit.credits }}</h3>
              <p class="plan-price">
                <span>{{ formatPrice(pack.priceCents, pack.currency) }}</span>
                <small>{{ pricePerCredit(pack) }} / {{ copy.pricing.exportUnit }}</small>
              </p>
              <p class="plan-summary">{{ pack.bestFor }}</p>
              <span class="plan-cta">{{ copy.actions.buyCredits }}</span>
            </div>
            <div class="plan-features">
              <p>{{ copy.pricing.includes }}</p>
              <ul>
                <li>{{ pack.credits }} {{ copy.pricing.paidExports }}</li>
                <li v-for="feature in copy.pricing.paidFeatures" :key="feature">{{ feature }}</li>
              </ul>
            </div>
          </a>
        </div>
      </div>
    </section>

    <section id="how-it-works" class="landing-band workflow-band" aria-label="Workflow">
      <div class="section-heading">
        <p>{{ copy.nav.workflow }}</p>
        <h2>{{ copy.workflowTitle }}</h2>
      </div>
      <div class="workflow-grid">
        <article v-for="step in workflow" :key="step.title">
          <span>{{ step.number }}</span>
          <h3>{{ step.title }}</h3>
          <p>{{ step.copy }}</p>
        </article>
      </div>
    </section>

    <section id="capabilities" class="landing-band capability-band" aria-label="Capabilities">
      <div class="capability-copy">
        <p class="landing-kicker">{{ copy.capabilityKicker }}</p>
        <h2>{{ copy.capabilityTitle }}</h2>
        <p>{{ copy.capabilityCopy }}</p>
      </div>
      <div class="capability-list">
        <div v-for="item in capabilities" :key="item.title">
          <strong>{{ item.title }}</strong>
          <span>{{ item.copy }}</span>
        </div>
      </div>
    </section>

    <section class="landing-cta">
      <div>
        <p class="landing-kicker">{{ copy.cta.kicker }}</p>
        <h2>{{ copy.cta.title }}</h2>
      </div>
      <a class="landing-primary" :href="launchUrl">{{ copy.actions.launch }}</a>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Sun as SunIcon, Moon as MoonIcon } from '@lucide/vue'
import logoBlack from '../assets/logos/maliev-wordmark-black.svg'
import logoWhite from '../assets/logos/maliev-wordmark-white.svg'
import heroImageUrl from '../assets/mesh-splitter-hero.webp'

// Square promo video, hosted on Shopify's CDN (too large to bundle in the app).
const promoVideoUrl = 'https://cdn.shopify.com/videos/c/o/v/98eb9a0da3d54a8cae7010bcf57fdb9e.mp4'
const promoVideo = ref(null)

// Muted autoplay is only allowed when the element is muted *before* play; Vue's
// static `muted` attribute doesn't reliably set the property, so force it here.
// Controls remain so the visitor can pause, scrub, or unmute.
onMounted(() => {
  const el = promoVideo.value
  if (!el) return
  el.muted = true
  el.play?.().catch(() => {})
})

const props = defineProps({
  pricing: { type: Object, required: true },
  account: { type: Object, required: true },
  hasAccountData: { type: Boolean, default: false },
  creditsLoading: { type: Boolean, default: false },
  storeDomain: { type: String, default: '' },
  homeUrl: { type: String, default: 'https://shop.maliev.com/' },
  launchUrl: { type: String, required: true },
  signInUrl: { type: String, default: '/account/login' },
  locale: { type: String, default: 'en' },
  isDark: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle-locale', 'toggle-theme'])

// The dark wordmark vanishes on the dark-mode header, so swap to the white one.
const logoSrc = computed(() => (props.isDark ? logoWhite : logoBlack))

const translations = {
  en: {
    nav: { home: 'Home', capabilities: 'Capabilities', workflow: 'How it works', pricing: 'Pricing' },
    actions: { signIn: 'Sign in', signInStart: 'Sign in to start', launch: 'Launch MeshSplitter', viewPricing: 'View pricing', buyCredits: 'Buy credits', toggleTheme: 'Toggle light / dark theme' },
    credit: { free: 'free', credits: 'credits', loading: 'Credits loading', freeLabel: 'Free' },
    hero: {
      kicker: 'MALIEV MeshSplitter',
      title: 'Split oversized STL files into print-ready, labeled parts.',
      lede: 'Prepare large models for smaller printers. Upload, scale, define build volume, add connectors, review the split, and export a ZIP of labeled STLs with a PDF assembly guide.',
    },
    proof: { free: 'free exports monthly', local: 'credit-gated export', package: 'export package' },
    video: {
      kicker: 'See it in action',
      title: 'Watch one oversized model become a printable, labeled assembly.',
    },
    pricing: {
      title: 'Start free, then buy export credits only when needed.',
      lede: 'Test the workflow with monthly free exports. Pay only when you download more STL + PDF ZIP packages.',
      freePlan: 'Free monthly plan',
      freeExports: '3 exports',
      perMonth: 'per month',
      freeSummary: 'Included for every signed-in customer to test real models first.',
      includes: 'Includes',
      bestValue: 'Best value',
      exportUnit: 'export',
      paidExports: 'paid exports after free allowance',
      freeFeatures: ['Upload and inspect STL files', 'Scale and define printer build volume', 'Split, label, review, and export packages', 'Resets every calendar month'],
      paidFeatures: ['Credits stay in your customer account', 'One ZIP with labeled STLs and PDF guide', 'Receipt-marked production package'],
    },
    workflowTitle: 'From one large mesh to a printable assembly packet.',
    capabilityKicker: 'Built for fabrication decisions',
    capabilityTitle: 'Know what will happen before you spend a generation.',
    capabilityCopy: 'MeshSplitter gives makers a clear review flow before export: scale, fit, split, label, add connectors, and verify the production package.',
    cta: { kicker: 'Ready to test a real model?', title: 'Sign in, use the free monthly exports, and verify the output.' },
    workflow: [
      { number: '01', title: 'Upload and inspect', copy: 'Load STL geometry, read bounds, faces, vertices, and watertight status before splitting.' },
      { number: '02', title: 'Fit the printer', copy: 'Apply scale and build-volume presets for common printers or enter the exact usable chamber.' },
      { number: '03', title: 'Split with connectors', copy: 'Create labeled parts and optional alignment connectors so the assembly stays understandable.' },
      { number: '04', title: 'Export the packet', copy: 'Download labeled STL parts in a ZIP and a PDF assembly instruction sheet for the job.' },
    ],
    capabilities: [
      { title: 'Production package control', copy: 'Downloads are tied to a signed-in customer account and export receipt.' },
      { title: 'Manifold-minded output', copy: 'The workflow validates watertight meshes and blocks broken exports.' },
      { title: '3D review canvas', copy: 'Inspect split parts and labels before downloading production files.' },
      { title: 'Credit controlled', copy: 'Free monthly allowance first, then paid credits through Shopify checkout.' },
    ],
  },
  th: {
    nav: { home: 'หน้าแรก', capabilities: 'ความสามารถ', workflow: 'วิธีใช้งาน', pricing: 'ราคา' },
    actions: { signIn: 'เข้าสู่ระบบ', signInStart: 'เข้าสู่ระบบเพื่อเริ่ม', launch: 'เปิด MeshSplitter', viewPricing: 'ดูราคา', buyCredits: 'ซื้อเครดิต', toggleTheme: 'สลับธีมสว่าง / มืด' },
    credit: { free: 'ฟรี', credits: 'เครดิต', loading: 'กำลังโหลดเครดิต', freeLabel: 'ฟรี' },
    hero: {
      kicker: 'MALIEV MeshSplitter',
      title: 'แยกไฟล์ STL ขนาดใหญ่เป็นชิ้นงานพร้อมพิมพ์และมีป้ายกำกับ',
      lede: 'เตรียมโมเดลขนาดใหญ่ให้พิมพ์กับเครื่องพิมพ์ขนาดเล็กได้ อัปโหลด ปรับสเกล กำหนดพื้นที่พิมพ์ เพิ่มตัวต่อ ตรวจสอบชิ้นงาน และส่งออก ZIP ที่มี STL พร้อม PDF คู่มือประกอบ',
    },
    proof: { free: 'ส่งออกฟรีทุกเดือน', local: 'ส่งออกผ่านเครดิต', package: 'แพ็กเกจ STL + PDF' },
    video: {
      kicker: 'ดูการทำงานจริง',
      title: 'ดูโมเดลขนาดใหญ่หนึ่งชิ้นกลายเป็นชุดประกอบที่พร้อมพิมพ์และมีป้ายกำกับ',
    },
    pricing: {
      title: 'เริ่มใช้ฟรี แล้วซื้อเครดิตเมื่อจำเป็นต้องส่งออกเพิ่ม',
      lede: 'ทดลองขั้นตอนการทำงานด้วยสิทธิ์ส่งออกฟรีรายเดือน จ่ายเงินเฉพาะเมื่อดาวน์โหลดแพ็กเกจ STL + PDF เพิ่ม',
      freePlan: 'แผนใช้ฟรีรายเดือน',
      freeExports: 'ส่งออก 3 ครั้ง',
      perMonth: 'ต่อเดือน',
      freeSummary: 'มีให้ลูกค้าที่เข้าสู่ระบบทุกคน เพื่อทดลองกับโมเดลจริงก่อนจ่ายเงิน',
      includes: 'รวม',
      bestValue: 'คุ้มที่สุด',
      exportUnit: 'การส่งออก',
      paidExports: 'การส่งออกแบบชำระเงินหลังใช้สิทธิ์ฟรี',
      freeFeatures: ['อัปโหลดและตรวจสอบไฟล์ STL', 'ปรับสเกลและกำหนดพื้นที่พิมพ์', 'แยกชิ้นงาน ใส่ป้าย ตรวจสอบ และส่งออก', 'รีเซ็ตใหม่ทุกเดือน'],
      paidFeatures: ['เครดิตอยู่ในบัญชีลูกค้า', 'ZIP เดียวพร้อม STL ที่ติดป้ายและคู่มือ PDF', 'แพ็กเกจผลิตจริงพร้อมรหัสอ้างอิง'],
    },
    workflowTitle: 'จากเมชขนาดใหญ่หนึ่งไฟล์ สู่แพ็กเกจประกอบที่พร้อมพิมพ์',
    capabilityKicker: 'ออกแบบเพื่อการตัดสินใจงานผลิต',
    capabilityTitle: 'รู้ผลลัพธ์ก่อนใช้เครดิตส่งออก',
    capabilityCopy: 'MeshSplitter ช่วยให้ตรวจสอบงานก่อนส่งออกได้ชัดเจน ตั้งแต่ปรับสเกล กำหนดพื้นที่พิมพ์ แยกชิ้น ใส่ป้าย เพิ่มตัวต่อ และตรวจสอบแพ็กเกจผลิตจริง',
    cta: { kicker: 'พร้อมทดลองกับโมเดลจริงแล้วหรือยัง?', title: 'เข้าสู่ระบบ ใช้สิทธิ์ส่งออกฟรีรายเดือน และตรวจสอบผลลัพธ์ได้ทันที' },
    workflow: [
      { number: '01', title: 'อัปโหลดและตรวจสอบ', copy: 'โหลด STL อ่านขนาด จำนวนหน้า จุดยอด และสถานะ watertight ก่อนแยกชิ้นงาน' },
      { number: '02', title: 'ปรับให้พอดีเครื่องพิมพ์', copy: 'ใช้พรีเซ็ตพื้นที่พิมพ์ของเครื่องยอดนิยม หรือใส่ขนาดพื้นที่ใช้งานจริงเอง' },
      { number: '03', title: 'แยกชิ้นพร้อมตัวต่อ', copy: 'สร้างชิ้นงานมีป้ายกำกับและตัวต่อช่วยจัดแนว เพื่อให้ประกอบง่าย' },
      { number: '04', title: 'ส่งออกแพ็กเกจ', copy: 'ดาวน์โหลด STL ที่ติดป้ายใน ZIP พร้อม PDF คู่มือประกอบสำหรับงานนั้น' },
    ],
    capabilities: [
      { title: 'ควบคุมแพ็กเกจผลิตจริง', copy: 'การดาวน์โหลดผูกกับบัญชีลูกค้าและรหัสอ้างอิงการส่งออก' },
      { title: 'คำนึงถึงเมช manifold', copy: 'ระบบตรวจสอบเมช watertight และป้องกันการส่งออกไฟล์ที่เสีย' },
      { title: 'ตรวจสอบด้วย 3D canvas', copy: 'ดูชิ้นงานที่แยกและป้ายกำกับก่อนดาวน์โหลดไฟล์ผลิตจริง' },
      { title: 'ควบคุมด้วยเครดิต', copy: 'เริ่มจากสิทธิ์ฟรีรายเดือน แล้วซื้อเครดิตผ่าน Shopify checkout' },
    ],
  },
}

const copy = computed(() => translations[props.locale] || translations.en)
const workflow = computed(() => copy.value.workflow)
const capabilities = computed(() => copy.value.capabilities)
const localeLabel = computed(() => (props.locale === 'th' ? 'EN' : 'ไทย'))

function productUrl(pack) {
  if (!pack?.handle) return '#pricing'
  if (!props.storeDomain) return `/products/${pack.handle}`
  return `https://${props.storeDomain}/products/${pack.handle}`
}

function formatPrice(priceCents, currency) {
  const hasFraction = priceCents % 100 !== 0
  return new Intl.NumberFormat(props.locale === 'th' ? 'th-TH' : 'en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(priceCents / 100)
}

function pricePerCredit(pack) {
  if (!pack?.credits || !pack?.priceCents) return 'Priced per export'
  return formatPrice(Math.round(pack.priceCents / pack.credits), pack.currency)
}

function isFeaturedPack(pack) {
  return pack?.sku === 'MS-CREDITS-30'
}
</script>
