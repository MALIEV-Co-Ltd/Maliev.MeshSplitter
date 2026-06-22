<template>
  <Card>
    <CardHeader>
      <h3 class="text-lg font-semibold">Connectors</h3>
    </CardHeader>
    <CardContent class="space-y-4">
      <RadioGroup v-model="connectorType" class="grid grid-cols-2 gap-3">
        <div v-for="type in connectorTypes" :key="type.value">
          <RadioGroupItem :value="type.value" :id="`conn-${type.value}`" class="peer sr-only" />
          <Label :for="`conn-${type.value}`"
            class="flex h-full min-h-[190px] flex-col rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
            <div class="mb-2 text-sm font-medium">{{ type.title }}</div>
            <div class="connector-preview-wrapper">
              <component :is="type.visual" />
            </div>
            <p class="mt-auto text-xs text-muted-foreground">{{ type.description }}</p>
            <a :href="type.referenceUrl" target="_blank" rel="noreferrer" class="mt-2 text-xs underline">
              Reference
            </a>
          </Label>
        </div>
      </RadioGroup>

      <template v-if="connectorType !== 'None'">
        <div v-if="isDowelConnector" class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <Label>Connector diameter (mm)</Label>
            <Input type="number" step="0.5" min="2" v-model.number="diameter" />
          </div>
          <div class="space-y-1">
            <Label>Connector depth (mm)</Label>
            <Input type="number" step="0.5" min="2" v-model.number="depth" />
          </div>
        </div>
        <div v-else-if="isMortiseConnector" class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <Label>Tenon width (mm)</Label>
            <Input type="number" step="0.5" min="1" v-model.number="mortiseWidth" />
          </div>
          <div class="space-y-1">
            <Label>Tenon thickness (mm)</Label>
            <Input type="number" step="0.5" min="0.5" v-model.number="mortiseThickness" />
          </div>
          <div class="space-y-1">
            <Label>Insert depth (mm)</Label>
            <Input type="number" step="0.5" min="2" v-model.number="depth" />
          </div>
        </div>
        <div v-else class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <Label>Key width (mm)</Label>
            <Input type="number" step="0.5" min="1" v-model.number="keyWidth" />
          </div>
          <div class="space-y-1">
            <Label>Key thickness (mm)</Label>
            <Input type="number" step="0.5" min="0.5" v-model.number="keyThickness" />
          </div>
          <div class="space-y-1">
            <Label>Insert depth (mm)</Label>
            <Input type="number" step="0.5" min="2" v-model.number="depth" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <Label>Clearance (mm)</Label>
            <Input type="number" step="0.05" min="0" v-model.number="clearance" />
          </div>
          <div class="space-y-1">
            <Label>Connectors per face</Label>
            <select v-model.number="perFace"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <option :value="1">1</option>
              <option :value="2">2</option>
              <option :value="4">4</option>
            </select>
          </div>
        </div>
      </template>

      <div v-if="error" class="text-sm text-destructive">{{ error }}</div>
      <div v-if="success" class="text-sm text-green-600">{{ success }}</div>

      <Button class="w-full" @click="onApply">
        Apply
      </Button>
    </CardContent>
  </Card>
</template>

<script setup>
import { computed, defineComponent, h, ref } from 'vue'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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

const DowelVisual = defineComponent({
  name: 'DowelVisual',
  render: () => h('svg', {
    viewBox: '0 0 260 100',
    class: 'h-full w-full',
    'aria-hidden': true,
  }, [
    h('rect', {
      x: '4',
      y: '4',
      width: '252',
      height: '92',
      rx: '8',
      fill: 'none',
      stroke: 'currentColor',
      class: 'connector-diagram-box',
    }),
    h('circle', { cx: '66', cy: '50', r: '18', fill: '#0ea5e9', stroke: 'currentColor' }),
    h('circle', { cx: '130', cy: '50', r: '18', fill: '#0ea5e9', stroke: 'currentColor' }),
    h('circle', { cx: '194', cy: '50', r: '18', fill: '#dbeafe', stroke: 'currentColor' }),
  ]),
})

const MortiseVisual = defineComponent({
  name: 'MortiseVisual',
  render: () => h('svg', {
    viewBox: '0 0 260 100',
    class: 'h-full w-full',
    'aria-hidden': true,
  }, [
    h('rect', {
      x: '4',
      y: '4',
      width: '252',
      height: '92',
      rx: '8',
      fill: 'none',
      stroke: 'currentColor',
      class: 'connector-diagram-box',
    }),
    h('rect', { x: '72', y: '35', width: '42', height: '30', fill: '#0ea5e9', stroke: 'currentColor' }),
    h('rect', { x: '130', y: '35', width: '58', height: '30', fill: '#dbeafe', stroke: 'currentColor' }),
    h('rect', { x: '130', y: '47', width: '58', height: '10', fill: '#0ea5e9', fillOpacity: '0.4' }),
  ]),
})

const KeyVisual = defineComponent({
  name: 'KeyVisual',
  render: () => h('svg', {
    viewBox: '0 0 260 100',
    class: 'h-full w-full',
    'aria-hidden': true,
  }, [
    h('rect', {
      x: '4',
      y: '4',
      width: '252',
      height: '92',
      rx: '8',
      fill: 'none',
      stroke: 'currentColor',
      class: 'connector-diagram-box',
    }),
    h('rect', { x: '52', y: '40', width: '48', height: '20', fill: '#0ea5e9', stroke: 'currentColor' }),
    h('rect', { x: '104', y: '36', width: '70', height: '28', fill: '#dbeafe', stroke: 'currentColor' }),
    h('rect', { x: '104', y: '46', width: '70', height: '8', fill: '#0ea5e9', fillOpacity: '0.45' }),
  ]),
})

const NoneVisual = defineComponent({
  name: 'NoneVisual',
  render: () => h('svg', {
    viewBox: '0 0 260 100',
    class: 'h-full w-full',
    'aria-hidden': true,
  }, [
    h('rect', {
      x: '4',
      y: '4',
      width: '252',
      height: '92',
      rx: '8',
      fill: 'none',
      stroke: 'currentColor',
      class: 'connector-diagram-box',
    }),
    h('line', {
      x1: '40',
      y1: '50',
      x2: '220',
      y2: '50',
      stroke: 'currentColor',
      'stroke-width': '4',
      'stroke-linecap': 'round',
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
