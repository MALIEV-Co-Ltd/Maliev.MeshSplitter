// Clearance reserved on the bed footprint (X/Y) so each printed part keeps room
// for support material, brims, and skirts. A part sized to the raw build volume
// has no room for these and won't actually print, so the usable area on each
// horizontal axis shrinks by this margin on BOTH sides (left/right, front/back).
// Z (height) keeps the full build volume - supports grow outward on the bed, not
// upward past the model.
export const SUPPORT_MARGIN_MM = 15

function axisLength(bounds, axis) {
  const min = Number(bounds?.min?.[axis] ?? 0)
  const max = Number(bounds?.max?.[axis] ?? 0)
  return Math.max(0, max - min)
}

function axisDivisions(length, buildVolume) {
  const volume = Number(buildVolume)
  if (!Number.isFinite(volume) || volume <= 0) return 1
  return Math.max(1, Math.ceil(length / volume))
}

function shrinkAxis(value, margin) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return num
  return Math.max(1, num - margin * 2)
}

/**
 * Usable build volume after reserving the support-material margin. The margin is
 * applied to X and Y (the bed footprint) on both sides; Z is left untouched.
 */
export function effectiveBuildVolume(buildVolume, margin = SUPPORT_MARGIN_MM) {
  const safeMargin = Math.max(0, Number(margin) || 0)
  return [
    shrinkAxis(buildVolume?.[0], safeMargin),
    shrinkAxis(buildVolume?.[1], safeMargin),
    Number(buildVolume?.[2]),
  ]
}

/**
 * Build-volume vs support safe-zone footprint, for the preview overlay. `outer`
 * is the printer build volume, `inner` is the printable safe zone, and `margin`
 * is the grey support clearance band between them on X/Y.
 */
export function calculateSafeZone(buildVolume, margin = SUPPORT_MARGIN_MM) {
  const safeMargin = Math.max(0, Number(margin) || 0)
  const inner = effectiveBuildVolume(buildVolume, safeMargin)
  return {
    margin: safeMargin,
    outer: [Number(buildVolume?.[0]), Number(buildVolume?.[1]), Number(buildVolume?.[2])],
    inner,
  }
}

export function calculateAutoDivisions(bounds, buildVolume, margin = SUPPORT_MARGIN_MM) {
  const effective = effectiveBuildVolume(buildVolume, margin)
  return [
    axisDivisions(axisLength(bounds, 'x'), effective[0]),
    axisDivisions(axisLength(bounds, 'y'), effective[1]),
    axisDivisions(axisLength(bounds, 'z'), effective[2]),
  ]
}
