import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {GameState} from './game-state.js'
import {UIManager} from './ui-manager.js'
import {initScenePipelineModule} from './threejs-scene-init.js'
import {initFaceMaskModule} from './face-mask-scene.js'

window.THREE = THREE
window.THREE.GLTFLoader = GLTFLoader

import targetAtomic from '../image-targets/image-target-atomic.json'
import targetBackPower from '../image-targets/image-target-back-power.json'

let currentMode = null // 'mascot' or 'mask'
let faceModuleLoaded = false

const loadFaceModule = () => {
  return new Promise((resolve, reject) => {
    if (faceModuleLoaded) { resolve(); return }
    const s = document.createElement('script')
    s.src = './external/xr/xr-face.js'
    s.onload = () => { faceModuleLoaded = true; resolve() }
    s.onerror = reject
    document.head.appendChild(s)
  })
}

const startMascotMode = (gameState, uiManager) => {
  if (currentMode === 'mascot') return
  if (currentMode) XR8.stop()
  currentMode = 'mascot'

  XR8.XrController.configure({
    imageTargetData: [targetAtomic, targetBackPower]
  })

  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    LandingPage.pipelineModule(),
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
    initScenePipelineModule(gameState, uiManager),
  ])

  XR8.run({canvas: document.getElementById('camerafeed')})
  uiManager.showInstruction('Scan the Mascot Decal to begin')
}

const startMaskMode = async (uiManager) => {
  if (currentMode === 'mask') return
  if (currentMode) XR8.stop()
  currentMode = 'mask'

  await loadFaceModule()

  XR8.FaceController.configure({meshGeometry: []})

  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.FaceController.pipelineModule(),
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
    initFaceMaskModule(uiManager),
  ])

  XR8.run({canvas: document.getElementById('camerafeed')})
  uiManager.showInstruction('Point the camera at your face!')
  uiManager.showShutterButton()
}

const onxrloaded = () => {
  const gameState = new GameState()
  const uiManager = new UIManager(gameState)

  // Mode toggle button
  const toggleBtn = document.getElementById('mode-toggle')
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (currentMode === 'mascot') {
        toggleBtn.innerText = 'Find Mascot'
        startMaskMode(uiManager)
      } else {
        toggleBtn.innerText = 'Try Mask'
        startMascotMode(gameState, uiManager)
      }
    })
  }

  // Start in mascot mode by default
  startMascotMode(gameState, uiManager)
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
