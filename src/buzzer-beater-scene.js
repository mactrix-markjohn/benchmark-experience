import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js'

const BALL_RADIUS = 0.185 * 0.58 // Match A-Frame sphere radius * visual scale (approx 0.11m)
const GAME_DURATION = 60 // 60 seconds as requested to match classic basketball
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

  const getReadyBallLocalPosition = () => {
    // Lock the ready ball at the bottom center of the phone screen
    const distance = 0.5
    const fovRad = THREE.MathUtils.degToRad(xrCamera?.fov || 60)
    const halfHeight = Math.tan(fovRad * 0.5) * distance
    return new THREE.Vector3(0, -halfHeight * 0.72, -distance)
  }

  const updateReadyBallPose = () => {
    if (!readyBallAnchor) return
    readyBallAnchor.position.copy(getReadyBallLocalPosition())
    readyBallAnchor.rotation.set(-0.15, 0, 0)
    readyBallAnchor.updateMatrixWorld(true)
  }

  const updateHUD = () => {
    const t = document.getElementById('buzzer-timer')
    const s = document.getElementById('buzzer-score')
    if (t) t.innerText = `${timeLeft}s`
    if (s) s.innerText = `${score}`
  }

  const showBuzzerHUD = (show) => {
    const hud = document.getElementById('buzzer-hud')
    if (hud) hud.style.display = show ? 'flex' : 'none'
  }

  const placeObjectInFrontOfCamera = () => {
    if (placed || !xrCamera || !gameRig) return

    // Wait until the SLAM tracking initialized and moves camera from origin
    if (xrCamera.position.lengthSq() < 0.0001) return

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
      updateReadyBallPose()
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
    if (finalScore) finalScore.innerText = score
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

  const shootBall = (swipeStrength = 0.5, horizontalOffset = 0) => {
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

    // Calculate launch trajectory from camera direction
    const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(xrCamera.quaternion)
    
    // Project and normalize for horizontal direction
    const horizontalDir = new THREE.Vector3(cameraDir.x, 0, cameraDir.z).normalize()
    
    // Forward force magnitude
    const launchSpeedForward = THREE.MathUtils.lerp(3.8, 6.2, swipeStrength)
    const velocity = new THREE.Vector3()
      .copy(horizontalDir)
      .multiplyScalar(launchSpeedForward)

    // Upward launch velocity (creates the shooting arc)
    velocity.y = THREE.MathUtils.lerp(3.2, 5.5, swipeStrength)

    // Add lateral deflection from horizontal swipe angle
    const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(xrCamera.quaternion)
    rightDir.y = 0
    rightDir.normalize()
    velocity.addScaledVector(rightDir, horizontalOffset * -3.0)

    shotBall.userData = {
      velocity,
      age: 0,
      scored: false,
      prevPosition: shotBall.position.clone(),
      spinAxis: new THREE.Vector3(1, 0, 0).applyQuaternion(xrCamera.quaternion).normalize(),
    }

    activeBalls.push(shotBall)

    // Animate ready ball scale-pop
    readyBall.scale.set(0, 0, 0)
    readyBall.userData.scaleProgress = 0
    readyBall.userData.animatingScale = true
    readyBall.visible = false
    setTimeout(() => {
      if (gameActive && readyBall) {
        readyBall.visible = true
      }
    }, 150)
  }

  const updateShotPhysics = (delta) => {
    if (!gameRig) return

    activeBalls.forEach((ball, index) => {
      // 1. Gravity acceleration
      ball.userData.velocity.y -= GRAVITY * delta

      // 2. Position updates
      ball.position.addScaledVector(ball.userData.velocity, delta)

      // Apply spin rotation for visual realism
      ball.rotateOnWorldAxis(ball.userData.spinAxis, delta * 12.0)

      // 3. Collision logic in gameRig local coordinate frame
      const localPos = gameRig.worldToLocal(ball.position.clone())
      const localVel = gameRig.worldToLocal(ball.userData.velocity.clone().add(ball.position)).sub(localPos)

      // --- Backboard Collision ---
      // Local coordinate system dimensions of cabinet backboard:
      // backboard Z plane is roughly at -2.7m (scaled by 1.1)
      // boundary X [-0.4, 0.4], Y [2.0, 3.2]
      if (localPos.z <= -2.7 && localPos.z > -2.95) {
        if (localPos.x >= -0.44 && localPos.x <= 0.44 && localPos.y >= 2.0 && localPos.y <= 3.2) {
          // Bounce off backboard: push out of bounds, flip Z velocity
          localPos.z = -2.7 + (-2.7 - localPos.z)
          localVel.z = -localVel.z * 0.45 // restitution
          localVel.x *= 0.8 // friction

          // Re-project back to world coordinates
          ball.position.copy(gameRig.localToWorld(localPos.clone()))
          const newWorldVel = gameRig.localToWorld(localVel.clone().add(localPos)).sub(ball.position)
          ball.userData.velocity.copy(newWorldVel)
        }
      }

      // --- Rim Collision & Scoring ---
      // Hoop local coordinates: center (0, 2.4, -2.5), radius 0.18 (adjusted for 1.1 cabinet scale)
      const rimCenter = new THREE.Vector3(0, 2.4, -2.5)
      const distToRimCenter = Math.hypot(localPos.x - rimCenter.x, localPos.z - rimCenter.z)
      const prevLocalPos = gameRig.worldToLocal(ball.userData.prevPosition.clone())

      // Did it cross the Y = 2.4 plane downwards?
      if (prevLocalPos.y >= 2.4 && localPos.y < 2.4) {
        if (distToRimCenter < 0.17) {
          // Pure Swish / Score!
          if (!ball.userData.scored) {
            ball.userData.scored = true
            score += 1
            updateHUD()
            uiManager.showInstruction('SCORE! 🏀 +1')
            setTimeout(() => {
              if (gameActive) uiManager.showInstruction('Swipe up to shoot!')
            }, 800)
          }
        } else if (distToRimCenter >= 0.17 && distToRimCenter <= 0.22) {
          // Hit the Rim outer metal hoop! Push it away and bounce it up slightly
          const bounceDir = new THREE.Vector3(localPos.x - rimCenter.x, 0, localPos.z - rimCenter.z).normalize()
          localVel.addScaledVector(bounceDir, 2.2) // deflect away
          localVel.y = Math.abs(localVel.y) * 0.35 // bounce up

          ball.position.copy(gameRig.localToWorld(localPos.clone()))
          const newWorldVel = gameRig.localToWorld(localVel.clone().add(localPos)).sub(ball.position)
          ball.userData.velocity.copy(newWorldVel)
        }
      }

      // --- Ground Plane Collision ---
      if (ball.position.y < BALL_RADIUS) {
        ball.position.y = BALL_RADIUS
        ball.userData.velocity.y = -ball.userData.velocity.y * 0.5 // bounce up
        ball.userData.velocity.x *= 0.7 // friction
        ball.userData.velocity.z *= 0.7

        // Stop bouncing once velocity falls below threshold
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
    if (e.cancelable) e.preventDefault()
    if (!gameActive) return
    swipeStart = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    }
  }

  const handleTouchMove = (e) => {
    if (e.cancelable) e.preventDefault()
  }

  const handleTouchEnd = (e) => {
    if (e.cancelable) e.preventDefault()
    if (!swipeStart || !gameActive) return

    const endX = e.changedTouches[0].clientX
    const endY = e.changedTouches[0].clientY
    const dt = (Date.now() - swipeStart.time) / 1000
    const dy = swipeStart.y - endY
    const dx = endX - swipeStart.x
    swipeStart = null

    if (dy > 30 && dt < 1.2) {
      const swipeStrength = THREE.MathUtils.clamp((dy / Math.max(window.innerHeight * 0.28, 1)) * 0.8, 0, 1)
      const horizontalOffset = dx / window.innerWidth
      shootBall(swipeStrength, horizontalOffset)
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
    dracoLoader.setDecoderPath('https://cdn.8thwall.com/web/aframe/draco-decoder/')
    loader.setDRACOLoader(dracoLoader)

    // 1. Load Arcade Cabinet
    loader.load('basketball-assets/models/arcade.glb', (gltf) => {
      const cabinetModel = gltf.scene
      cabinetModel.scale.setScalar(1.1)
      cabinetModel.updateMatrixWorld(true)
      gameRig.add(cabinetModel)
      console.log('[Buzzer] Loaded arcade.glb')
    })

    // 2. Load Hoop visual Mesh
    loader.load('basketball-assets/models/new-hoop.glb', (gltf) => {
      const hoopModel = gltf.scene
      hoopModel.scale.setScalar(1.1)
      hoopModel.updateMatrixWorld(true)
      gameRig.add(hoopModel)
      console.log('[Buzzer] Loaded new-hoop.glb')
    })

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
    loader.load('basketball-assets/models/basketball.glb', (gltf) => {
      ballTemplate = gltf.scene
      ballTemplate.updateMatrixWorld(true)

      const box = new THREE.Box3().setFromObject(ballTemplate)
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      if (maxDim > 0) {
        const scale = (BALL_RADIUS * 2) / maxDim
        ballTemplate.scale.set(scale, scale, scale)
      }
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
      xrCamera.add(readyBallAnchor) // ready ball attached to camera
      updateReadyBallPose()

      console.log('[Buzzer] Loaded basketball.glb')
    })
  }

  return {
    name: 'buzzer-beater-renderer',

    onStart: () => {
      const xrData = XR8.Threejs.xrScene()
      if (!xrData) return
      initScene(xrData)

      const placeNetBtn = document.getElementById('buzzer-place-btn')
      if (placeNetBtn) placeNetBtn.style.display = 'none'

      const canvas = document.getElementById('camerafeed')
      canvas.addEventListener('touchstart', handleTouchStart, {passive: false})
      canvas.addEventListener('touchmove', handleTouchMove, {passive: false})
      canvas.addEventListener('touchend', handleTouchEnd, {passive: false})

      // Show Onboarding overlay card
      const introCard = document.getElementById('buzzer-introCard')
      if (introCard) {
        introCard.style.display = 'flex'
        
        // Prevent touches on overlay from bubbling up to A-Frame/XR8 canvas
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

      uiManager.showInstruction('Initialize tracking and position net...')
    },

    onUpdate: () => {
      const delta = timer.getDelta()

      // Dynamically re-attach ready ball if needed
      if (readyBallAnchor?.parent !== xrCamera && xrCamera) {
        xrCamera.add(readyBallAnchor)
      }

      // Spatially place cabinet in front of user on first successful track frame
      if (!placed) placeObjectInFrontOfCamera()

      // Update ready ball position/spin/scale
      if (readyBallAnchor) updateReadyBallPose()
      if (gameActive && readyBall) {
        if (readyBall.userData.animatingScale) {
          readyBall.userData.scaleProgress += delta / 0.2
          if (readyBall.userData.scaleProgress >= 1) {
            readyBall.userData.scaleProgress = 1
            readyBall.userData.animatingScale = false
          }
          const s = readyBall.userData.scaleProgress
          readyBall.scale.set(s, s, s)
        }
        if (activeBalls.length === 0 && !readyBall.userData.animatingScale) {
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

      const canvas = document.getElementById('camerafeed')
      if (canvas) {
        canvas.removeEventListener('touchstart', handleTouchStart)
        canvas.removeEventListener('touchmove', handleTouchMove)
        canvas.removeEventListener('touchend', handleTouchEnd)
      }

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
