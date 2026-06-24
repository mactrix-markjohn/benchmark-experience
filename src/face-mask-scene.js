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
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
    dirLight.position.set(0, 3, 5)
    scene.add(dirLight)
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
    }, undefined, (err) => {
      console.error('Mask load error:', err)
      alert('Failed to load face mask model: ' + (err.message || err))
    })
  }

  return {
    name: 'face-mask-renderer',

    onStart: () => {
      console.log('[FaceMask] onStart triggered')
      const xrData = XR8.Threejs.xrScene()
      if (!xrData) {
        console.error('XR8.Threejs.xrScene() returned null/undefined in onStart')
        alert('XR8.Threejs.xrScene() is not initialized yet in onStart!')
        return
      }
      const {scene, camera, renderer} = xrData
      initScene({scene, camera, renderer})
    },

    onUpdate: () => {
      if (mixers.length > 0) {
        const delta = clock.getDelta()
        mixers.forEach((m) => m.update(delta))
      }
    },

    listeners: [
      {
        event: 'facecontroller.facefound',
        process: (event) => {
          console.log('[FaceMask] facefound event fired!')
          if (!maskModel) {
            console.log('[FaceMask] facefound: maskModel not loaded yet')
            return
          }
          const {transform} = event.detail || event
          if (!transform) {
            console.log('[FaceMask] facefound: no transform details found')
            return
          }
          console.log('[FaceMask] facefound: tracking success, scaling to', transform.scale)

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
          maskModel.visible = true
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
