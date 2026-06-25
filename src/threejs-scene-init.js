import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'

const PHYSICAL_METERS_PER_UNIT = 0.21
const UNITS_PER_METER = 1.0 / PHYSICAL_METERS_PER_UNIT

const STATE = {SCANNING: 0, PLACING: 1, PLACED: 2}

export const initScenePipelineModule = (gameState, uiManager) => {
  let currentState = STATE.SCANNING
  let mascotModel = null
  let reticle = null
  let groundPlane = null
  let rawMinY = 0
  let scaleFactor = 1.0
  const mixers = []
  const clock = new THREE.Clock()
  const raycaster = new THREE.Raycaster()
  const screenCenter = new THREE.Vector2(0, 0)

  let xrScene = null
  let xrCamera = null
  let pendingActivation = false

  // Track last known target position (used only during placement phase)
  let lastTargetPos = null

  const initXrScene = ({scene, camera, renderer}) => {
    renderer.preserveDrawingBuffer = true
    xrScene = scene
    xrCamera = camera
    renderer.shadowMap.enabled = true

    currentState = STATE.SCANNING
    mascotModel = null
    reticle = null
    groundPlane = null
    rawMinY = 0
    scaleFactor = 1.0
    mixers.length = 0
    pendingActivation = false
    groundCalibrated = false
    lastTargetPos = null

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5)
    dirLight.position.set(5, 12, 8)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.set(1024, 1024)
    dirLight.shadow.camera.near = 0.5
    dirLight.shadow.camera.far = 25
    scene.add(dirLight)
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))

    const ringGeo = new THREE.RingGeometry(0.6, 0.75, 48)
    ringGeo.rotateX(-Math.PI / 2)
    reticle = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0x00f2fe, side: THREE.DoubleSide, transparent: true, opacity: 0.7
    }))
    reticle.visible = false
    scene.add(reticle)

    const groundGeo = new THREE.PlaneGeometry(500, 500)
    groundGeo.rotateX(-Math.PI / 2)
    groundPlane = new THREE.Mesh(groundGeo, new THREE.MeshBasicMaterial({visible: false, side: THREE.DoubleSide}))
    scene.add(groundPlane)

    uiManager.showInstruction('Loading mascot assets...')
    new GLTFLoader().load('assets/AstronautThumbUp.glb', (gltf) => {
      mascotModel = gltf.scene
      mascotModel.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(mascotModel)
      const size = box.getSize(new THREE.Vector3())
      rawMinY = box.min.y

      const rawHeight = size.y
      const targetHeight = 1.3 * UNITS_PER_METER
      scaleFactor = rawHeight > 0 ? targetHeight / rawHeight : 6.0
      mascotModel.scale.set(scaleFactor, scaleFactor, scaleFactor)
      mascotModel.visible = false

      mascotModel.traverse((n) => {
        if (n.isMesh) { n.castShadow = true; n.receiveShadow = true }
      })
      scene.add(mascotModel)

      if (gltf.animations && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(mascotModel)
        mixer.clipAction(gltf.animations[0]).play()
        mixers.push(mixer)
      }

      if (pendingActivation) {
        pendingActivation = false
        activateExperience()
      } else {
        uiManager.showInstruction('Scan the atomic target to unlock!')
      }
    }, undefined, (err) => {
      console.error('Model load error:', err)
      uiManager.showInstruction('Error loading mascot assets.')
    })

    camera.position.set(0, 2, 3)
  }

  let groundCalibrated = false
  const calibrateGround = () => {
    if (groundCalibrated || !xrCamera || !groundPlane) return
    const cp = new THREE.Vector3()
    xrCamera.getWorldPosition(cp)
    groundPlane.position.y = cp.y - (1.3 * UNITS_PER_METER)
    groundCalibrated = true
  }

  const activateExperience = () => {
    gameState.resetGame()
    const reward = gameState.scanTarget('image-target-atomic')
    if (!reward) return

    uiManager.showFoundOverlay(reward.points, () => {
      currentState = STATE.PLACING
      uiManager.showInstruction('Tap the floor to place the mascot')
    })
  }

  const placeMascotAt = (point) => {
    if (!mascotModel || !xrCamera) return
    mascotModel.position.copy(point)
    mascotModel.position.y -= rawMinY * scaleFactor

    const cp = new THREE.Vector3()
    xrCamera.getWorldPosition(cp)
    mascotModel.lookAt(new THREE.Vector3(cp.x, mascotModel.position.y, cp.z))

    mascotModel.visible = true
    reticle.visible = false
    currentState = STATE.PLACED

    uiManager.showInstruction('')
    uiManager.showShutterButton()
  }

  const handlePlacementTap = (e) => {
    if (currentState !== STATE.PLACING || !xrCamera || !groundPlane) return
    const t = e.touches ? e.touches[0] : e
    const ndc = new THREE.Vector2(
      (t.clientX / window.innerWidth) * 2 - 1,
      -(t.clientY / window.innerHeight) * 2 + 1
    )
    raycaster.setFromCamera(ndc, xrCamera)
    const hits = raycaster.intersectObject(groundPlane)
    if (hits.length > 0) placeMascotAt(hits[0].point)
  }

  return {
    name: 'scavenger-hunt-3d-renderer',

    onStart: ({canvas}) => {
      const {scene, camera, renderer} = XR8.Threejs.xrScene()
      initXrScene({scene, camera, renderer})
      XR8.XrController.updateCameraProjectionMatrix({
        origin: camera.position, facing: camera.quaternion
      })
      canvas.removeEventListener('touchstart', handlePlacementTap)
      canvas.addEventListener('touchstart', handlePlacementTap)
    },

    onUpdate: () => {
      const delta = clock.getDelta()
      mixers.forEach((m) => m.update(delta))
      calibrateGround()

      if (currentState === STATE.PLACING && reticle && xrCamera && groundPlane) {
        raycaster.setFromCamera(screenCenter, xrCamera)
        const hits = raycaster.intersectObject(groundPlane)
        if (hits.length > 0) {
          reticle.position.copy(hits[0].point)
          reticle.position.y += 0.02
          reticle.visible = true
        } else {
          reticle.visible = false
        }
        reticle.rotation.y += 0.01
      }
    },

    onStop: () => {
      const canvas = document.getElementById('camerafeed')
      if (canvas) {
        canvas.removeEventListener('touchstart', handlePlacementTap)
      }
      if (xrScene) {
        if (mascotModel) xrScene.remove(mascotModel)
        if (reticle) xrScene.remove(reticle)
        if (groundPlane) xrScene.remove(groundPlane)
        const lights = xrScene.children.filter(child => child.isLight)
        lights.forEach(light => xrScene.remove(light))
      }
    },

    listeners: [
      {
        event: 'reality.imagefound',
        process: (event) => {
          const {name} = event.detail || event
          if (name !== 'image-target-atomic') return

          if (currentState === STATE.SCANNING) {
            if (!mascotModel) {
              pendingActivation = true
              uiManager.showInstruction('Loading mascot...')
              return
            }
            activateExperience()
          }
        }
      },
      {
        event: 'reality.imageupdated',
        process: (event) => {
          const {name} = event.detail || event
          if (name !== 'image-target-atomic') return

          // If model finished loading while target is still visible
          if (currentState === STATE.SCANNING && pendingActivation && mascotModel) {
            pendingActivation = false
            activateExperience()
          }
        }
      },
      {event: 'reality.imagelost', process: () => {}}
    ]
  }
}
