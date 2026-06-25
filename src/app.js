import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {GameState} from './game-state.js'
import {UIManager} from './ui-manager.js'
import {initFaceMaskModule} from './face-mask-scene.js'
import {initScenePipelineModule} from './threejs-scene-init.js'
import {initBuzzerBeaterModule} from './buzzer-beater-scene.js'

window.THREE = THREE
window.THREE.GLTFLoader = GLTFLoader

const onxrloaded = () => {
  const gameState = new GameState()
  const uiManager = new UIManager(gameState)

  let currentMode = 'scanning' // 'scanning', 'mascot', 'mask', 'buzzer'

  // Global error handler to catch and display mobile safari runtime errors
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

  // Initialize custom scanning pipeline module
  const scanningModule = {
    name: 'scanning-target-module',
    listeners: [
      {
        event: 'reality.imagefound',
        process: (event) => {
          if (currentMode !== 'scanning') return
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

  const mascotModule = initScenePipelineModule(gameState, uiManager)
  const maskModule = initFaceMaskModule(uiManager)
  const buzzerModule = initBuzzerBeaterModule(uiManager)

  // Configure XrController for scanning session upfront
  XR8.XrController.configure({
    disableWorldTracking: false,
  })

  // Start initial scanning pipeline (BACK camera)
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

  // Wire up Card Clicks
  const mascotCard = document.getElementById('mascot-card')
  if (mascotCard) {
    mascotCard.addEventListener('click', () => {
      if (currentMode === 'scanning') startMascotMode()
    })
  }

  const maskCard = document.getElementById('mask-card')
  if (maskCard) {
    maskCard.addEventListener('click', () => {
      if (currentMode === 'scanning') startFaceTracking()
    })
  }

  const buzzerCard = document.getElementById('buzzer-card')
  if (buzzerCard) {
    buzzerCard.addEventListener('click', () => {
      if (currentMode === 'scanning') startBuzzerBeater()
    })
  }

  const startMascotMode = () => {
    currentMode = 'mascot'
    uiManager.hideMenu()
    
    XR8.addCameraPipelineModules([mascotModule])
    
    uiManager.showBackButton(() => {
      currentMode = 'scanning'
      uiManager.hideBackButton()
      uiManager.resetUI()
      uiManager.showInstruction('Scan an Image Target to Unlock!')
      XR8.removeCameraPipelineModule('scavenger-hunt-3d-renderer')
    })
  }

  const startBuzzerBeater = () => {
    currentMode = 'buzzer'
    uiManager.hideMenu()
    
    XR8.addCameraPipelineModules([buzzerModule])
    
    uiManager.showBackButton(() => {
      currentMode = 'scanning'
      uiManager.hideBackButton()
      uiManager.resetUI()
      uiManager.showInstruction('Scan an Image Target to Unlock!')
      XR8.removeCameraPipelineModule('buzzer-beater-renderer')
    })
  }

  const startFaceTracking = () => {
    currentMode = 'mask'
    uiManager.hideMenu()
    
    XR8.stop()
    
    setTimeout(() => {
      // Configure FaceController upfront
      XR8.FaceController.configure({
        meshGeometry: [
          XR8.FaceController.MeshGeometry.FACE
        ],
        coordinates: {
          mirroredDisplay: true,
        },
        maxDetections: 1,
      })

      // Swap SLAM/Scanning modules for Face Tracking modules
      XR8.removeCameraPipelineModule('xrcontroller')
      XR8.removeCameraPipelineModule('scanning-target-module')
      
      const faceController = XR8.FaceController.pipelineModule()
      XR8.addCameraPipelineModules([
        faceController,
        maskModule
      ])
      
      uiManager.showBackButton(() => goBackToScanning())
      
      XR8.run({
        canvas: document.getElementById('camerafeed'),
        cameraConfig: {
          direction: XR8.XrConfig.camera().FRONT
        },
        allowedDevices: XR8.XrConfig.device().ANY,
      })
    }, 300)
  }

  const goBackToScanning = () => {
    currentMode = 'scanning'
    uiManager.hideBackButton()
    uiManager.resetUI()
    
    XR8.stop()
    
    setTimeout(() => {
      // Reconfigure XrController for SLAM/Image Targets
      XR8.XrController.configure({
        disableWorldTracking: false,
      })

      // Swap Face modules back for SLAM/Scanning modules
      XR8.removeCameraPipelineModule('facecontroller')
      XR8.removeCameraPipelineModule('face-mask-renderer')
      
      const xrController = XR8.XrController.pipelineModule()
      XR8.addCameraPipelineModules([
        xrController,
        scanningModule
      ])
      
      uiManager.showInstruction('Scan an Image Target to Unlock!')
      
      XR8.run({
        canvas: document.getElementById('camerafeed'),
        cameraConfig: {
          direction: XR8.XrConfig.camera().BACK
        },
        allowedDevices: XR8.XrConfig.device().ANY,
      })
    }, 300)
  }

  // Initial instruction
  uiManager.showInstruction('Scan an Image Target to Unlock!')

  // Run with BACK camera first to support Target Scanning
  XR8.run({
    canvas: document.getElementById('camerafeed'),
    cameraConfig: {
      direction: XR8.XrConfig.camera().BACK
    },
    allowedDevices: XR8.XrConfig.device().ANY,
  })
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
