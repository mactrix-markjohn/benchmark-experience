import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {GameState} from './game-state.js'
import {UIManager} from './ui-manager.js'
import {initFaceMaskModule} from './face-mask-scene.js'
import {initScenePipelineModule} from './threejs-scene-init.js'
import {initBuzzerBeaterModule} from './buzzer-beater-scene.js'
import imageTargetAtomic from '../image-targets/image-target-atomic.json'
import imageTargetBackPower from '../image-targets/image-target-back-power.json'

window.THREE = THREE
window.THREE.GLTFLoader = GLTFLoader

const onxrloaded = () => {
  const gameState = new GameState()
  const uiManager = new UIManager(gameState)

  // Global error handler to catch and display mobile Safari runtime errors
  window.onerror = (message, source, lineno, colno, error) => {
    const errorStr = `${message} at ${source}:${lineno}:${colno}`
    alert(errorStr)
    uiManager.showInstruction(errorStr)
  }

  // Catch unhandled promise rejections (useful for async/WASM load errors)
  window.addEventListener('unhandledrejection', (event) => {
    const errorStr = `Unhandled Promise Rejection: ${event.reason}`
    alert(errorStr)
    uiManager.showInstruction(errorStr)
  })

  // Parse search query parameter
  const urlParams = new URLSearchParams(window.location.search)
  const experience = urlParams.get('experience') // null, 'mascot', 'mask', 'buzzer'

  if (!experience) {
    // ----------------------------------------------------
    // SCANNING MODE (Default Entry)
    // ----------------------------------------------------
    console.log('[App] Starting in Scanning Mode')

    const scanningModule = {
      name: 'scanning-target-module',
      listeners: [
        {
          event: 'reality.imagefound',
          process: (event) => {
            const {name} = event.detail || event
            console.log('[Scanning] Target found:', name)
            
            if (name === 'image-target-atomic') {
              uiManager.showMenu('atomic')
              uiManager.showInstruction('Atomic target detected! Select Mascot or Face Mask.')
            } else if (name === 'image-target-back-power') {
              uiManager.showMenu('power')
              uiManager.showInstruction('Power target detected! Select Buzzer Beater.')
            }
          }
        }
      ]
    }

    // Configure SLAM with target JSON data upfront
    XR8.XrController.configure({
      disableWorldTracking: false,
      imageTargetData: [
        imageTargetAtomic,
        imageTargetBackPower,
      ],
    })

    // Register Scanning Modules
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      LandingPage.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),
      XRExtras.Loading.pipelineModule(),
      XRExtras.RuntimeError.pipelineModule(),
      scanningModule,
    ])

    // Wire up Menu Choices to reload page with experience parameter
    const mascotCard = document.getElementById('mascot-card')
    if (mascotCard) {
      mascotCard.addEventListener('click', () => {
        window.location.search = '?experience=mascot'
      })
    }

    const maskCard = document.getElementById('mask-card')
    if (maskCard) {
      maskCard.addEventListener('click', () => {
        window.location.search = '?experience=mask'
      })
    }

    const buzzerCard = document.getElementById('buzzer-card')
    if (buzzerCard) {
      buzzerCard.addEventListener('click', () => {
        window.location.search = '?experience=buzzer'
      })
    }

    // Menu "Scan Another Target" close button
    const menuBackBtn = document.getElementById('menu-back-btn')
    if (menuBackBtn) {
      menuBackBtn.addEventListener('click', () => {
        uiManager.hideMenu()
        uiManager.showInstruction('Scan an Image Target to Unlock!')
      })
    }

    // Initial instruction
    uiManager.showInstruction('Scan an Image Target to Unlock!')

    // Run BACK camera for scanning
    XR8.run({
      canvas: document.getElementById('camerafeed'),
      cameraConfig: {
        direction: XR8.XrConfig.camera().BACK
      },
      allowedDevices: XR8.XrConfig.device().ANY,
    })

  } else if (experience === 'mascot') {
    // ----------------------------------------------------
    // MASCOT MODE
    // ----------------------------------------------------
    console.log('[App] Starting in Mascot Mode')
    const mascotModule = initScenePipelineModule(gameState, uiManager)

    XR8.XrController.configure({
      disableWorldTracking: false,
    })

    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      LandingPage.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),
      XRExtras.Loading.pipelineModule(),
      XRExtras.RuntimeError.pipelineModule(),
      mascotModule,
    ])

    // Back button returns to scanner by reloading page with empty params
    uiManager.showBackButton(() => {
      window.location.href = window.location.pathname
    })

    XR8.run({
      canvas: document.getElementById('camerafeed'),
      cameraConfig: {
        direction: XR8.XrConfig.camera().BACK
      },
      allowedDevices: XR8.XrConfig.device().ANY,
    })

  } else if (experience === 'buzzer') {
    // ----------------------------------------------------
    // BUZZER BEATER MODE
    // ----------------------------------------------------
    console.log('[App] Starting in Buzzer Beater Mode')
    const buzzerModule = initBuzzerBeaterModule(uiManager)

    XR8.XrController.configure({
      disableWorldTracking: false,
    })

    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      LandingPage.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),
      XRExtras.Loading.pipelineModule(),
      XRExtras.RuntimeError.pipelineModule(),
      buzzerModule,
    ])

    uiManager.showBackButton(() => {
      window.location.href = window.location.pathname
    })

    XR8.run({
      canvas: document.getElementById('camerafeed'),
      cameraConfig: {
        direction: XR8.XrConfig.camera().BACK
      },
      allowedDevices: XR8.XrConfig.device().ANY,
    })

  } else if (experience === 'mask') {
    // ----------------------------------------------------
    // TRY THE MASK MODE (Face Tracking - FRONT camera only)
    // ----------------------------------------------------
    console.log('[App] Starting in Face Tracking Mode')
    const maskModule = initFaceMaskModule(uiManager)

    // Disable world tracking to prevent SLAM conflicts on the front camera
    XR8.XrController.configure({
      disableWorldTracking: true,
    })

    XR8.FaceController.configure({
      meshGeometry: [
        XR8.FaceController.MeshGeometry.FACE
      ],
      coordinates: {
        mirroredDisplay: true,
      },
      maxDetections: 1,
    })

    // NO XrController is added here. This guarantees no SLAM conflicts
    // and preserves correct face mirroring projection.
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.FaceController.pipelineModule(),
      LandingPage.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),
      XRExtras.Loading.pipelineModule(),
      XRExtras.RuntimeError.pipelineModule(),
      maskModule,
    ])

    uiManager.showBackButton(() => {
      window.location.href = window.location.pathname
    })

    XR8.run({
      canvas: document.getElementById('camerafeed'),
      cameraConfig: {
        direction: XR8.XrConfig.camera().FRONT
      },
      allowedDevices: XR8.XrConfig.device().ANY,
    })
  }
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
