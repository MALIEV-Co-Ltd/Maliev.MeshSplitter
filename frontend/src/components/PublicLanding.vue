<template>
  <main class="landing-shell">
    <header class="lnd-header">
      <a class="lnd-logo" :href="homeUrl" aria-label="Go to MALIEV shop">
        <img :src="logoUrl" alt="MALIEV" />
      </a>
      <nav class="lnd-nav">
        <a href="#">Home</a>
        <a href="#capabilities">Capabilities</a>
        <a href="#how-it-works">How it works</a>
        <a href="#pricing">Pricing</a>
      </nav>
      <div class="lnd-header-right">
        <span v-if="hasAccountData" class="lnd-credit-chip">
          {{ account.freeRemaining }} free · {{ account.paidCredits }} credits
        </span>
        <span v-else-if="creditsLoading" class="lnd-credit-chip lnd-credit-chip--loading">Credits loading</span>
        <a v-else class="lnd-btn lnd-btn-outline" :href="signInUrl">Sign in</a>
        <a class="lnd-btn lnd-btn-ink" :href="launchUrl">Launch MeshSplitter</a>
      </div>
    </header>
    <section class="landing-hero">
      <div class="landing-copy">
        <p class="landing-kicker">MALIEV MeshSplitter</p>
        <h1>Split oversized STL files into print-ready, labeled parts.</h1>
        <p class="landing-lede">
          Prepare large models for smaller printers in the browser. Upload, scale,
          define build volume, add connectors, review the split, and export a ZIP
          of labeled STLs with a PDF assembly guide.
        </p>
        <div class="landing-actions">
          <a class="landing-primary" :href="launchUrl">Launch MeshSplitter</a>
          <a class="landing-secondary" href="#pricing">View pricing</a>
        </div>
        <dl class="landing-proof">
          <div>
            <dt>3</dt>
            <dd>free exports monthly</dd>
          </div>
          <div>
            <dt>100%</dt>
            <dd>local mesh processing</dd>
          </div>
          <div>
            <dt>STL + PDF</dt>
            <dd>export package</dd>
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

    <section id="pricing" class="pricing-section" aria-label="Pricing">
      <div class="pricing-shell">
        <div class="pricing-heading">
          <p>Pricing</p>
          <h2>Start free, then buy export credits only when needed.</h2>
          <span>Test the workflow with monthly free exports. Pay only when you download more STL + PDF ZIP packages.</span>
        </div>
        <div class="pricing-grid">
          <article class="pricing-card free-plan">
            <div class="pricing-card-top">
              <p class="plan-eyebrow">Free monthly plan</p>
              <h3>3 exports</h3>
              <p class="plan-price">
                <span>Free</span>
                <small>per month</small>
              </p>
              <p class="plan-summary">Included for every signed-in customer to test real models first.</p>
              <a class="plan-cta" :href="signInUrl">Sign in to start</a>
            </div>
            <div class="plan-features">
              <p>Includes</p>
              <ul>
                <li>Upload and inspect STL files locally</li>
                <li>Scale and define printer build volume</li>
                <li>Split, label, review, and export packages</li>
                <li>Resets every calendar month</li>
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
                <span v-if="isFeaturedPack(pack)" class="popular-badge">Best value</span>
              </div>
              <h3>{{ pack.credits }} credits</h3>
              <p class="plan-price">
                <span>{{ formatPrice(pack.priceCents, pack.currency) }}</span>
                <small>{{ pricePerCredit(pack) }} / export</small>
              </p>
              <p class="plan-summary">{{ pack.bestFor }}</p>
              <span class="plan-cta">Buy credits</span>
            </div>
            <div class="plan-features">
              <p>Includes</p>
              <ul>
                <li>{{ pack.credits }} paid exports after free allowance</li>
                <li>Credits stay in your customer account</li>
                <li>One ZIP with labeled STLs and PDF guide</li>
                <li>Browser-local mesh processing</li>
              </ul>
            </div>
          </a>
        </div>
      </div>
    </section>

    <section id="how-it-works" class="landing-band workflow-band" aria-label="Workflow">
      <div class="section-heading">
        <p>Workflow</p>
        <h2>From one large mesh to a printable assembly packet.</h2>
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
        <p class="landing-kicker">Built for fabrication decisions</p>
        <h2>Know what will happen before you spend a generation.</h2>
        <p>
          MeshSplitter keeps computation on the customer's device. The server only
          verifies customer access and credits; geometry stays local for speed and
          privacy.
        </p>
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
        <p class="landing-kicker">Ready to test a real model?</p>
        <h2>Sign in, use the free monthly exports, and verify the output.</h2>
      </div>
      <a class="landing-primary" :href="launchUrl">Launch MeshSplitter</a>
    </section>
  </main>
</template>

<script setup>
import logoUrl from '../assets/logos/maliev-wordmark-black.svg'
import heroImageUrl from '../assets/mesh-splitter-hero.webp'

const props = defineProps({
  pricing: { type: Object, required: true },
  account: { type: Object, required: true },
  hasAccountData: { type: Boolean, default: false },
  creditsLoading: { type: Boolean, default: false },
  storeDomain: { type: String, default: '' },
  homeUrl: { type: String, default: 'https://shop.maliev.com/' },
  launchUrl: { type: String, required: true },
  signInUrl: { type: String, default: '/account/login' },
})

const workflow = [
  {
    number: '01',
    title: 'Upload and inspect',
    copy: 'Load STL geometry locally, read bounds, faces, vertices, and watertight status before splitting.',
  },
  {
    number: '02',
    title: 'Fit the printer',
    copy: 'Apply scale and build-volume presets for common printers or enter the exact usable chamber.',
  },
  {
    number: '03',
    title: 'Split with connectors',
    copy: 'Create labeled parts and optional alignment connectors so the assembly stays understandable.',
  },
  {
    number: '04',
    title: 'Export the packet',
    copy: 'Download labeled STL parts in a ZIP and a PDF assembly instruction sheet for the job.',
  },
]

const capabilities = [
  { title: 'Local WASM geometry', copy: 'No server-side mesh computation or uploaded model storage.' },
  { title: 'Manifold-minded output', copy: 'The workflow validates watertight meshes and blocks broken exports.' },
  { title: '3D review canvas', copy: 'Inspect split parts and labels before downloading production files.' },
  { title: 'Credit controlled', copy: 'Free monthly allowance first, then paid credits through Shopify checkout.' },
]

function productUrl(pack) {
  if (!pack?.handle) return '#pricing'
  if (!props.storeDomain) return `/products/${pack.handle}`
  return `https://${props.storeDomain}/products/${pack.handle}`
}

function formatPrice(priceCents, currency) {
  const hasFraction = priceCents % 100 !== 0
  return new Intl.NumberFormat('en-US', {
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
