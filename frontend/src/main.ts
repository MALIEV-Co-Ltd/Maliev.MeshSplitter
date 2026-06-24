import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

// After a new version deploys, a tab still running the old build holds stale
// chunk hashes; the next lazy import (e.g. the geometry engine when splitting)
// 404s and the browser throws "Importing a module script failed". Vite fires
// `vite:preloadError` for exactly this — reload once to pick up the fresh build.
// The session guard prevents a reload loop if the import fails for a real reason.
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('meshSplitterReloadedForChunk') === '1') return
  sessionStorage.setItem('meshSplitterReloadedForChunk', '1')
  window.location.reload()
})

createApp(App).mount('#app')
