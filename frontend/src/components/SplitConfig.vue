<template>
  <Card>
    <CardHeader>
      <h3 class="text-lg font-semibold">Split Configuration</h3>
    </CardHeader>
    <CardContent class="space-y-4">
      <div v-for="(axis, i) in ['X', 'Y', 'Z']" :key="axis" class="space-y-2">
        <Label>{{ axis }} divisions: {{ divisions[i] }}</Label>
        <div class="flex items-center gap-3">
          <Slider
            :min="1" :max="5" :step="1"
            :model-value="[divisions[i]]"
            @update:model-value="divisions[i] = $event[0]"
            class="flex-1"
          />
          <Input type="number" min="1" max="5" :model-value="divisions[i]"
            @update:model-value="divisions[i] = clamp($event)"
            class="w-16" />
        </div>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-sm text-muted-foreground">Total parts:</span>
        <Badge variant="secondary">{{ totalParts }}</Badge>
      </div>
      <p v-if="err" class="text-sm text-destructive">{{ err }}</p>
      <Button class="w-full" :disabled="!ok" @click="onSplit">
        Split
      </Button>
    </CardContent>
  </Card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const props = defineProps({
  v: { type: Array, required: true },
  ok: { type: Boolean, default: false },
  err: { type: String, default: '' },
})

const emit = defineEmits(['split'])

const divisions = ref([2, 2, 1])

const totalParts = computed(() => divisions.value.reduce((a, b) => a * b, 1))

function clamp(val) {
  const n = Number(val)
  if (isNaN(n)) return 1
  return Math.max(1, Math.min(5, n))
}

function onSplit() {
  if (!props.ok) return
  emit('split', [...props.v], [...divisions.value])
}
</script>
