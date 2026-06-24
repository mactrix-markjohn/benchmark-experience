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
      setTimeout(runFn, 500)
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

  const recreateSession = (mode) => {
    // Clear all existing pipeline modules to start fresh
    XR8.clearCameraPipelineModules()

    // Add fresh instances of all required modules for the target mode
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      mode === 'mask' ? faceController : xrController,
      LandingPage.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),
      XRExtras.Loading.pipelineModule(),
      XRExtras.RuntimeError.pipelineModule(),
      mode === 'mask' ? maskModule : mascotModule,
    ])

    // Run the session with the appropriate front/back camera direction
    XR8.run({
      canvas: document.getElementById('camerafeed'),
      cameraConfig: {
        direction: mode === 'mask' ? XR8.XrConfig.camera().FRONT : XR8.XrConfig.camera().BACK
      }
    })
  }

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
      pendingRun = () => recreateSession('mascot')
      XR8.stop()
      isFaceMode = false
    }
    uiManager.showInstruction('Scan the Mascot Decal to begin')
  }

  const startMaskMode = () => {
    hideMenu()
    if (!isFaceMode) {
      pendingRun = () => recreateSession('mask')
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

  // Start in mascot mode by default
  recreateSession('mascot')
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
