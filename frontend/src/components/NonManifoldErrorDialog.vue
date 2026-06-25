<template>
  <dialog ref="dialogEl" class="nmf-dialog" @click.self="emit('view-problem')">
    <div class="nmf-dialog__panel">
      <header class="nmf-dialog__head">
        <AlertTriangleIcon :size="20" :stroke-width="1.5" class="nmf-dialog__icon" />
        <h2>{{ labels.title || 'Cannot split mesh' }}</h2>
        <p>{{ labels.body || 'The model has holes or gaps that could not be repaired automatically. Review the highlighted areas in the 3D view.' }}</p>
      </header>

      <div class="nmf-dialog__stats">
        <div v-if="boundaryHoles > 0" class="nmf-dialog__stat">
          <span class="nmf-dialog__stat-num">{{ boundaryHoles.toLocaleString() }}</span>
          <span class="nmf-dialog__stat-label">{{ labels.holes || 'boundary holes' }}</span>
        </div>
        <div v-if="boundaryEdges > 0" class="nmf-dialog__stat">
          <span class="nmf-dialog__stat-num">{{ boundaryEdges.toLocaleString() }}</span>
          <span class="nmf-dialog__stat-label">{{ labels.edges || 'boundary edges' }}</span>
        </div>
        <div v-if="nonManifoldEdges > 0" class="nmf-dialog__stat">
          <span class="nmf-dialog__stat-num">{{ nonManifoldEdges.toLocaleString() }}</span>
          <span class="nmf-dialog__stat-label">{{ labels.nonManifold || 'non-manifold edges' }}</span>
        </div>
      </div>

      <div class="nmf-dialog__actions">
        <Button variant="outline" class="justify-center" @click="handleDismiss">>
          {{ labels.dismiss || 'Dismiss' }}
        </Button>
        <Button class="justify-center" @click="emit('view-problem')">
          {{ labels.viewProblem || 'View on model' }}
        </Button>
      </div>
    </div>
  </dialog>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { AlertTriangle as AlertTriangleIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const props = defineProps({
  boundaryHoles: { type: Number, default: 0 },
  boundaryEdges: { type: Number, default: 0 },
  nonManifoldEdges: { type: Number, default: 0 },
  labels: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['view-problem', 'dismiss'])

const dialogEl = ref(null)

onMounted(() => {
  dialogEl.value?.showModal()
})

onBeforeUnmount(() => {
  if (dialogEl.value?.open) dialogEl.value.close()
})

function handleDismiss() {
  if (dialogEl.value?.open) dialogEl.value.close()
  emit('dismiss')
}
</script>

<style scoped>
.nmf-dialog {
  background: transparent;
  border: none;
  max-width: 420px;
  padding: 0;
  width: auto;
  margin: auto;
}
.nmf-dialog::backdrop {
  background: oklch(0 0 0 / 0.48);
}
.nmf-dialog__panel {
  background: oklch(var(--card));
  border: 1px solid var(--steel-200);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 24px;
}
.nmf-dialog__head {
  text-align: center;
}
.nmf-dialog__icon {
  color: var(--signal-600);
  display: inline-block;
  margin-bottom: 8px;
}
.nmf-dialog__head h2 {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 4px;
}
.nmf-dialog__head p {
  color: var(--steel-500);
  font-size: 13px;
  margin: 0 0 20px;
}
.nmf-dialog__stats {
  display: flex;
  gap: 24px;
  justify-content: center;
  margin-bottom: 24px;
}
.nmf-dialog__stat {
  text-align: center;
}
.nmf-dialog__stat-num {
  display: block;
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
}
.nmf-dialog__stat-label {
  color: var(--steel-500);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.nmf-dialog__actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.nmf-dialog__actions .btn {
  flex: 1;
  max-width: 180px;
}
</style>
