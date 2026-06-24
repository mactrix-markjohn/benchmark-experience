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
const mode = params.get('mode')

// If no mode selected, show the menu and wait
if (!mode) {
  const menu = document.getElementById('menu-screen')
  const onboarding = document.getElementById('onboarding-screen')
  if (onboarding) onboarding.style.display = 'none'
  if (menu) menu.style.display = 'flex'
} else {
  // Hide menu, show onboarding briefly then start
  const menu = document.getElementById('menu-screen')
  if (menu) menu.style.display = 'none'

  const onxrloaded = () => {
    const gameState = new GameState()
    const uiManager = new UIManager(gameState)

    // Back button returns to menu
    const backBtn = document.getElementById('back-btn')
    if (backBtn) {
      backBtn.style.display = 'block'
      backBtn.addEventListener('click', () => {
        window.location.href = window.location.pathname
      })
    }

    // Hide onboarding for mode starts
    const onboarding = document.getElementById('onboarding-screen')
    if (onboarding) onboarding.style.display = 'none'

    if (mode === 'mask') {
      // Load face module then start
      const s = document.createElement('script')
      s.src = './external/xr/xr-face.js'
      s.onload = () => {
        try {
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
        } catch (err) {
          console.error('[Mask] Init error:', err)
          uiManager.showInstruction('Face tracking error: ' + err.message)
        }
      }
      s.onerror = () => uiManager.showInstruction('Failed to load face module')
      document.head.appendChild(s)

    } else {
      // Mascot mode
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
}
