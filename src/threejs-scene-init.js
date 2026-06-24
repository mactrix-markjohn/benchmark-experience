import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// 8th Wall normalizes the larger dimension of flat image targets to 1.0 unit.
// The physical book cover is approximately 0.21m in height.
// Therefore, 1.0 Three.js unit = 0.21 physical meters.
const PHYSICAL_METERS_PER_UNIT = 0.21
const UNITS_PER_METER = 1.0 / PHYSICAL_METERS_PER_UNIT // ~4.76 units/meter

// Helper to define 3D assets and coordinate target scans with game state & UI
export const initScenePipelineModule = (gameState, uiManager) => {
  let mascotPlaced = false
  let mascotModel = null
  let placeholderRing = null
  let mixer = null
  let rawMinY = 0
  let scaleFactor = 1.0
  const mixers = []
  const clock = new THREE.Clock()
  
  // Track 8th Wall scene coordinates
  let xrScene = null
  let xrCamera = null

  // Populates lighting, shadows, and default placeholder geometries
  const initXrScene = ({scene, camera, renderer}) => {
    renderer.preserveDrawingBuffer = true
    xrScene = scene
    xrCamera = camera
    renderer.shadowMap.enabled = true

    // Add lights for realistic shadows and GLB reflections
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5)
    directionalLight.position.set(5, 12, 8)
    directionalLight.castShadow = true
    
    // Configure shadow maps for better quality
    directionalLight.shadow.mapSize.width = 1024
    directionalLight.shadow.mapSize.height = 1024
    directionalLight.shadow.camera.near = 0.5
    directionalLight.shadow.camera.far = 25
    scene.add(directionalLight)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    // Create a neon tracking placeholder ring
    const ringGeo = new THREE.RingGeometry(0.2, 0.25, 32)
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

    // Load the life-size mascot asynchronously
    const loader = new GLTFLoader()
    const modelUrl = 'assets/AstronautThumbUp.glb'
    
    loader.load(
      modelUrl,
      (gltf) => {
        mascotModel = gltf.scene
        
        // Print model bounds size for visual scaling reference
        mascotModel.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(mascotModel)
        const size = box.getSize(new THREE.Vector3())
        console.log(`[AR] Mascot model loaded, raw bounds size:`, size)

        // Set scale dynamically to standard human size (1.8m height)
        // Since 1 unit = 0.21m, 1.8m = 1.8 * UNITS_PER_METER = ~8.57 units.
        // As requested by user, we multiply this size by 4.0 to make it giant.
        const rawHeight = size.y
        if (rawHeight > 0) {
          const targetHeight = 1.8 * UNITS_PER_METER * 4.0
          scaleFactor = targetHeight / rawHeight
          mascotModel.scale.set(scaleFactor, scaleFactor, scaleFactor)
          console.log(`[AR] Mascot dynamically scaled by factor ${scaleFactor} to height ${targetHeight} units (~7.2m)`)
        } else {
          scaleFactor = 24.0
          mascotModel.scale.set(scaleFactor, scaleFactor, scaleFactor) // Fallback if height check fails
        }
        mascotModel.visible = false // Hide until decal is scanned
        
        // Enable shadow casting for meshes in the model
        mascotModel.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true
            node.receiveShadow = true
          }
        })
        
        scene.add(mascotModel) // Add directly to world scene for SLAM co-existence

        // Prepare GLTF skeletal animation
        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(mascotModel)
          const action = mixer.clipAction(gltf.animations[0])
          action.play()
          mixers.push(mixer)
          console.log(`[AR] Prepared animation "${gltf.animations[0].name}"`)
        }
      },
      undefined,
      (error) => {
        console.error(`Error loading mascot model ${modelUrl}:`, error)
      }
    )

    camera.position.set(0, 2, 3)
  }

  // Helper to rotate the mascot to face the camera smoothly on Y-axis
  const alignMascotToCamera = () => {
    if (!mascotModel || !xrCamera) return
    const cameraPos = new THREE.Vector3()
    xrCamera.getWorldPosition(cameraPos)
    
    const mascotPos = new THREE.Vector3()
    mascotModel.getWorldPosition(mascotPos)
    
    // Look at camera position but lock height (Y) to keep the mascot upright
    const lookTarget = new THREE.Vector3(cameraPos.x, mascotPos.y, cameraPos.z)
    mascotModel.lookAt(lookTarget)
  }

  return {
    name: 'scavenger-hunt-3d-renderer',

    // Runs once when the camera feed starts and the canvas is bound
    onStart: ({canvas}) => {
      const {scene, camera, renderer} = XR8.Threejs.xrScene()

      initXrScene({scene, camera, renderer})

      // Sync 8th Wall coordinate system with cameras initial offset
      XR8.XrController.updateCameraProjectionMatrix({
        origin: camera.position,
        facing: camera.quaternion
      })
    },

    // Runs every tick (frame update) for animations
    onUpdate: () => {
      // Spin the loading placeholder ring
      if (placeholderRing && placeholderRing.visible) {
        placeholderRing.rotation.y += 0.015
      }

      // Update animation mixers with clock delta time
      const delta = clock.getDelta()
      mixers.forEach((mixer) => {
        mixer.update(delta)
      })
    },

    // Register target events listeners directly through the pipeline module listeners
    listeners: [
      {
        event: 'reality.imagefound',
        process: (event) => {
          const detail = event.detail || event
          const {name, position, rotation} = detail
          
          if (name !== 'image-target-atomic') return

          // Show placeholder loading ring if model is not loaded yet
          if (!mascotModel && placeholderRing) {
            placeholderRing.position.copy(position)
            placeholderRing.quaternion.copy(rotation)
            placeholderRing.visible = true
            return
          }

          // TARGET-TO-SLAM CO-EXISTENCE TRANSITION
          // If mascot has not been placed yet, lock its coordinate position in world space
          if (!mascotPlaced && mascotModel) {
            mascotPlaced = true
            
            if (placeholderRing) {
              placeholderRing.visible = false
            }

            // 1. Get camera world position
            const cameraPos = new THREE.Vector3()
            xrCamera.getWorldPosition(cameraPos)

            // 2. Calculate direction from camera to target projected on the horizontal floor plane (Y = 0)
            const targetPos = new THREE.Vector3().copy(position)
            const dir = new THREE.Vector3().subVectors(targetPos, cameraPos)
            dir.y = 0
            dir.normalize()

            // 3. Set the spawn position 3.5 meters behind the target (away from the camera)
            // 3.5m in units is 3.5 * UNITS_PER_METER (offset further back to fit the 4x larger size)
            const offsetDistance = 3.5 * UNITS_PER_METER
            const spawnPos = new THREE.Vector3().copy(targetPos).addScaledVector(dir, offsetDistance)
            
            // 4. Ground the mascot at the same height as the target (the floor)
            // Adjust the model's Y origin based on its bounding box minimum Y and scale factor to keep the feet on the floor
            spawnPos.y = targetPos.y - (rawMinY * scaleFactor)

            mascotModel.position.copy(spawnPos)

            // 5. Look at the camera, but lock the Y-axis so the mascot stands perfectly upright
            const lookTarget = new THREE.Vector3(cameraPos.x, spawnPos.y, cameraPos.z)
            mascotModel.lookAt(lookTarget)
            
            // 6. Make visible
            mascotModel.visible = true
            console.log(`[AR] Mascot placed in world space at:`, mascotModel.position)

            // Award points and check completions via game state
            const reward = gameState.scanTarget(name)
            if (reward) {
              uiManager.updateHUD(
                reward.totalScore,
                reward.progress,
                gameState.totalTargets,
                reward.nextClue
              )

              // Open success scan modal overlay
              uiManager.showFoundModal(
                reward.title,
                reward.description,
                reward.points,
                () => {
                  // Show the camera shutter button overlay for taking a selfie
                  uiManager.showShutterButton()
                }
              )
            }
          }
        }
      },
      {
        event: 'reality.imageupdated',
        process: (event) => {
          // If we haven't placed the mascot yet, align loading indicator
          const detail = event.detail || event
          const {name, position, rotation} = detail
          if (name === 'image-target-atomic' && !mascotPlaced && placeholderRing) {
            placeholderRing.position.copy(position)
            placeholderRing.quaternion.copy(rotation)
          }
          // NOTE: We DO NOT update mascotModel coordinates here.
          // By leaving it untouched, the mascot remains anchored exactly in SLAM space
          // at its original spawn point, preventing tracking jitters.
        }
      },
      {
        event: 'reality.imagelost',
        process: (event) => {
          const detail = event.detail || event
          const {name} = detail
          if (name === 'image-target-atomic' && !mascotPlaced && placeholderRing) {
            placeholderRing.visible = false
          }
          // NOTE: We DO NOT set mascotModel.visible = false here.
          // The mascot remains visible in the stadium world space even when the decal leaves the frame.
        }
      }
    ]
  }
}
