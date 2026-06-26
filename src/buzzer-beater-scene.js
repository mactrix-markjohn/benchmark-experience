import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js'

const BALL_RADIUS = 0.185 // Match A-Frame sphere radius (0.185m)
const GAME_DURATION = 60 // 60 seconds as in classic basketball
const GRAVITY = 9.8

export const initBuzzerBeaterModule = (uiManager) => {
  let xrScene = null
  let xrCamera = null
  let gameRig = null

  let ballTemplate = null
  let readyBall = null
  let readyBallAnchor = null

  const activeBalls = []
  let score = 0
  let timeLeft = GAME_DURATION
  let gameActive = false
  let gameTimer = null
  let swipeStart = null
  let placed = false

  const timer = new THREE.Clock()

  // Ready ball animation properties
  let readyBallProgress = 1.0 // 1.0 means it is fully loaded in ready pose
  const startLocalPos = new THREE.Vector3(0, -1.0, -0.5)
  const endLocalPos = new THREE.Vector3(0, -0.35, -0.5)

  const createVideoTexture = (id) => {
    const video = document.getElementById(id)
    if (!video) return null
    video.muted = true
    video.autoplay = true
    video.loop = true
    video.playsInline = true
    video.play().catch(err => console.log('[Video] Play failed:', err))
    const texture = new THREE.VideoTexture(video)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }

  const updateReadyBallPose = (delta) => {
    if (!readyBallAnchor) return
    
    if (readyBallProgress < 1.0) {
      readyBallProgress += delta / 1.0 // 1.0 second duration
      if (readyBallProgress > 1.0) readyBallProgress = 1.0

      // Easing: easeInOutQuad
      const t = readyBallProgress
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      readyBallAnchor.position.lerpVectors(startLocalPos, endLocalPos, ease)
    } else {
      readyBallAnchor.position.copy(endLocalPos)
    }
    
    readyBallAnchor.rotation.set(-0.15, 0, 0)
    readyBallAnchor.updateMatrixWorld(true)
  }

  const updateHUD = () => {
    const t = document.getElementById('buzzer-timer')
    const s = document.getElementById('buzzer-score')
    if (t) t.innerText = `${timeLeft}`
    if (s) s.innerText = `${score}`
  }

  const showBuzzerHUD = (show) => {
    const hud = document.getElementById('buzzer-hud')
    if (hud) hud.style.display = show ? 'flex' : 'none'
  }

  const placeObjectInFrontOfCamera = () => {
    if (placed || !xrCamera || !gameRig) return

    placed = true

    // Find camera direction projected on floor
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(xrCamera.quaternion)
    forward.y = 0
    forward.normalize()

    // Position cabinet 1.5 meters in front of the camera on the floor (Y = 0)
    const targetPos = new THREE.Vector3()
      .copy(xrCamera.position)
      .addScaledVector(forward, 1.5)
    targetPos.y = 0

    gameRig.position.copy(targetPos)

    // Face the user
    const camPosZeroY = new THREE.Vector3(xrCamera.position.x, 0, xrCamera.position.z)
    gameRig.lookAt(camPosZeroY)
    gameRig.rotateY(Math.PI)
    gameRig.updateMatrixWorld(true)

    console.log('[Buzzer] Cabinet placed at:', gameRig.position)
  }

  const startCountdown = () => {
    const countdownContainer = document.getElementById('buzzer-countdownContainer')
    const countdownText = document.getElementById('buzzer-countdown')
    if (countdownContainer && countdownText) {
      countdownContainer.style.display = 'flex'
      let count = 3
      countdownText.innerText = count

      const interval = setInterval(() => {
        count -= 1
        if (count > 0) {
          countdownText.innerText = count
        } else if (count === 0) {
          countdownText.innerText = 'GO!'
        } else {
          clearInterval(interval)
          countdownContainer.style.display = 'none'
          startGame()
        }
      }, 1000)
    } else {
      startGame()
    }
  }

  const startGame = () => {
    score = 0
    timeLeft = GAME_DURATION
    gameActive = true

    // Clear any leftover balls in flight
    activeBalls.forEach(b => xrScene.remove(b))
    activeBalls.length = 0

    if (readyBallAnchor) {
      readyBallAnchor.visible = true
      if (readyBall) readyBall.visible = true
      readyBallProgress = 1.0 // spawn ready
      readyBallAnchor.position.copy(endLocalPos)
    }

    updateHUD()
    showBuzzerHUD(true)
    uiManager.showInstruction('Swipe up to shoot!')

    if (gameTimer) clearInterval(gameTimer)
    gameTimer = setInterval(() => {
      timeLeft -= 1
      updateHUD()
      if (timeLeft <= 0) endGame()
    }, 1000)
  }

  const endGame = () => {
    gameActive = false
    if (readyBallAnchor) readyBallAnchor.visible = false
    if (gameTimer) {
      clearInterval(gameTimer)
      gameTimer = null
    }
    showBuzzerHUD(false)
    uiManager.showInstruction('')

    const overlay = document.getElementById('buzzer-gameover')
    const finalScore = document.getElementById('buzzer-final-score')
    const gameOverText = document.getElementById('buzzer-gameover-text')
    
    if (finalScore) finalScore.innerText = score
    if (gameOverText) {
      if (score > 5) {
        gameOverText.innerText = "That's quite the achievement!"
      } else {
        gameOverText.innerText = "Better luck next time!"
      }
    }
    
    if (overlay) overlay.classList.add('active')

    const btn = document.getElementById('buzzer-play-again')
    if (btn) {
      const newBtn = btn.cloneNode(true)
      btn.parentNode.replaceChild(newBtn, btn)
      newBtn.addEventListener('click', () => {
        overlay.classList.remove('active')
        startCountdown()
      })
    }
  }

  const shootBall = (forceMagnitude, upwardForce) => {
    if (!gameActive || !ballTemplate || !readyBallAnchor) return

    // Create a new ball in the world
    const shotBall = ballTemplate.clone()
    shotBall.visible = true
    shotBall.traverse((child) => {
      child.frustumCulled = false
    })
    xrScene.add(shotBall)

    // Spawn at ready ball's current world position
    const startWorldPos = new THREE.Vector3()
    readyBall.getWorldPosition(startWorldPos)
    shotBall.position.copy(startWorldPos)

    // Calculate launch trajectory exactly as in A-Frame:
    // Forward vector pointing in camera direction
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(xrCamera.quaternion)
    direction.multiplyScalar(forceMagnitude)
    
    // Add upward force in world coordinates
    direction.y += upwardForce

    // Spin around the camera's local X-axis
    const spinAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(xrCamera.quaternion).normalize()

    shotBall.userData = {
      velocity: direction,
      age: 0,
      scored: false,
      prevPosition: shotBall.position.clone(),
      spinAxis: spinAxis,
    }

    activeBalls.push(shotBall)

    // Trigger ready ball reload animation
    readyBallProgress = 0.0
    readyBallAnchor.position.copy(startLocalPos)
    readyBallAnchor.visible = false
    setTimeout(() => {
      if (gameActive && readyBallAnchor) {
        readyBallAnchor.visible = true
      }
    }, 100)
  }

  const updateShotPhysics = (delta) => {
    if (!gameRig) return

    // Hoop center and backboard parameters scaled by 1.1 cabinet scale
    const hoopCenter = new THREE.Vector3(0, 2.4 * 1.1, -2.5 * 1.1) // (0, 2.64, -2.75)
    const rimRadius = 0.18 * 1.1 // 0.198m

    activeBalls.forEach((ball, index) => {
      // 1. Gravity acceleration
      ball.userData.velocity.y -= GRAVITY * delta

      // 2. Position updates
      ball.position.addScaledVector(ball.userData.velocity, delta)

      // Apply backspin rotation
      ball.rotateOnWorldAxis(ball.userData.spinAxis, delta * 12.0)

      // 3. Collision logic in gameRig local coordinate frame
      const localPos = gameRig.worldToLocal(ball.position.clone())
      const localVel = gameRig.worldToLocal(ball.userData.velocity.clone().add(ball.position)).sub(localPos)

      // --- Backboard Collision ---
      // Backboard plane is at local Z = -2.89 (scaled Z)
      // Boundaries: X [-0.48, 0.48], Y [2.2, 3.5]
      // Ball center collides when Z <= -2.89 + BALL_RADIUS = -2.705 and moving in -Z
      if (localPos.z <= -2.705 && localPos.z > -2.95 && localVel.z < 0) {
        if (localPos.x >= -0.48 && localPos.x <= 0.48 && localPos.y >= 2.2 && localPos.y <= 3.5) {
          localPos.z = -2.705
          localVel.z = -localVel.z * 0.45 // restitution
          localVel.x *= 0.8 // friction
          localVel.y *= 0.8

          // Re-project back to world coordinates
          ball.position.copy(gameRig.localToWorld(localPos.clone()))
          const newWorldVel = gameRig.localToWorld(localVel.clone().add(localPos)).sub(ball.position)
          ball.userData.velocity.copy(newWorldVel)
        }
      }

      // --- Rim Collision (Torus-like ring bounce) ---
      // Nearest point on the rim wire circle
      const dx = localPos.x - hoopCenter.x
      const dz = localPos.z - hoopCenter.z
      const distToHoopCenterXZ = Math.hypot(dx, dz)
      
      if (distToHoopCenterXZ > 0) {
        // Nearest point on the rim wire circle
        const rx = hoopCenter.x + (dx / distToHoopCenterXZ) * rimRadius
        const ry = hoopCenter.y
        const rz = hoopCenter.z + (dz / distToHoopCenterXZ) * rimRadius
        
        const distToRimWire = Math.hypot(localPos.x - rx, localPos.y - ry, localPos.z - rz)
        
        // If ball intersects the rim metal wire
        if (distToRimWire < BALL_RADIUS) {
          // Normal vector pointing from rim wire center to ball center
          const normal = new THREE.Vector3(localPos.x - rx, localPos.y - ry, localPos.z - rz).normalize()
          
          // Push ball out of collision
          localPos.copy(normal).multiplyScalar(BALL_RADIUS).add(new THREE.Vector3(rx, ry, rz))
          
          // Reflect velocity along normal
          const dot = localVel.dot(normal)
          if (dot < 0) {
            localVel.addScaledVector(normal, -dot * (1 + 0.5)) // 0.5 restitution
          }
          
          // Re-project back to world
          ball.position.copy(gameRig.localToWorld(localPos.clone()))
          const newWorldVel = gameRig.localToWorld(localVel.clone().add(localPos)).sub(ball.position)
          ball.userData.velocity.copy(newWorldVel)
        }
      }

      // --- Scoring Check ---
      // Simple 3D distance check to hoop center
      const worldHoopCenter = gameRig.localToWorld(hoopCenter.clone())
      const distToGoal = ball.position.distanceTo(worldHoopCenter)
      
      if (distToGoal <= 0.2 && !ball.userData.scored) {
        ball.userData.scored = true
        score += 1
        updateHUD()
        uiManager.showInstruction('SCORE! 🏀 +1')
        setTimeout(() => {
          if (gameActive) uiManager.showInstruction('Swipe up to shoot!')
        }, 800)
      }

      // --- Ground Plane Collision ---
      if (ball.position.y < BALL_RADIUS) {
        ball.position.y = BALL_RADIUS
        ball.userData.velocity.y = -ball.userData.velocity.y * 0.55 // bounce up
        ball.userData.velocity.x *= 0.7 // friction
        ball.userData.velocity.z *= 0.7

        if (Math.abs(ball.userData.velocity.y) < 0.5) {
          ball.userData.velocity.set(0, 0, 0)
        }
      }

      // Record current position for next frame comparison
      ball.userData.prevPosition.copy(ball.position)

      // 4. Age timeout cleanup
      ball.userData.age += delta
      if (ball.userData.age > 4.5) {
        xrScene.remove(ball)
        activeBalls.splice(index, 1)
      }
    })
  }

  const handleTouchStart = (e) => {
    // If the touch is on any UI card/button, let it handle the event
    if (
      e.target.tagName === 'BUTTON' || 
      e.target.closest('#buzzer-introCard') || 
      e.target.closest('#buzzer-gameover') || 
      e.target.closest('#back-btn')
    ) {
      return
    }
    
    if (!gameActive) return
    swipeStart = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    }
  }

  const handleTouchMove = (e) => {
    // Let default scrolls happen unless swipe starts
  }

  const handleTouchEnd = (e) => {
    if (!swipeStart || !gameActive) return

    const endX = e.changedTouches[0].clientX
    const endY = e.changedTouches[0].clientY
    const duration = Date.now() - swipeStart.time
    const dy = swipeStart.y - endY
    const dx = endX - swipeStart.x
    swipeStart = null

    // Require a minimum swipe distance of 30 pixels upwards
    if (dy > 30 && duration > 0) {
      const swipeDistance = Math.sqrt(dx * dx + dy * dy)
      
      // Exact math from swipe-to-shoot.js:
      const scaledSwipeDistance = swipeDistance * 0.35
      const swipeStrength = Math.min(scaledSwipeDistance / duration, 1)

      let forceMagnitude = swipeStrength * 5
      forceMagnitude = Math.min(forceMagnitude, 5)

      // Upward force max 6.5
      const upwardForce = Math.min(scaledSwipeDistance * 0.1, 6.5)

      shootBall(forceMagnitude, upwardForce)
    }
  }

  const initScene = ({scene, camera, renderer}) => {
    renderer.preserveDrawingBuffer = true
    xrScene = scene
    xrCamera = camera
    score = 0
    timeLeft = GAME_DURATION
    gameActive = false
    swipeStart = null
    placed = false

    // Set lighting setup matching A-Frame classic setup
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.3)
    dirLight.position.set(4, 15, 6)
    scene.add(dirLight)
    scene.add(new THREE.AmbientLight(0xffffff, 0.75))

    gameRig = new THREE.Group()
    scene.add(gameRig) // cabinet placed in the world coordinates

    const loader = new GLTFLoader()
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('./draco/')
    loader.setDRACOLoader(dracoLoader)

    // 1. Load Arcade Cabinet
    loader.load('basketball-assets/models/arcade.glb', 
      (gltf) => {
        const cabinetModel = gltf.scene
        cabinetModel.scale.setScalar(1.1)
        cabinetModel.updateMatrixWorld(true)
        gameRig.add(cabinetModel)
        console.log('[Buzzer] Loaded arcade.glb')
      },
      undefined,
      (err) => {
        console.error('[Buzzer] Failed to load arcade.glb:', err)
        alert('Error loading arcade.glb:\n' + (err.message || err))
      }
    )

    // 2. Load Hoop visual Mesh
    loader.load('basketball-assets/models/new-hoop.glb', 
      (gltf) => {
        const hoopModel = gltf.scene
        hoopModel.scale.setScalar(1.1)
        hoopModel.updateMatrixWorld(true)
        gameRig.add(hoopModel)
        console.log('[Buzzer] Loaded new-hoop.glb')
      },
      undefined,
      (err) => {
        console.error('[Buzzer] Failed to load new-hoop.glb:', err)
        alert('Error loading new-hoop.glb:\n' + (err.message || err))
      }
    )

    // 3. Load video texture meshes and add to gameRig
    const playTex = createVideoTexture('play-video')
    if (playTex) {
      const playGeo = new THREE.PlaneGeometry(1.158 * 1.1, 0.695 * 1.1)
      const playMat = new THREE.MeshBasicMaterial({
        map: playTex,
        side: THREE.DoubleSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
      })
      const playMesh = new THREE.Mesh(playGeo, playMat)
      playMesh.position.set(0, 3.3, -2.89)
      gameRig.add(playMesh)
    }

    const portalTex = createVideoTexture('portal-video')
    if (portalTex) {
      const portalGeo = new THREE.PlaneGeometry(2.495 * 1.1, 1.326 * 1.1)
      const portalMat = new THREE.MeshBasicMaterial({
        map: portalTex,
        side: THREE.DoubleSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
      })
      const portalMesh = new THREE.Mesh(portalGeo, portalMat)
      portalMesh.position.set(0, 1.39, -1.83)
      portalMesh.rotation.set(
        THREE.MathUtils.degToRad(-67.64),
        0,
        THREE.MathUtils.degToRad(-90),
        'YXZ'
      )
      gameRig.add(portalMesh)
    }

    const neonTex = createVideoTexture('neon-video')
    if (neonTex) {
      const neonGeo = new THREE.CircleGeometry(0.5 * 1.1, 32)
      const neonMat = new THREE.MeshBasicMaterial({
        map: neonTex,
        side: THREE.DoubleSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
      })

      const neon1 = new THREE.Mesh(neonGeo, neonMat)
      neon1.rotation.x = -Math.PI / 2
      neon1.scale.set(0.324, 0.289, 1)
      neon1.position.set(0, 1.08, 0.277)
      gameRig.add(neon1)

      const neon2 = neon1.clone()
      neon2.position.set(0, 1.1, 0.277)
      gameRig.add(neon2)

      const neon3 = neon1.clone()
      neon3.position.set(0, 1.11, 0.277)
      gameRig.add(neon3)
    }

    // 4. Load Basketball Model
    loader.load('basketball-assets/models/basketball.glb', 
      (gltf) => {
        ballTemplate = gltf.scene
        ballTemplate.updateMatrixWorld(true)
        ballTemplate.scale.set(0.58, 0.58, 0.58)
        ballTemplate.traverse((child) => {
          child.frustumCulled = false
        })

        readyBallAnchor = new THREE.Group()
        readyBall = ballTemplate.clone()
        readyBall.visible = true
        readyBall.traverse((child) => {
          child.frustumCulled = false
        })
        readyBallAnchor.add(readyBall)
        
        // Initial pose matches standard A-Frame creation: starts at local (0, -1, -0.5)
        readyBallAnchor.position.copy(startLocalPos)
        readyBallProgress = 0.0 // trigger slide-in animation on start
        
        xrCamera.add(readyBallAnchor) // ready ball attached to camera
        readyBallAnchor.updateMatrixWorld(true)

        console.log('[Buzzer] Loaded basketball.glb')
      },
      undefined,
      (err) => {
        console.error('[Buzzer] Failed to load basketball.glb:', err)
        alert('Error loading basketball.glb:\n' + (err.message || err))
      }
    )
  }

  return {
    name: 'buzzer-beater-renderer',

    onStart: () => {
      const xrData = XR8.Threejs.xrScene()
      if (!xrData) return
      initScene(xrData)

      const placeNetBtn = document.getElementById('buzzer-place-btn')
      if (placeNetBtn) placeNetBtn.style.display = 'none'

      // Listen on window rather than canvas for swipe event reliability
      window.addEventListener('touchstart', handleTouchStart, {passive: true})
      window.addEventListener('touchmove', handleTouchMove, {passive: true})
      window.addEventListener('touchend', handleTouchEnd, {passive: true})

      // Show Onboarding overlay card
      const introCard = document.getElementById('buzzer-introCard')
      if (introCard) {
        introCard.style.display = 'flex'
        
        // Prevent touches on overlay from bubbling up to canvas swipe detections
        const preventPropagation = (e) => e.stopPropagation()
        const overlays = [introCard, document.getElementById('buzzer-gameover'), document.getElementById('buzzer-countdownContainer')]
        overlays.forEach(el => {
          if (el) {
            el.addEventListener('touchstart', preventPropagation, {passive: true})
            el.addEventListener('touchmove', preventPropagation, {passive: true})
            el.addEventListener('touchend', preventPropagation, {passive: true})
            el.addEventListener('mousedown', preventPropagation)
            el.addEventListener('mouseup', preventPropagation)
          }
        })

        const beginBtn = document.getElementById('buzzer-begin-btn')
        if (beginBtn) {
          const handleBegin = () => {
            beginBtn.removeEventListener('click', handleBegin)
            introCard.style.display = 'none'
            startCountdown()
          }
          beginBtn.addEventListener('click', handleBegin)
        }
      } else {
        startCountdown()
      }

      uiManager.showInstruction('Initialize tracking...')
    },

    onUpdate: () => {
      const delta = timer.getDelta()

      // Dynamically re-attach ready ball if needed
      if (readyBallAnchor?.parent !== xrCamera && xrCamera) {
        xrCamera.add(readyBallAnchor)
      }

      // Spatially place cabinet in front of user immediately once camera tracking starts
      if (!placed && xrCamera) {
        placeObjectInFrontOfCamera()
      }

      // Update ready ball position/spin/scale
      if (readyBallAnchor) {
        updateReadyBallPose(delta)
      }
      
      if (gameActive && readyBall) {
        // Slow spin for the ready ball if no active shots in flight, to match original game feel
        if (activeBalls.length === 0 && readyBallProgress >= 1.0) {
          readyBall.rotation.y += delta * 1.2
        }
      }

      // Update physics simulations
      updateShotPhysics(delta)
    },

    onStop: () => {
      if (gameTimer) {
        clearInterval(gameTimer)
        gameTimer = null
      }

      gameActive = false
      showBuzzerHUD(false)

      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)

      // Clear world objects
      activeBalls.forEach(b => {
        if (b.parent) b.parent.remove(b)
      })
      activeBalls.length = 0

      if (gameRig?.parent) gameRig.parent.remove(gameRig)
      gameRig = null

      if (readyBallAnchor?.parent) readyBallAnchor.parent.remove(readyBallAnchor)
      readyBallAnchor = null
      readyBall = null
    },
  }
}
