<template>
  <!--
    A non-blocking floating panel (not a modal dialog). The whole point of this
    feature is the red problem-edge overlay drawn on the 3D canvas — a modal
    backdrop would cover that and defeat it. We anchor a compact card to the top
    of the preview column so the model stays visible and the canvas stays
    fully interactive (orbit/zoom) while the error is shown.
  -->
  <div class="nmf-panel" role="alertdialog" aria-labelledby="nmf-title">
    <header class="nmf-panel__head">
      <AlertTriangleIcon :size="20" :stroke-width="1.5" class="nmf-panel__icon" />
      <h2 id="nmf-title">{{ labels.title || 'Cannot split mesh' }}</h2>
      <p>{{ labels.body || 'The model has holes or gaps that could not be repaired automatically. Review the highlighted areas in the 3D view.' }}</p>
    </header>

    <div v-if="!voxelRepairRunning" class="nmf-panel__stats">
      <div v-if="boundaryHoles > 0" class="nmf-panel__stat">
        <span class="nmf-panel__stat-num">{{ boundaryHoles.toLocaleString() }}</span>
        <span class="nmf-panel__stat-label">{{ labels.holes || 'boundary holes' }}</span>
      </div>
      <div v-if="boundaryEdges > 0" class="nmf-panel__stat">
        <span class="nmf-panel__stat-num">{{ boundaryEdges.toLocaleString() }}</span>
        <span class="nmf-panel__stat-label">{{ labels.edges || 'boundary edges' }}</span>
      </div>
      <div v-if="nonManifoldEdges > 0" class="nmf-panel__stat">
        <span class="nmf-panel__stat-num">{{ nonManifoldEdges.toLocaleString() }}</span>
        <span class="nmf-panel__stat-label">{{ labels.nonManifold || 'non-manifold edges' }}</span>
      </div>
    </div>

    <!-- While the opt-in voxel repair runs, the stats above give way to a live
         progress bar — it's the only thing meaningful to show during a
         potentially multi-minute, off-main-thread repair. -->
    <div v-if="voxelRepairRunning" class="nmf-panel__progress">
      <div class="nmf-panel__progress-label">
        {{ labels.advancedRepairRunning || 'Running advanced repair…' }}
        <span class="nmf-panel__progress-pct">{{ Math.round(voxelRepairProgress * 100) }}%</span>
      </div>
      <div class="nmf-panel__progress-track" role="progressbar" :aria-valuenow="Math.round(voxelRepairProgress * 100)" aria-valuemin="0" aria-valuemax="100">
        <div class="nmf-panel__progress-fill" :style="{ width: `${Math.max(2, voxelRepairProgress * 100)}%` }" />
      </div>
    </div>
    <p v-else-if="canAttemptVoxelRepair" class="nmf-panel__voxel-hint">
      {{ labels.advancedRepairBody || 'This can take a few minutes on a badly broken mesh. You can cancel at any time.' }}
    </p>

    <div class="nmf-panel__actions">
      <template v-if="voxelRepairRunning">
        <Button variant="outline" class="justify-center" @click="emit('cancel-voxel-repair')">
          {{ labels.cancelRepair || 'Cancel' }}
        </Button>
      </template>
      <template v-else>
        <!-- When basic repair has failed outright (canDismiss false), the mesh
             genuinely cannot be split — dismissing would just strand the user
             on a permanently disabled Split button with no clear next step.
             They must continue with the opt-in advanced repair, or use
             "Replace file" elsewhere in the panel to start over. -->
        <Button v-if="canDismiss" variant="outline" class="justify-center" @click="emit('dismiss')">
          {{ labels.dismiss || 'Dismiss' }}
        </Button>
        <Button class="justify-center" @click="emit('view-problem')">
          {{ labels.viewProblem || 'View on model' }}
        </Button>
      </template>
    </div>
    <div v-if="!voxelRepairRunning && canAttemptVoxelRepair" class="nmf-panel__actions nmf-panel__actions--secondary">
      <Button variant="outline" class="justify-center" @click="emit('attempt-voxel-repair')">
        {{ labels.tryAdvancedRepair || 'Try advanced repair (slower)' }}
      </Button>
    </div>
  </div>
</template>

<script setup>
import { AlertTriangle as AlertTriangleIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

defineProps({
  boundaryHoles: { type: Number, default: 0 },
  boundaryEdges: { type: Number, default: 0 },
  nonManifoldEdges: { type: Number, default: 0 },
  canAttemptVoxelRepair: { type: Boolean, default: false },
  voxelRepairRunning: { type: Boolean, default: false },
  voxelRepairProgress: { type: Number, default: 0 },
  canDismiss: { type: Boolean, default: true },
  labels: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['view-problem', 'dismiss', 'attempt-voxel-repair', 'cancel-voxel-repair'])
</script>

<style scoped>
/*
  Floating, non-blocking card pinned to the top-center of the preview column.
  It only occupies its own box, so the canvas around/behind it stays
  interactive and the red problem-edge overlay remains visible.
*/
.nmf-panel {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  width: min(360px, calc(100% - 32px));
  background: oklch(var(--card));
  border: 1px solid var(--steel-200);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 18px 20px;
}
.nmf-panel__head {
  text-align: center;
}
.nmf-panel__icon {
  color: var(--signal-600);
  display: inline-block;
  margin-bottom: 6px;
}
.nmf-panel__head h2 {
  font-size: 15px;
  font-weight: 700;
  margin: 0 0 4px;
}
.nmf-panel__head p {
  color: var(--steel-500);
  font-size: 12.5px;
  line-height: 1.4;
  margin: 0 0 16px;
}
.nmf-panel__stats {
  display: flex;
  gap: 24px;
  justify-content: center;
  margin-bottom: 18px;
}
.nmf-panel__stat {
  text-align: center;
}
.nmf-panel__stat-num {
  display: block;
  font-size: 26px;
  font-weight: 700;
  line-height: 1;
}
.nmf-panel__stat-label {
  color: var(--steel-500);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.nmf-panel__actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.nmf-panel__actions :deep(.btn),
.nmf-panel__actions :deep(button) {
  flex: 1;
  max-width: 180px;
}
.nmf-panel__actions--secondary {
  margin-top: 10px;
}
.nmf-panel__actions--secondary :deep(button) {
  max-width: none;
}
.nmf-panel__voxel-hint {
  color: var(--steel-500);
  font-size: 12px;
  line-height: 1.4;
  margin: -4px 0 14px;
  text-align: center;
}
.nmf-panel__progress {
  margin-bottom: 16px;
}
.nmf-panel__progress-label {
  color: var(--steel-600);
  display: flex;
  font-size: 12.5px;
  font-weight: 600;
  justify-content: space-between;
  margin-bottom: 8px;
}
.nmf-panel__progress-pct {
  color: var(--steel-500);
  font-family: var(--font-mono);
}
.nmf-panel__progress-track {
  background: var(--steel-100);
  border-radius: 999px;
  height: 8px;
  overflow: hidden;
  width: 100%;
}
.nmf-panel__progress-fill {
  background: var(--signal-600);
  border-radius: 999px;
  height: 100%;
  transition: width 0.2s ease-out;
}
</style>
