import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'

export const initFaceMaskModule = (uiManager) => {
  let faceAnchorGroup = null
  let maskModel = null
  let faceHiderModel = null
  let xrScene = null
  let xrCamera = null
  const mixers = []
  const clock = new THREE.Clock()

  const initScene = ({scene, camera, renderer}) => {
    renderer.preserveDrawingBuffer = true
    xrScene = scene
    xrCamera = camera
    maskModel = null
    faceHiderModel = null
    mixers.length = 0

    // Create and add the anchor group
    faceAnchorGroup = new THREE.Group()
    faceAnchorGroup.visible = false
    scene.add(faceAnchorGroup)

    // Front-facing light for the mask
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
    dirLight.position.set(0, 3, 5)
    scene.add(dirLight)
    scene.add(new THREE.AmbientLight(0xffffff, 0.8))

    const loader = new GLTFLoader()

    // 1. Load the Trapper Mask model
    loader.load('assets/trappermask.glb', (gltf) => {
      maskModel = gltf.scene

      // Set local offsets relative to faceAnchorGroup
      maskModel.position.set(0.08976, -0.8917, -0.7399)
      maskModel.quaternion.set(0, 0.737277, 0, -0.67559)
      maskModel.scale.set(1.9, 1.9, 1.9)

      maskModel.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = false
          n.receiveShadow = false
        }
      })

      faceAnchorGroup.add(maskModel)

      if (gltf.animations && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(maskModel)
        mixer.clipAction(gltf.animations[0]).play()
        mixers.push(mixer)
      }

      // Log bounds for debugging positioning
      maskModel.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(maskModel)
      const size = box.getSize(new THREE.Vector3())
      console.log('[FaceMask] Mask model loaded, bounds:', size)
    }, undefined, (err) => {
      console.error('Mask load error:', err)
      alert('Failed to load face mask model: ' + (err.message || err))
    })

    // 2. Load the Face Hider (occluder) model
    loader.load('assets/face-hider.glb', (gltf) => {
      faceHiderModel = gltf.scene

      // Set local offsets relative to faceAnchorGroup
      faceHiderModel.position.set(0, 0, 0)
      faceHiderModel.quaternion.set(0, 0, 0, 1)
      faceHiderModel.scale.set(0.96, 0.96, 0.96)

      faceHiderModel.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = false
          n.receiveShadow = false
          // Set renderOrder to render before the mask model (default is 0)
          n.renderOrder = -1
          if (n.material) {
            n.material.colorWrite = false
            n.material.depthWrite = true
          }
        }
      })

      faceAnchorGroup.add(faceHiderModel)
      console.log('[FaceMask] Face hider model loaded and configured as occluder')
    }, undefined, (err) => {
      console.error('Face hider load error:', err)
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

          faceAnchorGroup.position.copy(transform.position)
          faceAnchorGroup.quaternion.copy(transform.rotation)
          faceAnchorGroup.scale.set(transform.scale, transform.scale, transform.scale)
          faceAnchorGroup.visible = true
        }
      },
      {
        event: 'facecontroller.faceupdated',
        process: (event) => {
          if (!maskModel) return
          const {transform} = event.detail || event
          if (!transform) return

          faceAnchorGroup.position.copy(transform.position)
          faceAnchorGroup.quaternion.copy(transform.rotation)
          faceAnchorGroup.scale.set(transform.scale, transform.scale, transform.scale)
          faceAnchorGroup.visible = true
        }
      },
      {
        event: 'facecontroller.facelost',
        process: () => {
          if (faceAnchorGroup) faceAnchorGroup.visible = false
        }
      }
    ]
  }
}
