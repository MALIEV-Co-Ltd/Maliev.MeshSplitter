import { ref } from 'vue'
import axios from 'axios'

export function useMeshApi() {
  const meshInfo = ref(null)
  const chunks = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function uploadStl(file) {
    loading.value = true
    error.value = null
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await axios.post('/api/upload', formData)
      meshInfo.value = res.data
      return res.data
    } catch (e) {
      error.value = e.response?.data?.message || e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function splitMesh(buildVolume, gridDivisions) {
    loading.value = true
    error.value = null
    try {
      const res = await axios.post('/api/split', { buildVolume, gridDivisions })
      chunks.value = res.data.chunks || []
      return res.data
    } catch (e) {
      error.value = e.response?.data?.message || e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function addConnectors(config) {
    loading.value = true
    error.value = null
    try {
      const res = await axios.post('/api/connectors', config)
      return res.data
    } catch (e) {
      error.value = e.response?.data?.message || e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function exportStl() {
    loading.value = true
    error.value = null
    try {
      const res = await axios.post('/api/export-stl', {}, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mesh-split.stl'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      error.value = e.response?.data?.message || e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function exportPdf() {
    loading.value = true
    error.value = null
    try {
      const res = await axios.post('/api/export-pdf', {}, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mesh-split.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      error.value = e.response?.data?.message || e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  return { meshInfo, chunks, loading, error, uploadStl, splitMesh, addConnectors, exportStl, exportPdf }
}
