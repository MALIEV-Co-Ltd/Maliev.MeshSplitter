<template>
  <dialog ref="dialogEl" class="repair-dialog" @click.self="onCancel">
    <div class="repair-dialog__panel">
      <header class="repair-dialog__head">
        <h2>{{ labels.title }}</h2>
        <p>{{ labels.body }}</p>
      </header>

      <div class="repair-dialog__previews">
        <div class="repair-dialog__preview">
          <div class="repair-dialog__preview-label">{{ labels.before }}</div>
          <img v-if="preview.beforeUrl" :src="preview.beforeUrl" alt="Before repair" />
          <div v-else class="repair-dialog__preview-empty" />
          <div class="repair-dialog__stats">
            {{ preview.beforeStats.faces.toLocaleString() }} {{ labels.faces }} &middot;
            {{ preview.beforeStats.verts.toLocaleString() }} {{ labels.verts }}
          </div>
        </div>
        <div class="repair-dialog__arrow">→</div>
        <div class="repair-dialog__preview">
          <div class="repair-dialog__preview-label repair-dialog__preview-label--after">{{ labels.after }}</div>
          <img v-if="preview.afterUrl" :src="preview.afterUrl" alt="After repair" />
          <div v-else class="repair-dialog__preview-empty" />
          <div class="repair-dialog__stats">
            {{ preview.afterStats.faces.toLocaleString() }} {{ labels.faces }} &middot;
            {{ preview.afterStats.verts.toLocaleString() }} {{ labels.verts }}
          </div>
        </div>
      </div>

      <div class="repair-dialog__actions">
        <Button variant="outline" class="justify-center" @click="onCancel">
          {{ labels.keepOriginal }}
        </Button>
        <Button class="justify-center" @click="onConfirm">
          {{ labels.useRepaired }}
        </Button>
      </div>
    </div>
  </dialog>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Button } from '@/components/ui/button'

const props = defineProps({
  preview: { type: Object, required: true },
  labels: {
    type: Object,
    default: () => ({
      title: 'Mesh repair required',
      body: 'The mesh is not watertight and has been automatically repaired. Review the result below.',
      before: 'Before repair',
      after: 'After repair',
      faces: 'faces',
      verts: 'verts',
      keepOriginal: 'Keep original',
      useRepaired: 'Use repaired mesh',
    }),
  },
})

const emit = defineEmits(['confirm', 'cancel'])

const dialogEl = ref(null)

onMounted(() => {
  dialogEl.value?.showModal()
})

function onConfirm() {
  emit('confirm')
}

function onCancel() {
  emit('cancel')
}
</script>

<style scoped>
.repair-dialog {
  background: transparent;
  border: none;
  max-width: 720px;
  padding: 0;
  width: 90vw;
}
.repair-dialog::backdrop {
  background: oklch(0 0 0 / 0.48);
}
.repair-dialog__panel {
  background: oklch(var(--card));
  border: 1px solid var(--steel-200);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 24px;
}
.repair-dialog__head h2 {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 4px;
}
.repair-dialog__head p {
  color: var(--steel-500);
  font-size: 13px;
  margin: 0 0 20px;
}
.repair-dialog__previews {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-bottom: 20px;
}
.repair-dialog__preview {
  flex: 1;
  max-width: 300px;
  text-align: center;
}
.repair-dialog__preview img {
  border: 1px solid var(--steel-200);
  border-radius: var(--radius-sm);
  display: block;
  height: auto;
  margin: 0 auto;
  max-width: 100%;
}
.repair-dialog__preview-empty {
  background: var(--steel-100);
  border: 1px solid var(--steel-200);
  border-radius: var(--radius-sm);
  height: 168px;
}
.repair-dialog__preview-label {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
  text-transform: uppercase;
}
.repair-dialog__preview-label--after {
  color: var(--signal-600);
}
.repair-dialog__stats {
  color: var(--steel-500);
  font-size: 11px;
  margin-top: 6px;
}
.repair-dialog__arrow {
  color: var(--steel-400);
  font-size: 24px;
  flex-shrink: 0;
}
.repair-dialog__actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.repair-dialog__actions .btn {
  flex: 1;
  max-width: 200px;
}
</style>
