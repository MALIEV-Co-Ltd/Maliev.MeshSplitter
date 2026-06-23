// Deterministic billing identity for an export package.
//
// The credit ledger charges exactly once per unique idempotency key and returns
// the original transaction on any repeat (see backend creditLedger.consumeExport).
// So this key must be IDENTICAL for the same (mesh, scale, build volume,
// connectors) and DIFFER when any of them change — with no timestamps or random
// nonces. Result: a customer can re-download the same configuration any number
// of times for one credit, but changing the build volume or connectors (a
// genuinely different printable output) charges again.

function round(value) {
  return Number(value ?? 0).toFixed(3)
}

// A content fingerprint for the source mesh. filename alone is not enough (two
// different parts can share a name), so geometry counts, volume, and bounds are
// folded in to make collisions between distinct meshes vanishingly unlikely.
export function meshSignature(meshInfo) {
  if (!meshInfo) return 'no-mesh'
  const bounds = meshInfo.bounds || {}
  const min = bounds.min || {}
  const max = bounds.max || {}
  return [
    meshInfo.filename || 'mesh',
    meshInfo.faces ?? 0,
    meshInfo.verts ?? 0,
    round(meshInfo.volume),
    [round(min.x), round(min.y), round(min.z)].join(','),
    [round(max.x), round(max.y), round(max.z)].join(','),
  ].join('|')
}

export function connectorSignature(config) {
  if (!config || !config.type || config.type === 'None') return 'none'
  const part = (value) => (value === undefined || value === null || value === '' ? '' : String(value))
  return [
    config.type,
    part(config.depth),
    part(config.clearance),
    part(config.perFace),
    part(config.diameter),
    part(config.tenonWidth),
    part(config.tenonThickness),
    part(config.keyWidth),
    part(config.keyHeight),
  ].join(',')
}

export function exportIdempotencyKey({
  format = 'package',
  meshInfo,
  scaleFactor = 1,
  buildVolume = [],
  connectorConfig,
} = {}) {
  return [
    format,
    meshSignature(meshInfo),
    `s${Number(scaleFactor) || 1}`,
    `bv${(buildVolume || []).map((value) => Number(value) || 0).join('x')}`,
    `c${connectorSignature(connectorConfig)}`,
  ].join('::')
}
