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

const onxrloaded = async () => {
  const gameState = new GameState()
  const uiManager = new UIManager(gameState)

  let isFaceMode = false
  let faceChunkLoaded = false

  // Listen for XR8 stop events to execute pending session restarts
  let pendingRun = null
  window.addEventListener('stopxr', () => {
    if (pendingRun) {
      const fn = pendingRun
      pendingRun = null
      setTimeout(fn, 300)
    }
  })

  // Configure SLAM controller upfront (always available)
  XR8.XrController.configure({
    imageTargetData: [targetAtomic, targetBackPower]
  })

  const mascotModule = initScenePipelineModule(gameState, uiManager)
  const maskModule = initFaceMaskModule(uiManager)

  // Load face chunk on demand (not at startup)
  const ensureFaceChunk = async () => {
    if (faceChunkLoaded) return true
    try {
      await XR8.loadChunk('face')
      faceChunkLoaded = true
      XR8.FaceController.configure({
        meshGeometry: [XR8.FaceController.MeshGeometry.FACE],
        maxDetections: 1,
      })
      console.log('[App] Face chunk loaded, FaceController:', !!XR8.FaceController)
      return true
    } catch (err) {
      console.error('[App] Failed to load face chunk:', err)
      uiManager.showInstruction('Face tracking not available on this device')
      return false
    }
  }

  const startSession = (mode) => {
    const modules = [
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),
      XRExtras.Loading.pipelineModule(),
      XRExtras.RuntimeError.pipelineModule(),
    ]

    if (mode === 'mask') {
      modules.push(XR8.FaceController.pipelineModule())
      modules.push(maskModule)
    } else {
      modules.push(XR8.XrController.pipelineModule())
      modules.push(LandingPage.pipelineModule())
      modules.push(mascotModule)
    }

    if (XR8.clearCameraPipelineModules) XR8.clearCameraPipelineModules()
    XR8.addCameraPipelineModules(modules)

    XR8.run({
      canvas: document.getElementById('camerafeed'),
      cameraConfig: {
        direction: mode === 'mask'
          ? XR8.XrConfig.camera().FRONT
          : XR8.XrConfig.camera().BACK
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
    const sc = document.getElementById('shutter-container')
    if (sc) sc.style.display = 'none'
  }

  const startMascotMode = () => {
    hideMenu()
    if (isFaceMode) {
      pendingRun = () => startSession('mascot')
      XR8.stop()
      isFaceMode = false
    } else {
      startSession('mascot')
    }
    uiManager.showInstruction('Scan the Mascot Decal to begin')
  }

  const startMaskMode = async () => {
    hideMenu()
    const loaded = await ensureFaceChunk()
    if (!loaded) return

    if (!isFaceMode) {
      pendingRun = () => startSession('mask')
      XR8.stop()
      isFaceMode = true
    } else {
      startSession('mask')
    }
    uiManager.showShutterButton('Point the camera at your face and tap the shutter!')
  }

  if (mascotCard) mascotCard.addEventListener('click', startMascotMode)
  if (maskCard) maskCard.addEventListener('click', startMaskMode)
  if (backBtn) backBtn.addEventListener('click', showMenu)

  // Start in mascot mode
  startSession('mascot')
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
