<template>
  <div class="pnl">
    <div class="pnl-head">
      <div class="pnl-title">
        <Rows3Icon />
        Split grid
      </div>
      <span class="pnl-meta">{{ divisions[0] }}&times;{{ divisions[1] }}&times;{{ divisions[2] }} &middot; {{ totalParts }} part{{ totalParts === 1 ? '' : 's' }}</span>
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
      <p v-if="err" class="text-sm text-destructive">{{ err }}</p>
      <Button class="w-full justify-center" :disabled="!ok || loading" @click="onSplit">
        {{ loading ? 'Authorizing…' : 'Split mesh' }}
      </Button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Rows3 as Rows3Icon } from '@lucide/vue'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'

const props = defineProps({
  v: { type: Array, required: true },
  ok: { type: Boolean, default: false },
  err: { type: String, default: '' },
  divisions: { type: Array, default: () => [2, 2, 1] },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['split', 'update:divisions'])

const totalParts = computed(() => props.divisions.reduce((a, b) => a * b, 1))

function setDivisions(i, val) {
  const d = [...props.divisions]
  d[i] = val
  emit('update:divisions', d)
}

function onSplit() {
  if (!props.ok) return
  emit('split', [...props.v], [...props.divisions])
}
</script>
