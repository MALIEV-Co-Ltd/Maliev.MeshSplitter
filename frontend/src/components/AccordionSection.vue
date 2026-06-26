<template>
  <div class="acc-section" :class="{ 'acc-open': open }">
    <button type="button" class="acc-head" :aria-expanded="open" @click="$emit('toggle')">
      <span class="acc-title">
        <component :is="icon" v-if="icon" :size="15" :stroke-width="1.75" />
        {{ title }}
      </span>
      <ChevronDownIcon :size="16" :stroke-width="1.75" class="acc-chevron" :class="{ 'rotate-180': open }" />
    </button>
    <div v-show="open" class="acc-body">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ChevronDown as ChevronDownIcon } from '@lucide/vue'

defineProps({
  title: { type: String, required: true },
  open: { type: Boolean, default: false },
  // A lucide icon component (or any render function) shown before the title.
  icon: { type: [Object, Function], default: null },
})
defineEmits(['toggle'])
</script>
