import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const PHYSICAL_METERS_PER_UNIT = 0.21
const UNITS_PER_METER = 1.0 / PHYSICAL_METERS_PER_UNIT

const STATE = {SCANNING: 0, PLACING: 1, PLACED: 2, SELFIE: 3}

export const initScenePipelineModule = (gameState, uiManager) => {
  let currentState = STATE.SCANNING
  let mascotModel = null
  let placeholderRing = null
  let groundPlane = null
  let rawMinY = 0
  let scaleFactor = 1.0
  const mixers = []
  const clock = new THREE.Clock()
  const raycaster = new THREE.Raycaster()
  const screenCenter = new THREE.Vector2(0, 0)

  let xrScene = null
  let xrCamera = null
  let selfieAnimFrame = null

  const initXrScene = ({scene, camera, renderer}) => {
    renderer.preserveDrawingBuffer = true
    xrScene = scene
    xrCamera = camera
    renderer.shadowMap.enabled = true

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5)
    directionalLight.position.set(5, 12, 8)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 1024
    directionalLight.shadow.mapSize.height = 1024
    directionalLight.shadow.camera.near = 0.5
    directionalLight.shadow.camera.far = 25
    scene.add(directionalLight)

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))

    // Ground reticle ring for placement mode
    const ringGeo = new THREE.RingGeometry(0.4, 0.5, 48)
    ringGeo.rotateX(-Math.PI / 2)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    })
    placeholderRing = new THREE.Mesh(ringGeo, ringMat)
    placeholderRing.visible = false
    scene.add(placeholderRing)

    // Invisible ground plane for raycasting tap-to-place
    const groundGeo = new THREE.PlaneGeometry(500, 500)
    groundGeo.rotateX(-Math.PI / 2)
    const groundMat = new THREE.MeshBasicMaterial({visible: false, side: THREE.DoubleSide})
    groundPlane = new THREE.Mesh(groundGeo, groundMat)
    groundPlane.position.y = 0
    scene.add(groundPlane)

    // Load mascot model
    const loader = new GLTFLoader()
    loader.load(
      'assets/AstronautThumbUp.glb',
      (gltf) => {
        mascotModel = gltf.scene

        mascotModel.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(mascotModel)
        const size = box.getSize(new THREE.Vector3())
        rawMinY = box.min.y
        console.log('[AR] Mascot loaded, bounds:', size, 'rawMinY:', rawMinY)

        const rawHeight = size.y
        if (rawHeight > 0) {
          const targetHeight = 2.6 * UNITS_PER_METER
          scaleFactor = targetHeight / rawHeight
        } else {
          scaleFactor = 6.0
        }
        mascotModel.scale.set(scaleFactor, scaleFactor, scaleFactor)
        mascotModel.visible = false

        mascotModel.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true
            node.receiveShadow = true
          }
        })

        scene.add(mascotModel)

        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(mascotModel)
          mixer.clipAction(gltf.animations[0]).play()
          mixers.push(mixer)
        }
      },
      undefined,
      (err) => console.error('Error loading mascot:', err)
    )

    camera.position.set(0, 2, 3)
  }

  // Calibrate ground plane height from the first few frames of camera data
  let groundCalibrated = false
  const calibrateGround = () => {
    if (groundCalibrated || !xrCamera || !groundPlane) return
    const cameraPos = new THREE.Vector3()
    xrCamera.getWorldPosition(cameraPos)
    // 8th Wall SLAM starts with camera at ~eye level.
    // Estimate floor as 1.3m below current camera position.
    const estimatedFloor = cameraPos.y - (1.3 * UNITS_PER_METER)
    groundPlane.position.y = estimatedFloor
    groundCalibrated = true
    console.log('[AR] Ground calibrated at Y:', estimatedFloor, 'camera Y:', cameraPos.y)
  }

  // Place mascot at a world position on the floor
  const placeMascotAt = (floorPoint) => {
    if (!mascotModel || !xrCamera) return

    mascotModel.position.copy(floorPoint)
    mascotModel.position.y -= rawMinY * scaleFactor

    // Face the camera
    const cameraPos = new THREE.Vector3()
    xrCamera.getWorldPosition(cameraPos)
    mascotModel.lookAt(new THREE.Vector3(cameraPos.x, mascotModel.position.y, cameraPos.z))

    mascotModel.visible = true
    if (placeholderRing) placeholderRing.visible = false

    currentState = STATE.PLACED
    uiManager.showSelfieButton()
    uiManager.updateClue('The mascot is placed! Tap "Take Selfie" to snap a photo with it.')
  }

  // Handle tap during placement mode
  const handlePlacementTap = (e) => {
    if (currentState !== STATE.PLACING || !mascotModel || !xrCamera || !groundPlane) return

    const touch = e.touches ? e.touches[0] : e
    const tapNDC = new THREE.Vector2(
      (touch.clientX / window.innerWidth) * 2 - 1,
      -(touch.clientY / window.innerHeight) * 2 + 1
    )

    raycaster.setFromCamera(tapNDC, xrCamera)
    const hits = raycaster.intersectObject(groundPlane)
    if (hits.length > 0) {
      placeMascotAt(hits[0].point)
    }
  }

  // Transition to front-camera selfie mode
  const startSelfieMode = () => {
    currentState = STATE.SELFIE

    const {scene, camera, renderer} = XR8.Threejs.xrScene()

    XR8.pause()

    renderer.setClearColor(0x000000, 0)

    const selfieLight = new THREE.DirectionalLight(0xffffff, 1.0)
    selfieLight.position.set(0, 5, 10)
    scene.add(selfieLight)

    const mascotH = 2.6 * UNITS_PER_METER
    camera.fov = 50
    camera.aspect = window.innerWidth / window.innerHeight
    camera.near = 0.1
    camera.far = 1000
    camera.updateProjectionMatrix()
    camera.position.set(0, mascotH * 0.45, mascotH * 1.4)
    camera.lookAt(mascotH * 0.12, mascotH * 0.35, 0)

    if (mascotModel) {
      mascotModel.position.set(mascotH * 0.25, 0, 0)
      mascotModel.rotation.set(0, -Math.PI / 6, 0)
      mascotModel.visible = true
    }

    if (placeholderRing) placeholderRing.visible = false

    const renderSelfieFrame = () => {
      if (currentState !== STATE.SELFIE) return
      const delta = clock.getDelta()
      mixers.forEach((m) => m.update(delta))
      renderer.clear()
      renderer.render(scene, camera)
      selfieAnimFrame = requestAnimationFrame(renderSelfieFrame)
    }
    renderSelfieFrame()
  }

  // Expose selfie trigger for the UI manager
  uiManager._startSelfieMode = startSelfieMode

  return {
    name: 'scavenger-hunt-3d-renderer',

    onStart: ({canvas}) => {
      const {scene, camera, renderer} = XR8.Threejs.xrScene()
      initXrScene({scene, camera, renderer})

      XR8.XrController.updateCameraProjectionMatrix({
        origin: camera.position,
        facing: camera.quaternion
      })

      // Listen for taps on the canvas for mascot placement
      canvas.addEventListener('touchstart', handlePlacementTap)
    },

    onUpdate: () => {
      const delta = clock.getDelta()
      mixers.forEach((m) => m.update(delta))

      // Calibrate ground plane once SLAM has started
      calibrateGround()

      // During placement mode, project reticle onto ground from screen center
      if (currentState === STATE.PLACING && placeholderRing && xrCamera && groundPlane) {
        raycaster.setFromCamera(screenCenter, xrCamera)
        const hits = raycaster.intersectObject(groundPlane)
        if (hits.length > 0) {
          placeholderRing.position.copy(hits[0].point)
          placeholderRing.position.y += 0.02
          placeholderRing.visible = true
        } else {
          placeholderRing.visible = false
        }
        placeholderRing.rotation.y += 0.01
      }
    },

    listeners: [
      {
        event: 'reality.imagefound',
        process: (event) => {
          if (currentState !== STATE.SCANNING) return
          const {name} = event.detail || event
          if (name !== 'image-target-atomic') return
          if (!mascotModel) return

          // Award points once
          const reward = gameState.scanTarget(name)
          if (reward) {
            uiManager.updateHUD(
              reward.totalScore,
              reward.progress,
              gameState.totalTargets,
              reward.nextClue
            )

            uiManager.showFoundModal(
              reward.title,
              reward.description,
              reward.points,
              () => {
                // Enter placement mode after dismissing the modal
                currentState = STATE.PLACING
                uiManager.updateClue('Point your camera at the floor and tap to place the mascot.')
              }
            )
          }
        }
      },
      {
        event: 'reality.imageupdated',
        process: () => {}
      },
      {
        event: 'reality.imagelost',
        process: () => {}
      }
    ]
  }
}
