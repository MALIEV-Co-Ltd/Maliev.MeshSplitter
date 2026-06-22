<template>
  <div>
    <div class="conn-select">
      <button
        type="button"
        class="conn-select-trigger"
        aria-haspopup="listbox"
        :aria-expanded="isOpen"
        @click="isOpen = !isOpen"
      >
        <span class="conn-selected">
          <span class="conn-pill-name">{{ selectedType.title }}</span>
          <span class="connector-preview-wrapper connector-preview-wrapper--selected">
            <component :is="selectedType.visual" />
          </span>
        </span>
        <ChevronDownIcon :size="14" :stroke-width="1.75" :class="{ 'rotate-180': isOpen }" />
      </button>

      <div v-if="isOpen" class="conn-select-menu" role="listbox">
        <div v-for="type in connectorTypes" :key="type.value" class="conn-option-card">
          <button
            type="button"
            class="conn-option-button"
            role="option"
            :aria-selected="connectorType === type.value"
            @click="selectType(type.value)"
          >
            <span class="conn-pill-name">{{ type.title }}</span>
            <span class="connector-preview-wrapper">
              <component :is="type.visual" />
            </span>
          </button>
          <a :href="type.referenceUrl" target="_blank" rel="noreferrer" class="conn-option-link">
            Reference
          </a>
        </div>
      </div>
    </div>

    <div v-if="connectorType !== 'None'" class="mt-3 space-y-2">
      <div v-if="isDowelConnector" class="conn-params">
        <div class="conn-field">
          <label>Diameter (mm)</label>
          <Input type="number" step="0.5" min="2" class="h-8 font-mono text-xs" v-model.number="diameter" />
        </div>
        <div class="conn-field">
          <label>Depth (mm)</label>
          <Input type="number" step="0.5" min="2" class="h-8 font-mono text-xs" v-model.number="depth" />
        </div>
      </div>
      <div v-else-if="isMortiseConnector" class="conn-params">
        <div class="conn-field">
          <label>Tenon width (mm)</label>
          <Input type="number" step="0.5" min="1" class="h-8 font-mono text-xs" v-model.number="mortiseWidth" />
        </div>
        <div class="conn-field">
          <label>Tenon thickness (mm)</label>
          <Input type="number" step="0.5" min="0.5" class="h-8 font-mono text-xs" v-model.number="mortiseThickness" />
        </div>
        <div class="conn-field">
          <label>Insert depth (mm)</label>
          <Input type="number" step="0.5" min="2" class="h-8 font-mono text-xs" v-model.number="depth" />
        </div>
      </div>
      <div v-else class="conn-params">
        <div class="conn-field">
          <label>Key width (mm)</label>
          <Input type="number" step="0.5" min="1" class="h-8 font-mono text-xs" v-model.number="keyWidth" />
        </div>
        <div class="conn-field">
          <label>Key thickness (mm)</label>
          <Input type="number" step="0.5" min="0.5" class="h-8 font-mono text-xs" v-model.number="keyThickness" />
        </div>
        <div class="conn-field">
          <label>Insert depth (mm)</label>
          <Input type="number" step="0.5" min="2" class="h-8 font-mono text-xs" v-model.number="depth" />
        </div>
      </div>
      <div class="conn-params">
        <div class="conn-field">
          <label>Clearance (mm)</label>
          <Input type="number" step="0.05" min="0" class="h-8 font-mono text-xs" v-model.number="clearance" />
        </div>
        <div class="conn-field">
          <label>Connectors per face</label>
          <select v-model.number="perFace"
            class="flex h-8 w-full rounded-sm border border-input bg-background px-2 font-mono text-xs text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <option :value="1">1</option>
            <option :value="2">2</option>
            <option :value="4">4</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, ref, watch } from 'vue'
import { ChevronDown as ChevronDownIcon } from '@lucide/vue'
import { Input } from '@/components/ui/input'

const props = defineProps({
  modelValue: { type: Object, default: () => ({ type: 'None' }) },
})

const emit = defineEmits(['update:modelValue'])

const diameter = ref(6)
const depth = ref(10)
const clearance = ref(0.1)
const perFace = ref(1)
const mortiseWidth = ref(6)
const mortiseThickness = ref(4)
const keyWidth = ref(6)
const keyThickness = ref(3.5)

// Two-block side-view diagrams: a steel "part A" / "part B" pair joined by a
// signal-colored connector shape, so the joint type reads at a glance instead
// of the abstract circle/rect rows this replaced.
const BLOCK_A = { x: '4', y: '6', width: '28', height: '28', rx: '2', fill: 'var(--steel-100)', stroke: 'var(--steel-300)' }
const BLOCK_B = { x: '48', y: '6', width: '28', height: '28', rx: '2', fill: 'var(--steel-100)', stroke: 'var(--steel-300)' }
const SEAM = { x1: '40', y1: '3', x2: '40', y2: '37', stroke: 'var(--steel-300)', 'stroke-width': '1', 'stroke-dasharray': '2 2' }

const DowelVisual = defineComponent({
  name: 'DowelVisual',
  render: () => h('svg', { viewBox: '0 0 80 40', class: 'h-full w-full', 'aria-hidden': true }, [
    h('rect', BLOCK_A),
    h('rect', BLOCK_B),
    h('line', SEAM),
    h('rect', { x: '28', y: '16', width: '24', height: '8', rx: '4', fill: 'var(--signal-100)', stroke: 'var(--signal-500)' }),
  ]),
})

const MortiseVisual = defineComponent({
  name: 'MortiseVisual',
  render: () => h('svg', { viewBox: '0 0 80 40', class: 'h-full w-full', 'aria-hidden': true }, [
    h('rect', BLOCK_A),
    h('rect', BLOCK_B),
    h('line', SEAM),
    h('rect', { x: '30', y: '15', width: '20', height: '10', fill: 'var(--signal-100)', stroke: 'var(--signal-500)' }),
  ]),
})

const KeyVisual = defineComponent({
  name: 'KeyVisual',
  render: () => h('svg', { viewBox: '0 0 80 40', class: 'h-full w-full', 'aria-hidden': true }, [
    h('rect', BLOCK_A),
    h('rect', BLOCK_B),
    h('line', SEAM),
    h('rect', { x: '26', y: '18', width: '28', height: '4', rx: '1', fill: 'var(--signal-100)', stroke: 'var(--signal-500)' }),
  ]),
})

const NoneVisual = defineComponent({
  name: 'NoneVisual',
  render: () => h('svg', { viewBox: '0 0 80 40', class: 'h-full w-full', 'aria-hidden': true }, [
    h('rect', { ...BLOCK_A, width: '26' }),
    h('rect', { ...BLOCK_B, x: '50', width: '26' }),
    h('line', { x1: '38', y1: '20', x2: '42', y2: '20', stroke: 'var(--steel-300)', 'stroke-width': '2', 'stroke-dasharray': '2 2' }),
  ]),
})

const connectorTypes = [
  {
    value: 'Dowel',
    title: 'Dowel',
    visual: DowelVisual,
    referenceUrl: 'https://en.wikipedia.org/wiki/Dowel',
  },
  {
    value: 'Mortise & Tenon',
    title: 'Mortise & Tenon',
    visual: MortiseVisual,
    referenceUrl: 'https://en.wikipedia.org/wiki/Mortise_and_tenon_joint',
  },
  {
    value: 'Key',
    title: 'Key',
    visual: KeyVisual,
    referenceUrl: 'https://en.wikipedia.org/wiki/Key_joint',
  },
  {
    value: 'None',
    title: 'None',
    visual: NoneVisual,
    referenceUrl: 'https://en.wikipedia.org/wiki/Fit_%28joining%29',
  },
]

const connectorType = ref(props.modelValue?.type || 'None')
const isOpen = ref(false)
const selectedType = computed(() => connectorTypes.find((type) => type.value === connectorType.value) || connectorTypes.at(-1))
const isDowelConnector = computed(() => connectorType.value === 'Dowel')
const isMortiseConnector = computed(() => connectorType.value === 'Mortise & Tenon')
const isKeyConnector = computed(() => connectorType.value === 'Key')

const config = computed(() => {
  const c = { type: connectorType.value }
  if (connectorType.value !== 'None') {
    c.depth = depth.value
    c.clearance = clearance.value
    c.perFace = perFace.value

    if (isDowelConnector.value) {
      c.diameter = diameter.value
    } else if (isMortiseConnector.value) {
      c.tenonWidth = mortiseWidth.value
      c.tenonThickness = mortiseThickness.value
    } else if (isKeyConnector.value) {
      c.keyWidth = keyWidth.value
      c.keyHeight = keyThickness.value
    }
  }
  return c
})

watch(config, (value) => emit('update:modelValue', value), { immediate: true, deep: true })

function selectType(value) {
  connectorType.value = value
  isOpen.value = false
}
</script>
