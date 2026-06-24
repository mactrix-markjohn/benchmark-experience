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

const onxrloaded = () => {
  const gameState = new GameState()
  const uiManager = new UIManager(gameState)

  let isFaceMode = false
  let pendingRun = null

  window.addEventListener('stopxr', () => {
    if (pendingRun) {
      const runFn = pendingRun
      pendingRun = null
      setTimeout(runFn, 800)
    }
  })

  // Configure both controllers upfront
  XR8.XrController.configure({
    imageTargetData: [targetAtomic, targetBackPower]
  })

  XR8.FaceController.configure({
    meshGeometry: [XR8.FaceController.MeshGeometry.FACE],
    maxDetections: 1,
  })

  // Store pipeline module references for swapping
  const xrController = XR8.XrController.pipelineModule()
  const faceController = XR8.FaceController.pipelineModule()
  const mascotModule = initScenePipelineModule(gameState, uiManager)
  const maskModule = initFaceMaskModule(uiManager)

  // Start with all shared modules + mascot mode
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    xrController,
    LandingPage.pipelineModule(),
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
    mascotModule,
  ])

  // Menu handling
  const menuScreen = document.getElementById('menu-screen')
  const backBtn = document.getElementById('back-btn')
  const mascotCard = document.getElementById('mascot-card')
  const maskCard = document.getElementById('mask-card')

  const hideMenu = () => {
    if (menuScreen) menuScreen.style.display = 'none'
    if (backBtn) backBtn.style.display = 'block'
  }

  const showMenu = () => {
    if (menuScreen) menuScreen.style.display = 'flex'
    if (backBtn) backBtn.style.display = 'none'
    uiManager.showInstruction('')
    const shutterContainer = document.getElementById('shutter-container')
    if (shutterContainer) shutterContainer.style.display = 'none'
  }

  const startMascotMode = () => {
    hideMenu()
    if (isFaceMode) {
      pendingRun = () => {
        XR8.removeCameraPipelineModule(faceController.name)
        XR8.removeCameraPipelineModule(maskModule.name)
        XR8.XrController.configure({
          imageTargetData: [targetAtomic, targetBackPower]
        })
        XR8.addCameraPipelineModule(xrController)
        XR8.addCameraPipelineModule(mascotModule)
        XR8.run({
          canvas: document.getElementById('camerafeed'),
          cameraDirection: 'back',
          cameraConfig: {
            direction: XR8.XrConfig.camera().BACK
          }
        })
      }
      XR8.stop()
      isFaceMode = false
    }
    uiManager.showInstruction('Scan the Mascot Decal to begin')
  }

  const startMaskMode = () => {
    hideMenu()
    if (!isFaceMode) {
      pendingRun = () => {
        XR8.removeCameraPipelineModule(xrController.name)
        XR8.removeCameraPipelineModule(mascotModule.name)
        XR8.addCameraPipelineModule(faceController)
        XR8.addCameraPipelineModule(maskModule)
        XR8.run({
          canvas: document.getElementById('camerafeed'),
          cameraDirection: 'front',
          cameraConfig: {
            direction: XR8.XrConfig.camera().FRONT
          }
        })
      }
      XR8.stop()
      isFaceMode = true
    }
    uiManager.showInstruction('Point the camera at your face!')
    uiManager.showShutterButton('Point the camera at your face and tap the shutter!')
  }

  if (mascotCard) mascotCard.addEventListener('click', startMascotMode)
  if (maskCard) maskCard.addEventListener('click', startMaskMode)
  if (backBtn) backBtn.addEventListener('click', () => {
    showMenu()
  })

  // Start XR8 (mascot mode by default, menu shown on top)
  XR8.run({
    canvas: document.getElementById('camerafeed'),
    cameraDirection: 'back',
    cameraConfig: {
      direction: XR8.XrConfig.camera().BACK
    }
  })
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
