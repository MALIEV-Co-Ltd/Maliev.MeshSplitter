import { describe, it, expect } from 'vitest'
import { useFileUpload } from './useFileUpload'

function makeFile(name, size = 10) {
  return new File([new Uint8Array(size)], name, { type: 'model/stl' })
}

const labels = { selectStl: 'pick stl', fileTooLarge: 'too big' }

describe('useFileUpload', () => {
  it('emits upload for a valid .stl file', () => {
    const emitted = []
    const u = useFileUpload((evt, file) => emitted.push([evt, file]), labels)
    u.handleFile(makeFile('a.stl'))
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toBe('upload')
    expect(u.localError.value).toBe('')
  })

  it('rejects non-stl and sets localError', () => {
    const emitted = []
    const u = useFileUpload((evt, file) => emitted.push([evt, file]), labels)
    u.handleFile(makeFile('a.png'))
    expect(emitted).toHaveLength(0)
    expect(u.localError.value).toBe('pick stl')
  })

  it('rejects files over 200MB', () => {
    const u = useFileUpload(() => {}, labels)
    u.handleFile({ name: 'a.stl', size: 201 * 1024 * 1024 })
    expect(u.localError.value).toBe('too big')
  })
})
