import { ref } from 'vue'

// Shared STL file-input handling: validation, drop, and browse. Used by both the
// desktop MeshUploader panel and the mobile CanvasUploadOverlay so the rules live
// in one place. `emit` is the host component's emit; a valid file fires
// emit('upload', file).
export function useFileUpload(emit, labels) {
  const fileInput = ref(null)
  const companionInput = ref(null)
  const dragOver = ref(false)
  const localError = ref('')
  const pendingObj = ref(null)
  const awaitingObjCompanions = ref(false)

  function browse() {
    fileInput.value?.click()
  }

  function browseCompanions() {
    companionInput.value?.click()
  }

  function clearPendingObj() {
    pendingObj.value = null
    awaitingObjCompanions.value = false
  }

  function handleFiles(selected) {
    const files = Array.from(selected || [])
    const primary = files.filter((file) => /\.(stl|3mf|obj)$/i.test(file.name))
    const companions = files.filter((file) => /\.mtl$/i.test(file.name))
    const textures = files.filter((file) => /\.(png|jpe?g|webp|bmp)$/i.test(file.name))
    const recognized = primary.length + companions.length + textures.length
    if (primary.length !== 1 || recognized !== files.length || companions.length > 1 || ((companions.length || textures.length) && !/\.obj$/i.test(primary[0]?.name || '')) || (textures.length && companions.length !== 1)) {
      localError.value = labels.selectStl
      return
    }
    if (files.some((file) => file.size > 200 * 1024 * 1024)) {
      localError.value = labels.fileTooLarge
      return
    }
    localError.value = ''
    if (files.length === 1 && /\.obj$/i.test(primary[0].name)) {
      pendingObj.value = primary[0]
      awaitingObjCompanions.value = true
      return
    }
    clearPendingObj()
    emit('upload', files)
  }

  function handleFile(file) {
    handleFiles([file])
  }

  function handleCompanionFiles(selected) {
    if (!pendingObj.value) return
    const files = Array.from(selected || [])
    const companions = files.filter((file) => /\.mtl$/i.test(file.name))
    const textures = files.filter((file) => /\.(png|jpe?g|webp|bmp)$/i.test(file.name))
    if (companions.length !== 1 || companions.length + textures.length !== files.length) {
      localError.value = labels.selectObjCompanions || labels.selectStl
      return
    }
    if (files.some((file) => file.size > 200 * 1024 * 1024)) {
      localError.value = labels.fileTooLarge
      return
    }
    const obj = pendingObj.value
    clearPendingObj()
    localError.value = ''
    emit('upload', [obj, ...files])
  }

  function continueWithoutMaterials() {
    if (!pendingObj.value) return
    const obj = pendingObj.value
    clearPendingObj()
    localError.value = ''
    emit('upload', [obj])
  }

  function onFileSelected(e) {
    const files = e.target?.files
    if (files?.length) handleFiles(files)
  }

  function onCompanionSelected(e) {
    const files = e.target?.files
    if (files?.length) handleCompanionFiles(files)
  }

  function onDrop(e) {
    dragOver.value = false
    const files = e.dataTransfer?.files
    if (files?.length) handleFiles(files)
  }

  return {
    fileInput,
    companionInput,
    dragOver,
    localError,
    pendingObj,
    awaitingObjCompanions,
    browse,
    browseCompanions,
    handleFile,
    handleFiles,
    handleCompanionFiles,
    continueWithoutMaterials,
    onFileSelected,
    onCompanionSelected,
    onDrop,
  }
}
