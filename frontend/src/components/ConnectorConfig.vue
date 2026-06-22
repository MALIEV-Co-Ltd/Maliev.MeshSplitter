<template>
  <div class="pnl">
    <div class="pnl-head">
      <div class="pnl-title">
        <Link2Icon />
        Connectors
      </div>
    </div>
    <div class="pnl-body space-y-3">
      <RadioGroup v-model="connectorType" class="conn-pills">
        <div v-for="type in connectorTypes" :key="type.value">
          <RadioGroupItem :value="type.value" :id="`conn-${type.value}`" class="peer sr-only" />
          <Label :for="`conn-${type.value}`"
            class="flex cursor-pointer flex-col gap-1 rounded-sm border border-input bg-background p-2 hover:bg-accent peer-data-[state=checked]:border-signal peer-data-[state=checked]:bg-signal/10 [&:has([data-state=checked])]:border-signal [&:has([data-state=checked])]:bg-signal/10">
            <span class="conn-pill-name">{{ type.title }}</span>
            <div class="connector-preview-wrapper">
              <component :is="type.visual" />
            </div>
            <a :href="type.referenceUrl" target="_blank" rel="noreferrer" class="text-[10px] text-muted-foreground underline">
              Reference
            </a>
          </Label>
        </div>
      </RadioGroup>

      <template v-if="connectorType !== 'None'">
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
      </template>

      <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
      <p v-if="success" class="text-sm text-positive">{{ success }}</p>

      <Button class="w-full justify-center" @click="onApply">
        Apply connectors
      </Button>
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, ref } from 'vue'
import { Link2 as Link2Icon } from '@lucide/vue'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const props = defineProps({
  error: { type: String, default: '' },
  success: { type: String, default: '' },
})

const emit = defineEmits(['apply'])

const diameter = ref(6)
const depth = ref(10)
const clearance = ref(0.1)
const perFace = ref(1)
const mortiseWidth = ref(6)
const mortiseThickness = ref(4)
const keyWidth = ref(6)
const keyThickness = ref(3.5)

const BOX_PROPS = {
  x: '4', y: '4', width: '252', height: '92', rx: '8',
  fill: 'none', stroke: 'var(--steel-300)',
}

const DowelVisual = defineComponent({
  name: 'DowelVisual',
  render: () => h('svg', {
    viewBox: '0 0 260 100',
    class: 'h-full w-full',
    'aria-hidden': true,
  }, [
    h('rect', { ...BOX_PROPS, class: 'connector-diagram-box' }),
    h('circle', { cx: '66', cy: '50', r: '18', fill: 'var(--signal-100)', stroke: 'var(--signal-500)' }),
    h('circle', { cx: '130', cy: '50', r: '18', fill: 'var(--signal-100)', stroke: 'var(--signal-500)' }),
    h('circle', { cx: '194', cy: '50', r: '18', fill: 'var(--steel-100)', stroke: 'var(--steel-300)' }),
  ]),
})

const MortiseVisual = defineComponent({
  name: 'MortiseVisual',
  render: () => h('svg', {
    viewBox: '0 0 260 100',
    class: 'h-full w-full',
    'aria-hidden': true,
  }, [
    h('rect', { ...BOX_PROPS, class: 'connector-diagram-box' }),
    h('rect', { x: '72', y: '35', width: '42', height: '30', fill: 'var(--signal-100)', stroke: 'var(--signal-500)' }),
    h('rect', { x: '130', y: '35', width: '58', height: '30', fill: 'var(--steel-100)', stroke: 'var(--steel-300)' }),
    h('rect', { x: '130', y: '47', width: '58', height: '10', fill: 'var(--signal-500)', 'fill-opacity': '0.25' }),
  ]),
})

const KeyVisual = defineComponent({
  name: 'KeyVisual',
  render: () => h('svg', {
    viewBox: '0 0 260 100',
    class: 'h-full w-full',
    'aria-hidden': true,
  }, [
    h('rect', { ...BOX_PROPS, class: 'connector-diagram-box' }),
    h('rect', { x: '52', y: '40', width: '48', height: '20', fill: 'var(--signal-100)', stroke: 'var(--signal-500)' }),
    h('rect', { x: '104', y: '36', width: '70', height: '28', fill: 'var(--steel-100)', stroke: 'var(--steel-300)' }),
    h('rect', { x: '104', y: '46', width: '70', height: '8', fill: 'var(--signal-500)', 'fill-opacity': '0.3' }),
  ]),
})

const NoneVisual = defineComponent({
  name: 'NoneVisual',
  render: () => h('svg', {
    viewBox: '0 0 260 100',
    class: 'h-full w-full',
    'aria-hidden': true,
  }, [
    h('rect', { ...BOX_PROPS, class: 'connector-diagram-box' }),
    h('line', {
      x1: '40',
      y1: '50',
      x2: '220',
      y2: '50',
      stroke: 'var(--steel-300)',
      'stroke-width': '4',
      'stroke-linecap': 'round',
      'stroke-dasharray': '10 8',
    }),
  ]),
})

const connectorTypes = [
  {
    value: 'Dowel',
    title: 'Dowel',
    description: 'Round peg and matching round hole. Best for quick alignment on simple cuts.',
    visual: DowelVisual,
    referenceUrl: 'https://en.wikipedia.org/wiki/Dowel',
  },
  {
    value: 'Mortise & Tenon',
    title: 'Mortise & Tenon',
    description: 'A rectangular tongue inserted into a matching slot. Strong for straight joints.',
    visual: MortiseVisual,
    referenceUrl: 'https://en.wikipedia.org/wiki/Mortise_and_tenon_joint',
  },
  {
    value: 'Key',
    title: 'Key',
    description: 'Flat rectangular key with matching slot for clean edge-to-edge alignment.',
    visual: KeyVisual,
    referenceUrl: 'https://en.wikipedia.org/wiki/Key_joint',
  },
  {
    value: 'None',
    title: 'None',
    description: 'Split without connectors.',
    visual: NoneVisual,
    referenceUrl: 'https://en.wikipedia.org/wiki/Fit_%28joining%29',
  },
]

const connectorType = ref('None')
const isDowelConnector = computed(() => connectorType.value === 'Dowel')
const isMortiseConnector = computed(() => connectorType.value === 'Mortise & Tenon')
const isKeyConnector = computed(() => connectorType.value === 'Key')

function onApply() {
  const config = { type: connectorType.value }
  if (connectorType.value !== 'None') {
    config.depth = depth.value
    config.clearance = clearance.value
    config.perFace = perFace.value

    if (isDowelConnector.value) {
      config.diameter = diameter.value
    } else if (isMortiseConnector.value) {
      config.tenonWidth = mortiseWidth.value
      config.tenonThickness = mortiseThickness.value
    } else if (isKeyConnector.value) {
      config.keyWidth = keyWidth.value
      config.keyHeight = keyThickness.value
    }
  }
  emit('apply', config)
}
</script>
