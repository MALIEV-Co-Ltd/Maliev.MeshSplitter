<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between">
      <h3 class="text-lg font-semibold">Split Configuration</h3>
      <Button v-if="ok" variant="ghost" size="sm" @click="expanded = !expanded">
        {{ expanded ? 'Hide' : 'Edit' }}
      </Button>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="text-sm text-muted-foreground">
        {{ divisions[0] }}×{{ divisions[1] }}×{{ divisions[2] }} grid &middot; {{ totalParts }} part{{ totalParts === 1 ? '' : 's' }}
      </div>
      <div v-show="expanded" class="space-y-4">
        <div v-for="(axis, i) in ['X', 'Y', 'Z']" :key="axis" class="space-y-2">
          <Label>{{ axis }} divisions: {{ divisions[i] }}</Label>
          <div class="flex items-center gap-3">
            <Slider
              :min="1" :max="5" :step="1"
              :model-value="[divisions[i]]"
              @update:model-value="setDivisions(i, $event[0])"
              class="flex-1"
            />
            <Input type="number" min="1" max="5" :model-value="divisions[i]"
              @update:model-value="setDivisions(i, clamp($event))"
              class="w-16" />
          </div>
        </div>
      </div>
      <p v-if="err" class="text-sm text-destructive">{{ err }}</p>
      <Button class="w-full" :disabled="!ok || loading" @click="onSplit">
        {{ loading ? 'Authorizing…' : 'Split' }}
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
import { Button } from '@/components/ui/button'

const props = defineProps({
  v: { type: Array, required: true },
  ok: { type: Boolean, default: false },
  err: { type: String, default: '' },
  divisions: { type: Array, default: () => [2, 2, 1] },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['split', 'update:divisions'])
const expanded = ref(false)

const totalParts = computed(() => props.divisions.reduce((a, b) => a * b, 1))

function clamp(val) {
  const n = Number(val)
  if (isNaN(n)) return 1
  return Math.max(1, Math.min(5, n))
}

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
