<template>
  <div class="pnl">
    <div class="pnl-head">
      <div class="pnl-title">
        <RulerIcon />
        Scale
      </div>
      <span class="pnl-meta">{{ percent }}%</span>
    </div>
    <div class="pnl-body">
      <div class="scale-row">
        <Input
          id="scale-factor"
          type="number"
          min="0.01"
          max="25.4"
          step="0.01"
          class="font-mono"
          :model-value="draft"
          :disabled="!enabled || loading"
          @update:model-value="draft = $event"
        />
        <Button size="sm" variant="outline" :disabled="!enabled || loading || !isValid" @click="apply">
          Apply
        </Button>
      </div>
      <div class="mt-2 flex flex-wrap gap-2" aria-label="Scale presets">
        <Button
          v-for="preset in presets"
          :key="preset.label"
          type="button"
          variant="outline"
          size="xs"
          :disabled="!enabled || loading"
          @click="applyPreset(preset.value)"
        >
          {{ preset.label }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Ruler as RulerIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const props = defineProps({
  modelValue: { type: Number, default: 1 },
  enabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'apply'])

const draft = ref(props.modelValue)
const presets = [
  { label: '50%', value: 0.5 },
  { label: '100%', value: 1 },
  { label: '200%', value: 2 },
  { label: '2540%', value: 25.4 },
]

const numericDraft = computed(() => Number(draft.value))
const isValid = computed(() => Number.isFinite(numericDraft.value) && numericDraft.value > 0 && numericDraft.value <= 25.4)
const percent = computed(() => Math.round(props.modelValue * 100))

watch(() => props.modelValue, (value) => {
  draft.value = value
})

function applyPreset(value) {
  draft.value = value
  apply()
}

function apply() {
  if (!isValid.value) return
  emit('update:modelValue', numericDraft.value)
  emit('apply', numericDraft.value)
}
</script>
