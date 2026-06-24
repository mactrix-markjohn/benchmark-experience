import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { GameState } from './game-state.js'
import { UIManager } from './ui-manager.js'
import { initScenePipelineModule } from './threejs-scene-init.js'

// Expose THREE globally for 8th Wall engine and components
window.THREE = THREE
window.THREE.GLTFLoader = GLTFLoader

// Import pre-processed target metadata configs
import targetAtomic from '../image-targets/image-target-atomic.json'
import targetBackPower from '../image-targets/image-target-back-power.json'

const onxrloaded = () => {
  // 1. Initialize core game state and UI HUD handlers
  const gameState = new GameState()
  const uiManager = new UIManager(gameState)
  window._uiManager = uiManager

  // 2. Load the initial score and objective updates on screens
  uiManager.updateHUD(
    gameState.score,
    gameState.scannedTargets.length,
    gameState.totalTargets,
    gameState.getCurrentClue()
  )

  // 3. Register target configurations into the tracking module
  XR8.XrController.configure({
    imageTargetData: [targetAtomic, targetBackPower]
  })

  // 4. Bind camera pipeline components
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),      // Draws camera streams
    XR8.Threejs.pipelineModule(),                // Maps ThreeJS spaces
    XR8.XrController.pipelineModule(),           // Configures SLAM & target trackers
    LandingPage.pipelineModule(),                // Directs capability checks
    XRExtras.FullWindowCanvas.pipelineModule(),  // Normalizes sizes
    XRExtras.Loading.pipelineModule(),           // Overlay loading screen
    XRExtras.RuntimeError.pipelineModule(),      // Debug logs on crash
    
    initScenePipelineModule(gameState, uiManager), // Scavenger hunt logic
  ])

  // 5. Begin AR execution loop
  const canvas = document.getElementById('camerafeed')
  XR8.run({ canvas })
}

// Attach listeners or run directly if context is ready
window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
