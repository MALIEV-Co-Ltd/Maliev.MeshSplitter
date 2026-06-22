<template>
  <main class="landing-shell">
    <header class="lnd-header">
      <img :src="logoUrl" alt="MALIEV" />
      <nav class="lnd-nav">
        <a href="#">Home</a>
        <a href="#capabilities">Capabilities</a>
        <a href="#how-it-works">How it works</a>
        <a href="#pricing">Pricing</a>
      </nav>
      <div class="lnd-header-right">
        <a class="lnd-btn lnd-btn-outline" href="/account/login">Sign in</a>
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
        <div class="build-volume">
          <span class="volume-label">250 x 250 x 250 mm</span>
          <span class="split-plane split-plane-x"></span>
          <span class="split-plane split-plane-y"></span>
          <div class="part-stack">
            <span v-for="part in parts" :key="part" class="mesh-part">{{ part }}</span>
          </div>
        </div>
        <div class="assembly-strip">
          <span>Upload STL</span>
          <span>Scale</span>
          <span>Split</span>
          <span>Export</span>
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

    <section id="pricing" class="landing-band pricing-band" aria-label="Pricing">
      <div class="section-heading">
        <p>Pricing</p>
        <h2>Start free, then buy export credits only when needed.</h2>
      </div>
      <div class="pricing-grid">
        <article class="free-plan">
          <p class="plan-eyebrow">Included</p>
          <h3>3 free exports</h3>
          <p>Every logged-in customer gets three free exports each month.</p>
        </article>
        <a v-for="pack in pricing.creditPacks" :key="pack.sku" class="price-plan" :href="productUrl(pack)">
          <p class="plan-eyebrow">{{ pack.name }}</p>
          <h3>{{ pack.credits }} credits</h3>
          <p>{{ formatPrice(pack.priceCents, pack.currency) }}</p>
          <span>{{ pack.bestFor }}</span>
        </a>
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

const props = defineProps({
  pricing: { type: Object, required: true },
  storeDomain: { type: String, default: '' },
  launchUrl: { type: String, required: true },
})

const parts = ['P01', 'P02', 'P03', 'P04']

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
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(priceCents / 100)
}
</script>
