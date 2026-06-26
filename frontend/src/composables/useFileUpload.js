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

  function handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.stl')) {
      localError.value = labels.selectStl
      return
    }
    if (file.size > 200 * 1024 * 1024) {
      localError.value = labels.fileTooLarge
      return
    }
    localError.value = ''
    emit('upload', file)
  }

  function onFileSelected(e) {
    const file = e.target?.files?.[0]
    if (file) handleFile(file)
  }

  function onDrop(e) {
    dragOver.value = false
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }

  return { fileInput, dragOver, localError, browse, handleFile, onFileSelected, onDrop }
}
