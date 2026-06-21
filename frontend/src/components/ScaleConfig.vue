<template>
  <Card>
    <CardHeader>
      <h3 class="text-lg font-semibold">Scale</h3>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="grid grid-cols-[1fr_auto] items-end gap-3">
        <div class="space-y-2">
          <Label for="scale-factor">Scale factor</Label>
          <Input
            id="scale-factor"
            type="number"
            min="0.01"
            max="25.4"
            step="0.01"
            :model-value="draft"
            :disabled="!enabled || loading"
            @update:model-value="draft = $event"
          />
        </div>
        <Button :disabled="!enabled || loading || !isValid" @click="apply">
          Apply
        </Button>
      </div>
      <div class="flex flex-wrap gap-2" aria-label="Scale presets">
        <Button
          v-for="preset in presets"
          :key="preset.label"
          type="button"
          variant="outline"
          size="sm"
          :disabled="!enabled || loading"
          @click="applyPreset(preset.value)"
        >
          {{ preset.label }}
        </Button>
      </div>
      <p class="text-sm text-muted-foreground">Current scale {{ percent }}%.</p>
    </CardContent>
  </Card>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
