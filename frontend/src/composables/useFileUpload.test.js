import { describe, it, expect } from 'vitest'
import { useFileUpload } from './useFileUpload'

function makeFile(name, size = 10) {
  return new File([new Uint8Array(size)], name, { type: 'model/stl' })
}

const labels = { selectStl: 'pick model', fileTooLarge: 'too big' }

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
    expect(u.localError.value).toBe('pick model')
  })

  it('rejects files over 200MB', () => {
    const u = useFileUpload(() => {}, labels)
    u.handleFile({ name: 'a.stl', size: 201 * 1024 * 1024 })
    expect(u.localError.value).toBe('too big')
  })

  it('emits an OBJ and its MTL companion together', () => {
    const emitted = []
    const u = useFileUpload((evt, files) => emitted.push([evt, files]), labels)
    u.handleFiles([makeFile('figure.obj'), makeFile('figure.mtl')])

    expect(emitted[0][0]).toBe('upload')
    expect(emitted[0][1].map((file) => file.name)).toEqual(['figure.obj', 'figure.mtl'])
  })

  it('emits OBJ, MTL, and texture image companions together', () => {
    const emitted = []
    const u = useFileUpload((evt, files) => emitted.push([evt, files]), labels)
    u.handleFiles([
      makeFile('figure.obj'),
      makeFile('figure.mtl'),
      makeFile('albedo.png'),
      makeFile('detail.jpg'),
    ])

    expect(emitted[0][0]).toBe('upload')
    expect(emitted[0][1].map((file) => file.name)).toEqual([
      'figure.obj',
      'figure.mtl',
      'albedo.png',
      'detail.jpg',
    ])
  })

  it('rejects an orphan MTL companion', () => {
    const u = useFileUpload(() => {}, labels)
    u.handleFiles([makeFile('figure.mtl')])
    expect(u.localError.value).toBe('pick model')
  })

  it('waits for an optional MTL choice after selecting an OBJ by itself', () => {
    const emitted = []
    const u = useFileUpload((evt, files) => emitted.push([evt, files]), labels)

    u.handleFiles([makeFile('figure.obj')])

    expect(emitted).toHaveLength(0)
    expect(u.pendingObj.value?.name).toBe('figure.obj')
    expect(u.awaitingObjCompanions.value).toBe(true)
  })

  it('imports the staged OBJ with subsequently selected MTL and textures', () => {
    const emitted = []
    const u = useFileUpload((evt, files) => emitted.push([evt, files]), labels)

    u.handleFiles([makeFile('figure.obj')])
    u.handleCompanionFiles([
      makeFile('figure.mtl'),
      makeFile('albedo.png'),
    ])

    expect(emitted).toHaveLength(1)
    expect(emitted[0][1].map((file) => file.name)).toEqual([
      'figure.obj',
      'figure.mtl',
      'albedo.png',
    ])
    expect(u.awaitingObjCompanions.value).toBe(false)
  })

  it('imports the staged OBJ without materials when the user continues', () => {
    const emitted = []
    const u = useFileUpload((evt, files) => emitted.push([evt, files]), labels)

    u.handleFiles([makeFile('figure.obj')])
    u.continueWithoutMaterials()

    expect(emitted).toHaveLength(1)
    expect(emitted[0][1].map((file) => file.name)).toEqual(['figure.obj'])
    expect(u.awaitingObjCompanions.value).toBe(false)
  })

})
