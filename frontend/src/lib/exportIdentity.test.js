import { describe, it, expect } from 'vitest'
import { exportIdempotencyKey } from './exportIdentity'

const meshInfo = {
  filename: 'part.stl',
  faces: 1200,
  verts: 620,
  volume: 123456.789,
  bounds: { min: { x: -10, y: -10, z: 0 }, max: { x: 10, y: 10, z: 40 } },
}

const base = {
  meshInfo,
  scaleFactor: 1,
  buildVolume: [250, 250, 250],
  connectorConfig: { type: 'Mortise & Tenon', depth: 5, clearance: 0.3, perFace: 1, tenonWidth: 6, tenonThickness: 4 },
}

describe('exportIdempotencyKey', () => {
  it('is stable for identical mesh + settings (one credit across repeat downloads)', () => {
    expect(exportIdempotencyKey(base)).toBe(exportIdempotencyKey({ ...base }))
  })

  it('changes when the build volume changes (re-charge a different output)', () => {
    expect(exportIdempotencyKey(base)).not.toBe(
      exportIdempotencyKey({ ...base, buildVolume: [200, 250, 250] }),
    )
  })

  it('changes when the connector configuration changes', () => {
    expect(exportIdempotencyKey(base)).not.toBe(
      exportIdempotencyKey({ ...base, connectorConfig: { ...base.connectorConfig, tenonWidth: 8 } }),
    )
    expect(exportIdempotencyKey(base)).not.toBe(
      exportIdempotencyKey({ ...base, connectorConfig: { type: 'Dowel', depth: 5, clearance: 0.3, perFace: 1, diameter: 6 } }),
    )
    expect(exportIdempotencyKey(base)).not.toBe(
      exportIdempotencyKey({ ...base, connectorConfig: { type: 'None' } }),
    )
  })

  it('changes when the scale changes (scaled output differs)', () => {
    expect(exportIdempotencyKey(base)).not.toBe(exportIdempotencyKey({ ...base, scaleFactor: 2 }))
  })

  it('changes for a different mesh even with the same filename', () => {
    const other = { ...meshInfo, faces: 1300, verts: 700 }
    expect(exportIdempotencyKey(base)).not.toBe(exportIdempotencyKey({ ...base, meshInfo: other }))
  })

  it('treats every "None" connector the same regardless of leftover params', () => {
    expect(exportIdempotencyKey({ ...base, connectorConfig: { type: 'None' } })).toBe(
      exportIdempotencyKey({ ...base, connectorConfig: { type: 'None', depth: 9, diameter: 3 } }),
    )
  })
})
