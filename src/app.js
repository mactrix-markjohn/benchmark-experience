import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {GameState} from './game-state.js'
import {UIManager} from './ui-manager.js'
import {initFaceMaskModule} from './face-mask-scene.js'

window.THREE = THREE
window.THREE.GLTFLoader = GLTFLoader

const onxrloaded = () => {
  const gameState = new GameState()
  const uiManager = new UIManager(gameState)

  // Configure FaceController upfront
  XR8.FaceController.configure({
    meshGeometry: [XR8.FaceController.MeshGeometry.FACE],
    maxDetections: 1,
  })

  // Store pipeline module references
  const faceController = XR8.FaceController.pipelineModule()
  const maskModule = initFaceMaskModule(uiManager)

  // Add the required modules to the camera pipeline
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    faceController,
    LandingPage.pipelineModule(),
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
    maskModule,
  ])

  // Hide the menu screen immediately to start the AR experience directly
  const menuScreen = document.getElementById('menu-screen')
  if (menuScreen) {
    menuScreen.style.display = 'none'
  }

  // Show instruction and the shutter button immediately
  uiManager.showInstruction('Point the camera at your face!')
  uiManager.showShutterButton('Point the camera at your face and tap the shutter!')

  // Start the session with the FRONT camera
  XR8.run({
    canvas: document.getElementById('camerafeed'),
    cameraDirection: 'front',
    cameraConfig: {
      direction: XR8.XrConfig.camera().FRONT
    }
  })
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
