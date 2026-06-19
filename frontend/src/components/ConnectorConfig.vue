<template>
  <Card>
    <CardHeader>
      <h3 class="text-lg font-semibold">Connectors</h3>
    </CardHeader>
    <CardContent class="space-y-4">
      <RadioGroup v-model="connectorType" class="grid grid-cols-2 gap-3">
        <div v-for="t in types" :key="t">
          <RadioGroupItem :value="t" :id="`conn-${t}`" class="peer sr-only" />
          <Label :for="`conn-${t}`"
            class="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
            {{ t }}
          </Label>
        </div>
      </RadioGroup>

      <template v-if="connectorType !== 'None'">
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <Label>Diameter (mm)</Label>
            <Input type="number" step="0.5" min="2" v-model.number="diameter" />
          </div>
          <div class="space-y-1">
            <Label>Depth (mm)</Label>
            <Input type="number" step="0.5" min="2" v-model.number="depth" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <Label>Clearance (mm)</Label>
            <Input type="number" step="0.05" min="0" v-model.number="clearance" />
          </div>
          <div class="space-y-1">
            <Label>Per face</Label>
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
import { ref } from 'vue'
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

const types = ['Dowel', 'Mortise & Tenon', 'Key', 'None']
const connectorType = ref('None')
const diameter = ref(6)
const depth = ref(10)
const clearance = ref(0.1)
const perFace = ref(1)

function onApply() {
  const config = { type: connectorType.value }
  if (connectorType.value !== 'None') {
    config.diameter = diameter.value
    config.depth = depth.value
    config.clearance = clearance.value
    config.perFace = perFace.value
  }
  emit('apply', config)
}
</script>
