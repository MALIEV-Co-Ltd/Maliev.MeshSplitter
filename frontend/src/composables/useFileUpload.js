import { ref } from 'vue'

// Shared STL file-input handling: validation, drop, and browse. Used by both the
// desktop MeshUploader panel and the mobile CanvasUploadOverlay so the rules live
// in one place. `emit` is the host component's emit; a valid file fires
// emit('upload', file).
export function useFileUpload(emit, labels) {
  const fileInput = ref(null)
  const dragOver = ref(false)
  const localError = ref('')

  function browse() {
    fileInput.value?.click()
  }

  function handleFiles(selected) {
    const files = Array.from(selected || [])
    const primary = files.filter((file) => /\.(stl|3mf|obj)$/i.test(file.name))
    const companions = files.filter((file) => /\.mtl$/i.test(file.name))
    if (primary.length !== 1 || companions.length > 1 || (companions.length && !/\.obj$/i.test(primary[0]?.name || ''))) {
      localError.value = labels.selectStl
      return
    }
    if (files.some((file) => file.size > 200 * 1024 * 1024)) {
      localError.value = labels.fileTooLarge
      return
    }
    localError.value = ''
    emit('upload', files)
  }

  function handleFile(file) {
    handleFiles([file])
  }

  function onFileSelected(e) {
    const files = e.target?.files
    if (files?.length) handleFiles(files)
  }

  function onDrop(e) {
    dragOver.value = false
    const files = e.dataTransfer?.files
    if (files?.length) handleFiles(files)
  }

  return { fileInput, dragOver, localError, browse, handleFile, handleFiles, onFileSelected, onDrop }
}
