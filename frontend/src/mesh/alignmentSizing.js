export const PLA_DENSITY_G_PER_CM3 = 1.24

export function estimatePlaMassGrams(volumeMm3, density = PLA_DENSITY_G_PER_CM3) {
  const volume = Number(volumeMm3)
  if (!Number.isFinite(volume) || volume < 0) throw new Error('Part volume must be a non-negative number.')
  return volume / 1000 * density
}

function initialBand(massGrams) {
  if (massGrams <= 25) return { widthMm: 5, thicknessMm: 3, depthMm: 3 }
  if (massGrams <= 150) return { widthMm: 7, thicknessMm: 4, depthMm: 4 }
  return { widthMm: 9, thicknessMm: 5, depthMm: 5 }
}

function roundTenth(value) {
  return Math.round(value * 10) / 10
}

export function sizeAlignmentPlug({
  partVolumesMm3 = [],
  faceAreaMm2,
  localThicknessMm,
  clearance = 0.3,
  requestedCount = 1,
} = {}) {
  const volumes = Array.from(partVolumesMm3, Number).filter(Number.isFinite)
  const massGrams = estimatePlaMassGrams(Math.max(0, ...volumes))
  const area = Number(faceAreaMm2)
  const wall = Number(localThicknessMm)
  const gap = Math.max(0, Number(clearance) || 0)
  const faceSpan = Math.sqrt(Math.max(0, area))
  const band = initialBand(massGrams)
  const widthMm = roundTenth(Math.min(band.widthMm, faceSpan * 0.6, wall * 1.5))
  const thicknessMm = roundTenth(Math.min(band.thicknessMm, widthMm * 0.65, wall * 0.7))
  const depthMm = roundTenth(Math.min(band.depthMm, wall * 0.4))
  const viable = Number.isFinite(area) && Number.isFinite(wall) && widthMm >= 3 && thicknessMm >= 1.5 && depthMm >= 1.2
  const pitch = widthMm + gap * 2
  const fittedCount = viable ? Math.max(1, Math.floor(faceSpan * 0.7 / pitch)) : 0

  return {
    viable,
    reason: viable ? (widthMm < band.widthMm || depthMm < band.depthMm ? 'geometry-clamped' : 'pla-mass-band') : 'no-safe-fit',
    purpose: 'alignment-only',
    loadBearing: false,
    densityGPerCm3: PLA_DENSITY_G_PER_CM3,
    estimatedMassGrams: roundTenth(massGrams),
    widthMm,
    thicknessMm,
    depthMm,
    clearanceMm: gap,
    count: viable ? Math.min(Math.max(1, Math.floor(Number(requestedCount) || 1)), fittedCount) : 0,
    taperRatio: 0.88,
  }
}
