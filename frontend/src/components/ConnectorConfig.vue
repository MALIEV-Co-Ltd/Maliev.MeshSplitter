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
            {{ labels.reference }}
          </a>
        </div>
      </div>
    </div>

    <div v-if="connectorType !== 'None'" class="mt-3 space-y-2">
      <div v-if="isDowelConnector" class="conn-params">
        <div class="conn-field">
          <label>{{ labels.diameter }}</label>
          <Input type="number" step="0.5" min="2" class="h-8 font-mono text-xs" v-model.number="diameter" />
        </div>
        <div class="conn-field">
          <label>{{ labels.depth }}</label>
          <Input type="number" step="0.5" min="2" class="h-8 font-mono text-xs" v-model.number="depth" />
        </div>
      </div>
      <div v-else-if="isMortiseConnector" class="conn-params">
        <div class="conn-field">
          <label>{{ labels.tenonWidth }}</label>
          <Input type="number" step="0.5" min="1" class="h-8 font-mono text-xs" v-model.number="mortiseWidth" />
        </div>
        <div class="conn-field">
          <label>{{ labels.tenonThickness }}</label>
          <Input type="number" step="0.5" min="0.5" class="h-8 font-mono text-xs" v-model.number="mortiseThickness" />
        </div>
        <div class="conn-field">
          <label>{{ labels.insertDepth }}</label>
          <Input type="number" step="0.5" min="2" class="h-8 font-mono text-xs" v-model.number="depth" />
        </div>
      </div>
      <div v-else class="conn-params">
        <div class="conn-field">
          <label>{{ labels.keyWidth }}</label>
          <Input type="number" step="0.5" min="1" class="h-8 font-mono text-xs" v-model.number="keyWidth" />
        </div>
        <div class="conn-field">
          <label>{{ labels.keyThickness }}</label>
          <Input type="number" step="0.5" min="0.5" class="h-8 font-mono text-xs" v-model.number="keyThickness" />
        </div>
        <div class="conn-field">
          <label>{{ labels.insertDepth }}</label>
          <Input type="number" step="0.5" min="2" class="h-8 font-mono text-xs" v-model.number="depth" />
        </div>
      </div>
      <div class="conn-params">
        <div class="conn-field">
          <label>{{ labels.clearance }}</label>
          <Input type="number" step="0.05" min="0" class="h-8 font-mono text-xs" v-model.number="clearance" />
        </div>
        <div class="conn-field">
          <label>{{ labels.perFace }}</label>
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
  modelValue: {
    type: Object,
    default: () => ({
      type: 'Key',
      depth: 5,
      clearance: 0.3,
      perFace: 2,
      keyWidth: 6,
      keyHeight: 3.5,
    }),
  },
  labels: {
    type: Object,
    default: () => ({
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
    }),
  },
})

const emit = defineEmits(['update:modelValue'])

const diameter = ref(6)
const depth = ref(5)
const clearance = ref(0.3)
const perFace = ref(2)
const mortiseWidth = ref(6)
const mortiseThickness = ref(4)
const keyWidth = ref(6)
const keyThickness = ref(3.5)

// Exploded cross-section: two steel halves pulled apart so BOTH mating faces are
// visible, with the male feature, the female pocket, and (for keys) the loose
// piece drawn distinctly. The defining geometry — round pin vs square tenon vs
// separate key bar vs nothing — is the hero of each icon so they don't blur
// together at thumbnail size.
const BY = 9
const BH = 22
const BW = 24
const LX = 4 // left block 4..28
const RX = 52 // right block 52..76
const MID = 40

const BLOCK = { fill: 'var(--steel-100)', stroke: 'var(--steel-400)', 'stroke-width': '1.4', rx: '2', 'stroke-linejoin': 'round' }
const POCKET = { fill: 'var(--steel-50)', stroke: 'var(--steel-400)', 'stroke-width': '1.2', 'stroke-linejoin': 'round' }
const PIN = { fill: 'var(--signal-500)', stroke: 'var(--signal-700)', 'stroke-width': '1', 'stroke-linejoin': 'round' }

function leftBlock() {
  return h('rect', { x: LX, y: BY, width: BW, height: BH, ...BLOCK })
}
function rightBlock() {
  return h('rect', { x: RX, y: BY, width: BW, height: BH, ...BLOCK })
}

function svg(name, children) {
  return defineComponent({
    name,
    render: () => h('svg', { viewBox: '0 0 80 40', class: 'h-full w-full', 'aria-hidden': true }, children),
  })
}

// Round pin (rounded ends = cylinder) entering a round bore on the far block.
const DowelVisual = svg('DowelVisual', [
  leftBlock(),
  rightBlock(),
  h('ellipse', { cx: 56, cy: BY + BH / 2, rx: '3.5', ry: '5', ...POCKET }),
  h('rect', { x: '24', y: BY + BH / 2 - 4, width: '22', height: '8', rx: '4', ...PIN }),
])

// Square-shouldered tenon projecting from the left half into a rectangular
// mortise pocket cut in the right half.
const MortiseVisual = svg('MortiseVisual', [
  leftBlock(),
  rightBlock(),
  h('rect', { x: '52', y: BY + 5, width: '9', height: BH - 10, ...POCKET }),
  h('rect', { x: '28', y: BY + 5, width: '20', height: BH - 10, rx: '0.5', ...PIN }),
])

// Loose flat key seated symmetrically in slots cut into BOTH halves.
const KeyVisual = svg('KeyVisual', [
  leftBlock(),
  rightBlock(),
  h('rect', { x: '21', y: BY + 6, width: '7', height: BH - 12, ...POCKET }),
  h('rect', { x: '52', y: BY + 6, width: '7', height: BH - 12, ...POCKET }),
  h('rect', { x: '24', y: BY + BH / 2 - 3.5, width: '32', height: '7', rx: '1', ...PIN }),
])

// Plain butt joint — two halves that simply meet, no hardware.
const NoneVisual = svg('NoneVisual', [
  h('rect', { x: '4', y: BY, width: '36', height: BH, ...BLOCK }),
  h('rect', { x: '40', y: BY, width: '36', height: BH, ...BLOCK }),
  h('line', { x1: MID, y1: BY - 2, x2: MID, y2: BY + BH + 2, stroke: 'var(--steel-400)', 'stroke-width': '1.4', 'stroke-dasharray': '3 2' }),
])

const connectorTypes = computed(() => [
  {
    value: 'Dowel',
    title: props.labels.types?.dowel || 'Dowel',
    visual: DowelVisual,
    referenceUrl: 'https://www.google.com/search?tbm=isch&q=Dowel',
  },
  {
    value: 'Mortise & Tenon',
    title: props.labels.types?.mortise || 'Mortise & Tenon',
    visual: MortiseVisual,
    referenceUrl: 'https://www.google.com/search?tbm=isch&q=Mortise+and+Tenon',
  },
  {
    value: 'Key',
    title: props.labels.types?.key || 'Key',
    visual: KeyVisual,
    referenceUrl: 'https://www.google.com/search?tbm=isch&q=Key+joint',
  },
  {
    value: 'None',
    title: props.labels.types?.none || 'None',
    visual: NoneVisual,
    referenceUrl: 'https://www.google.com/search?tbm=isch&q=joining+fit',
  },
])

const connectorType = ref(props.modelValue?.type || 'Key')
const isOpen = ref(false)
const selectedType = computed(() => connectorTypes.value.find((type) => type.value === connectorType.value) || connectorTypes.value.at(-1))
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
