import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {GameState} from './game-state.js'
import {UIManager} from './ui-manager.js'
import {initScenePipelineModule} from './threejs-scene-init.js'

window.THREE = THREE
window.THREE.GLTFLoader = GLTFLoader

import targetAtomic from '../image-targets/image-target-atomic.json'
import targetBackPower from '../image-targets/image-target-back-power.json'

const onxrloaded = () => {
  const gameState = new GameState()
  const uiManager = new UIManager(gameState)

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

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
