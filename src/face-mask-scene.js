import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'

export const initFaceMaskModule = (uiManager) => {
  let maskModel = null
  let xrScene = null
  let xrCamera = null
  const mixers = []
  const clock = new THREE.Clock()

  const initScene = ({scene, camera, renderer}) => {
    renderer.preserveDrawingBuffer = true
    xrScene = scene
    xrCamera = camera
    maskModel = null
    mixers.length = 0

    // Front-facing light for the mask
    scene.add(new THREE.DirectionalLight(0xffffff, 1.2).translateZ(5).translateY(3))
    scene.add(new THREE.AmbientLight(0xffffff, 0.8))

    new GLTFLoader().load('assets/trappermask.glb', (gltf) => {
      maskModel = gltf.scene
      maskModel.visible = false

      maskModel.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = false
          n.receiveShadow = false
        }
      })

      scene.add(maskModel)

      if (gltf.animations && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(maskModel)
        mixer.clipAction(gltf.animations[0]).play()
        mixers.push(mixer)
      }

      // Log bounds for debugging positioning
      maskModel.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(maskModel)
      const size = box.getSize(new THREE.Vector3())
      console.log('[FaceMask] Model loaded, bounds:', size)
    }, undefined, (err) => console.error('Mask load error:', err))
  }

  return {
    name: 'face-mask-renderer',

    onStart: () => {
      const {scene, camera, renderer} = XR8.Threejs.xrScene()
      initScene({scene, camera, renderer})
    },

    onUpdate: () => {
      const delta = clock.getDelta()
      mixers.forEach((m) => m.update(delta))
    },

    listeners: [
      {
        event: 'facecontroller.facefound',
        process: (event) => {
          if (!maskModel) return
          const {transform} = event.detail || event
          if (!transform) return

          maskModel.position.copy(transform.position)
          maskModel.quaternion.copy(transform.rotation)
          maskModel.scale.set(transform.scale, transform.scale, transform.scale)
          maskModel.visible = true
        }
      },
      {
        event: 'facecontroller.faceupdated',
        process: (event) => {
          if (!maskModel) return
          const {transform} = event.detail || event
          if (!transform) return

          maskModel.position.copy(transform.position)
          maskModel.quaternion.copy(transform.rotation)
          maskModel.scale.set(transform.scale, transform.scale, transform.scale)
        }
      },
      {
        event: 'facecontroller.facelost',
        process: () => {
          if (maskModel) maskModel.visible = false
        }
      }
    ]
  }
}
