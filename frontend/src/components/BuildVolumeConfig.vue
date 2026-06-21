<template>
  <Card>
    <CardHeader>
      <h3 class="text-lg font-semibold">Build Volume</h3>
    </CardHeader>
    <CardContent class="space-y-3">
      <div class="grid grid-cols-3 gap-3">
        <div v-for="(axis, i) in ['X', 'Y', 'Z']" :key="axis" class="space-y-1">
          <Label :for="`build-volume-${axis}`">{{ axis }} (mm)</Label>
          <Input :id="`build-volume-${axis}`" type="number" min="1" step="1" :model-value="localVolume[i]"
            @update:model-value="updateAxis(i, $event)" />
        </div>
      </div>
      <div class="flex gap-2 flex-wrap">
        <Button v-for="preset in presets" :key="preset.label" variant="outline" size="sm" @click="setPreset(preset)">
          {{ preset.label }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>

<script setup>
import { computed } from 'vue'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

const props = defineProps({
  modelValue: { type: Array, required: true },
})
const emit = defineEmits(['update:modelValue'])

const localVolume = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const presets = [
  { label: 'X1C', value: [250, 250, 250] },
  { label: 'MK4', value: [250, 210, 220] },
  { label: 'V2.4', value: [350, 350, 350] },
]

function setPreset(preset) {
  emit('update:modelValue', [...preset.value])
}

function updateAxis(i, val) {
  const next = [...localVolume.value]
  next[i] = Number(val)
  emit('update:modelValue', next)
}
</script>
