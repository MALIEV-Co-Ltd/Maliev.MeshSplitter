<template>
  <dialog ref="dialogEl" class="repair-dialog">
    <div class="repair-dialog__panel">
      <header class="repair-dialog__head">
        <h2>{{ labels.title }}</h2>
        <p>{{ labels.body }}</p>
      </header>

      <div class="repair-dialog__previews">
        <div class="repair-dialog__preview">
          <div class="repair-dialog__preview-label">{{ labels.before }}</div>
          <div class="repair-dialog__canvas">
            <RepairPreviewCanvas v-if="preview.beforeGeometry" :geometry="preview.beforeGeometry" :color="0xc0c0c0" />
            <img v-else-if="preview.beforeUrl" :src="preview.beforeUrl" alt="Before repair" />
            <div v-else class="repair-dialog__preview-empty" />
          </div>
          <div class="repair-dialog__stats">
            {{ preview.beforeStats.faces.toLocaleString() }} {{ labels.faces }} &middot;
            {{ preview.beforeStats.verts.toLocaleString() }} {{ labels.verts }}
          </div>
        </div>
        <div class="repair-dialog__arrow">→</div>
        <div class="repair-dialog__preview">
          <div class="repair-dialog__preview-label repair-dialog__preview-label--after">{{ labels.after }}</div>
          <div class="repair-dialog__canvas">
            <RepairPreviewCanvas v-if="preview.afterGeometry" :geometry="preview.afterGeometry" :color="0x3b82f6" />
            <img v-else-if="preview.afterUrl" :src="preview.afterUrl" alt="After repair" />
            <div v-else class="repair-dialog__preview-empty" />
          </div>
          <div class="repair-dialog__stats">
            {{ preview.afterStats.faces.toLocaleString() }} {{ labels.faces }} &middot;
            {{ preview.afterStats.verts.toLocaleString() }} {{ labels.verts }}
          </div>
        </div>
      </div>
      <p v-if="preview.beforeGeometry" class="repair-dialog__hint">Drag to rotate each view</p>

      <div class="repair-dialog__actions">
        <Button class="repair-dialog__btn" @click="onConfirm">
          {{ labels.acknowledge }}
        </Button>
      </div>
    </div>
  </dialog>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Button } from '@/components/ui/button'
import RepairPreviewCanvas from './RepairPreviewCanvas.vue'

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
      acknowledge: 'Acknowledge',
    }),
  },
})

const emit = defineEmits(['confirm'])

const dialogEl = ref(null)

onMounted(() => {
  dialogEl.value?.showModal()
})

function onConfirm() {
  emit('confirm')
}
</script>

<style scoped>
.repair-dialog {
  background: transparent;
  border: none;
  max-height: 90vh;
  max-width: 1100px;
  padding: 0;
  width: 92vw;
}
.repair-dialog::backdrop {
  background: oklch(0 0 0 / 0.48);
}
.repair-dialog__panel {
  background: oklch(var(--card));
  border: 1px solid var(--steel-200);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  max-height: 90vh;
  overflow-y: auto;
  padding: 28px;
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
  gap: 24px;
  justify-content: center;
  margin-bottom: 20px;
}
.repair-dialog__preview {
  flex: 1;
  max-width: 460px;
  text-align: center;
}
.repair-dialog__canvas {
  border: 1px solid var(--steel-200);
  border-radius: var(--radius-sm);
  height: 420px;
  overflow: hidden;
}
.repair-dialog__preview img {
  display: block;
  height: auto;
  margin: 0 auto;
  max-width: 100%;
}
.repair-dialog__preview-empty {
  background: var(--steel-100);
  height: 100%;
}
.repair-dialog__hint {
  color: var(--steel-400);
  font-size: 11px;
  margin: -12px 0 16px;
  text-align: center;
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
  justify-content: flex-end;
}
.repair-dialog__btn {
  width: auto;
}

@media (max-width: 700px) {
  .repair-dialog {
    max-height: 95vh;
    width: 96vw;
  }
  .repair-dialog__panel {
    max-height: 95vh;
    padding: 18px;
  }
  .repair-dialog__previews {
    flex-direction: column;
    gap: 18px;
  }
  .repair-dialog__preview {
    max-width: none;
    width: 100%;
  }
  .repair-dialog__canvas {
    height: 240px;
  }
  .repair-dialog__arrow {
    transform: rotate(90deg);
  }
  .repair-dialog__actions {
    justify-content: stretch;
  }
  .repair-dialog__btn {
    width: 100%;
  }
}
</style>
