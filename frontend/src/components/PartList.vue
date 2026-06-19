<template>
  <Card>
    <CardHeader>
      <h3 class="text-lg font-semibold">Parts ({{ chunks.length }})</h3>
    </CardHeader>
    <CardContent>
      <div v-if="chunks.length === 0" class="text-sm text-muted-foreground">
        No parts yet. Upload and split a mesh.
      </div>
      <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        <Card v-for="chunk in chunks" :key="chunk.index"
          class="cursor-pointer hover:shadow-md transition-shadow"
          @click="$emit('select', chunk.index)">
          <CardContent class="p-3 flex items-center gap-2">
            <div class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: colorHex(chunk.color) }"></div>
            <div class="min-w-0">
              <div class="text-sm font-medium truncate">{{ chunk.label }}</div>
              <div class="text-xs text-muted-foreground">#{{ chunk.index }}</div>
              <div class="text-xs text-muted-foreground">{{ (chunk.volume / 1000).toFixed(1) }} cm³</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </CardContent>
  </Card>
</template>

<script setup>
import { Card, CardContent, CardHeader } from '@/components/ui/card'

defineProps({
  chunks: { type: Array, default: () => [] },
})
defineEmits(['select'])

function colorHex(color) {
  return '#' + color.toString(16).padStart(6, '0')
}
</script>
