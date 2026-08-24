import * as THREE from 'three'

function wrap(value) {
  return ((value % 1) + 1) % 1
}

export function sampleTextureColor(imageData, u, v) {
  const x = Math.min(imageData.width - 1, Math.floor(wrap(u) * imageData.width))
  const y = Math.min(imageData.height - 1, Math.floor((1 - wrap(v)) * imageData.height))
  const offset = (y * imageData.width + x) * 4
  const color = new THREE.Color().setRGB(
    imageData.data[offset] / 255,
    imageData.data[offset + 1] / 255,
    imageData.data[offset + 2] / 255,
    THREE.SRGBColorSpace,
  )
  return [color.r, color.g, color.b]
}

export async function rasterizeTexture(file, maxDimension = 2048) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error(`Unable to read texture ${file.name}.`)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  return context.getImageData(0, 0, width, height)
}
