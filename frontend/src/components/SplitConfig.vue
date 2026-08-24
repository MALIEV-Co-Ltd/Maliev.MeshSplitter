<template>
  <div class="pnl">
    <div class="pnl-head">
      <div class="pnl-title">
        <Rows3Icon />
        {{ labels.title }}
      </div>
      <span class="pnl-meta">{{ divisions[0] }}&times;{{ divisions[1] }}&times;{{ divisions[2] }} &middot; {{ totalParts }} {{ totalParts === 1 ? labels.part : labels.parts }}</span>
    </div>
    <div class="pnl-body space-y-3">
      <fieldset class="space-y-2">
        <legend class="text-xs font-semibold">{{ labels.splitMode || 'Split mode' }}</legend>
        <div class="grid grid-cols-3 gap-1">
          <label v-for="mode in splitModes" :key="mode.value" class="rounded border p-2 text-center text-xs" :class="{ 'border-signal': splitMode === mode.value }">
            <input v-model="splitMode" class="sr-only" type="radio" name="split-mode" :value="mode.value" :disabled="mode.value === 'color' && !colorBoundaryAvailable" @change="changeMode" />
            {{ mode.label }}
          </label>
        </div>
      </fieldset>
      <div v-if="splitMode !== 'build-volume'" class="space-y-2">
        <p class="text-xs text-muted-foreground">{{ labels.localOnly || 'Analyzed locally in your browser. Select a closed boundary before splitting.' }}</p>
        <div v-if="boundaryCandidates.length" class="grid gap-1" role="listbox" :aria-label="labels.boundaries || 'Detected boundaries'">
          <button v-for="(candidate, index) in boundaryCandidates" :key="candidate.id" type="button" class="rounded border px-2 py-1 text-left text-xs" :class="{ 'border-signal bg-muted': selectedBoundaryId === candidate.id }" @click="emit('select-boundary', candidate.id)">
            {{ labels.boundary || 'Boundary' }} {{ index + 1 }} · {{ Math.round(candidate.score * 100) }}%
          </button>
        </div>
        <p v-else class="text-xs text-muted-foreground">{{ labels.noBoundaries || 'No safe closed boundaries detected yet.' }}</p>
      </div>
      <div class="conn-subhead">
        <Link2Icon :size="13" :stroke-width="1.75" />
        {{ labels.connectors }}
      </div>
      <ConnectorConfig v-model="connectorConfig" :labels="labels.connectorConfig" />

      <p v-if="err" class="text-sm text-destructive">{{ err }}</p>
      <div v-if="showConnectorWarning" class="connector-warning" role="dialog" aria-modal="false" :aria-label="labels.connectorWarningTitle">
        <div>
          <strong>{{ labels.connectorWarningTitle }}</strong>
          <p>{{ labels.connectorWarningBody }}</p>
        </div>
        <div class="connector-warning__actions">
          <Button variant="outline" class="justify-center" @click="showConnectorWarning = false">
            {{ labels.connectorWarningCancel }}
          </Button>
          <Button class="justify-center" data-testid="confirm-split-without-connectors" @click="emitSplit">
            {{ labels.connectorWarningConfirm }}
          </Button>
        </div>
      </div>
      <Button v-if="showSplitButton" class="split-btn w-full justify-center" :disabled="!ok || loading || (splitMode !== 'build-volume' && !selectedBoundaryId)" @click="onSplit">
        <span v-if="loading" class="split-spinner" />
        {{ loading ? (progressLabel || labels.working) : labels.splitMesh }}
      </Button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Rows3 as Rows3Icon, Link2 as Link2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import ConnectorConfig from './ConnectorConfig.vue'

const props = defineProps({
  v: { type: Array, required: true },
  ok: { type: Boolean, default: false },
  err: { type: String, default: '' },
  divisions: { type: Array, default: () => [2, 2, 1] },
  loading: { type: Boolean, default: false },
  progressLabel: { type: String, default: '' },
  showSplitButton: { type: Boolean, default: true },
  colorBoundaryAvailable: { type: Boolean, default: false },
  boundaryCandidates: { type: Array, default: () => [] },
  selectedBoundaryId: { type: String, default: null },
  labels: {
    type: Object,
    default: () => ({
      title: 'Split & connectors',
      part: 'part',
      parts: 'parts',
      connectors: 'Connectors',
      working: 'Working...',
      splitMesh: 'Split mesh',
      autoSplitLabel: 'Auto',
      connectorWarningTitle: 'No connector selected',
      connectorWarningBody: 'Printed parts may be difficult to align without connectors. Select a connector type unless you intentionally want plain cut faces.',
      connectorWarningCancel: 'Choose connector',
      connectorWarningConfirm: 'Split without connectors',
      connectorConfig: undefined,
    }),
  },
})

const emit = defineEmits(['split', 'analyze-boundaries', 'select-boundary'])
const splitMode = ref('build-volume')
const splitModes = computed(() => [
  { value: 'build-volume', label: props.labels.buildVolumeMode || 'Build volume' },
  { value: 'feature', label: props.labels.featureMode || 'Feature' },
  { value: 'color', label: props.labels.colorMode || 'Color' },
])

// Key is the default: its loose flat key prints with a flat surface against the
// bed (no overhangs / support material) while still aligning the parts.
const connectorConfig = ref({
  type: 'Key',
  depth: 5,
  clearance: 0.3,
  perFace: 2,
  keyWidth: 6,
  keyHeight: 3.5,
})
const showConnectorWarning = ref(false)
const totalParts = computed(() => props.divisions.reduce((a, b) => a * b, 1))

function emitSplit() {
  showConnectorWarning.value = false
  emit('split', [...props.v], [...props.divisions], { ...connectorConfig.value }, { mode: splitMode.value, boundaryId: props.selectedBoundaryId })
}

function changeMode() {
  if (splitMode.value === 'feature' || splitMode.value === 'color') {
    connectorConfig.value = { ...connectorConfig.value, type: 'Square Taper', autoSize: true, purpose: 'alignment-only' }
    emit('analyze-boundaries', splitMode.value)
  }
}

function onSplit() {
  if (!props.ok) return
  if (!connectorConfig.value?.type || connectorConfig.value.type === 'None') {
    showConnectorWarning.value = true
    return
  }
  emitSplit()
}

// Lets an external trigger (the mobile action bar) run the same split flow,
// including the "no connector selected" warning, so the logic lives in one place.
function requestSplit() {
  onSplit()
}
defineExpose({ requestSplit })
</script>
