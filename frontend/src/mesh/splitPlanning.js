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

export function calculateAutoDivisions(bounds, buildVolume) {
  return [
    axisDivisions(axisLength(bounds, 'x'), buildVolume?.[0]),
    axisDivisions(axisLength(bounds, 'y'), buildVolume?.[1]),
    axisDivisions(axisLength(bounds, 'z'), buildVolume?.[2]),
  ]
}
