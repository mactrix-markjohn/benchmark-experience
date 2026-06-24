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

const params = new URLSearchParams(window.location.search)
const mode = params.get('mode') || 'mascot'

const onxrloaded = () => {
  const gameState = new GameState()
  const uiManager = new UIManager(gameState)

  const toggleBtn = document.getElementById('mode-toggle')

  if (mode === 'mask') {
    // --- Face Mask Mode ---
    if (toggleBtn) {
      toggleBtn.innerText = 'Find Mascot'
      toggleBtn.addEventListener('click', () => {
        window.location.href = window.location.pathname
      })
    }

    // Load face module then start
    const s = document.createElement('script')
    s.src = './external/xr/xr-face.js'
    s.onload = () => {
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
    document.head.appendChild(s)

  } else {
    // --- Mascot Mode (default) ---
    if (toggleBtn) {
      toggleBtn.innerText = 'Try Mask'
      toggleBtn.addEventListener('click', () => {
        window.location.href = window.location.pathname + '?mode=mask'
      })
    }

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
  }
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
