import { ref } from 'vue'

export function useMeshApi() {
  const meshInfo = ref(null)
  const chunks = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function uploadStl(file) {
    loading.value = true
    error.value = null
    try {
      meshInfo.value = { name: file.name, size: file.size }
      return meshInfo.value
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function splitMesh(buildVolume, gridDivisions) {
    loading.value = true
    error.value = null
    try {
      return { chunks: [] }
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function addConnectors(config) {
    loading.value = true
    error.value = null
    try {
      return {}
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function exportStl() {
    loading.value = true
    error.value = null
    try {
      console.warn('exportStl: not implemented')
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function exportPdf() {
    loading.value = true
    error.value = null
    try {
      console.warn('exportPdf: not implemented')
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  return { meshInfo, chunks, loading, error, uploadStl, splitMesh, addConnectors, exportStl, exportPdf }
}
