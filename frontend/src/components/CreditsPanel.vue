<template>
  <Card>
    <CardHeader>
      <h3 class="text-lg font-semibold">Generation Credits</h3>
      <p class="text-sm text-muted-foreground">
        {{ account.freeRemaining }} free this month · {{ account.paidCredits }} paid credits
      </p>
    </CardHeader>
    <CardContent class="space-y-3">
      <div class="rounded-md border p-3">
        <div class="text-sm font-medium">Available generations</div>
        <div class="text-3xl font-semibold">{{ account.availableGenerations }}</div>
      </div>
      <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
      <div v-if="pricing.creditPacks.length" class="space-y-2">
        <a
          v-for="pack in pricing.creditPacks"
          :key="pack.sku"
          :href="productUrl(pack)"
          class="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-accent"
        >
          <span>
            <span class="font-medium">{{ pack.name }}</span>
            <span class="block text-muted-foreground">{{ pack.credits }} credits</span>
          </span>
          <span class="font-semibold">{{ formatPrice(pack.priceCents, pack.currency) }}</span>
        </a>
      </div>
      <p v-else class="text-sm text-muted-foreground">
        Credit packs load from the backend when connected to Shopify.
      </p>
    </CardContent>
  </Card>
</template>

<script setup>
import { Card, CardContent, CardHeader } from '@/components/ui/card'

const props = defineProps({
  account: { type: Object, required: true },
  pricing: { type: Object, required: true },
  error: { type: String, default: '' },
  storeDomain: { type: String, default: '' },
})

function productUrl(pack) {
  if (!props.storeDomain) return `/products/${pack.handle}`
  return `https://${props.storeDomain}/products/${pack.handle}`
}

function formatPrice(priceCents, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(priceCents / 100)
}
</script>
