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
      <div class="axis-row">
        <div v-for="(axis, i) in ['X', 'Y', 'Z']" :key="axis" class="axis-item">
          <span class="axis-label">{{ axis }}</span>
          <Slider
            :min="1" :max="5" :step="1"
            :model-value="[divisions[i]]"
            @update:model-value="setDivisions(i, $event[0])"
            class="flex-1"
          />
          <span class="axis-val">{{ divisions[i] }}</span>
        </div>
      </div>

      <div class="conn-subhead">
        <Link2Icon :size="13" :stroke-width="1.75" />
        {{ labels.connectors }}
      </div>
      <ConnectorConfig v-model="connectorConfig" :labels="labels.connectorConfig" />

      <p v-if="err" class="text-sm text-destructive">{{ err }}</p>
      <p v-if="success" class="text-sm text-positive">{{ success }}</p>
      <Button class="w-full justify-center" :disabled="!ok || loading" @click="onSplit">
        {{ loading ? labels.working : labels.splitMesh }}
      </Button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Rows3 as Rows3Icon, Link2 as Link2Icon } from '@lucide/vue'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import ConnectorConfig from './ConnectorConfig.vue'

const props = defineProps({
  v: { type: Array, required: true },
  ok: { type: Boolean, default: false },
  err: { type: String, default: '' },
  success: { type: String, default: '' },
  divisions: { type: Array, default: () => [2, 2, 1] },
  loading: { type: Boolean, default: false },
  labels: {
    type: Object,
    default: () => ({
      title: 'Split & connectors',
      part: 'part',
      parts: 'parts',
      connectors: 'Connectors',
      working: 'Working...',
      splitMesh: 'Split mesh',
      connectorConfig: undefined,
    }),
  },
})

const emit = defineEmits(['split', 'update:divisions'])

const connectorConfig = ref({ type: 'None' })
const totalParts = computed(() => props.divisions.reduce((a, b) => a * b, 1))

function setDivisions(i, val) {
  const d = [...props.divisions]
  d[i] = val
  emit('update:divisions', d)
}

function onSplit() {
  if (!props.ok) return
  emit('split', [...props.v], [...props.divisions], { ...connectorConfig.value })
}
</script>
