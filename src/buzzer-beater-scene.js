import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'

const BALL_RADIUS = 0.12 // 12cm radius
const GAME_DURATION = 20

// Hoop oscillation
const HOOP_SLIDE_RANGE = 0.7   // metres to each side
const HOOP_SLIDE_SPEED = 0.8   // metres per second

// Scripted ball arc (no physics)
const SHOOT_DURATION = 0.9     // seconds for the ball to travel the arc
const ARC_HEIGHT = 1.3         // peak height of the arc above the straight line

export const initBuzzerBeaterModule = (uiManager) => {
  let xrScene = null
  let xrCamera = null
  let groundPlane = null
  let reticle = null

  let hoopModel = null
  let hoopGroup = null
  let hoopPlaced = false
  let hoopAnchorPos = new THREE.Vector3()
  let hoopSlideOffset = 0
  let hoopSlideDir = 1

  // Rim geometry (local to hoopGroup)
  let rimLocalCenter = new THREE.Vector3()
  let rimRadius = 0
  let hoopScaleFactor = 1

  // Ball
  let ballTemplate = null
  let readyBall = null
  let readyBallAnchor = null
  let ballInFlight = false
  let activeFlight = null

  let score = 0
  let timeLeft = GAME_DURATION
  let gameActive = false
  let gameTimer = null
  let swipeStart = null

  const timer = new THREE.Clock()
  const raycaster = new THREE.Raycaster()
  const screenCenter = new THREE.Vector2(0, 0)

  const initScene = ({scene, camera, renderer}) => {
    renderer.preserveDrawingBuffer = true
    xrScene = scene
    xrCamera = camera
    hoopPlaced = false
    score = 0
    timeLeft = GAME_DURATION
    gameActive = false
    hoopSlideOffset = 0
    hoopSlideDir = 1
    swipeStart = null
    activeFlight = null
    ballInFlight = false

    scene.add(new THREE.DirectionalLight(0xffffff, 1.5).translateX(5).translateY(10).translateZ(7))
    scene.add(new THREE.AmbientLight(0xffffff, 0.7))

    // Reticle
    const ringGeo = new THREE.RingGeometry(0.15, 0.2, 32)
    ringGeo.rotateX(-Math.PI / 2)
    reticle = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xff6600, side: THREE.DoubleSide, transparent: true, opacity: 0.8
    }))
    reticle.visible = false
    scene.add(reticle)

    // Ground for placement + shadow
    const groundGeo = new THREE.PlaneGeometry(100, 100)
    groundGeo.rotateX(-Math.PI / 2)
    groundPlane = new THREE.Mesh(groundGeo, new THREE.ShadowMaterial({opacity: 0.5}))
    groundPlane.receiveShadow = true
    scene.add(groundPlane)

    setTimeout(() => {
      if (xrCamera && groundPlane) {
        const cp = new THREE.Vector3()
        xrCamera.getWorldPosition(cp)
        groundPlane.position.y = cp.y - 1.5
      }
    }, 500)

    const loader = new GLTFLoader()

    loader.load('assets/basketballhoop.glb', (gltf) => {
      hoopModel = gltf.scene
      hoopModel.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(hoopModel)
      const size = box.getSize(new THREE.Vector3())

      hoopScaleFactor = 1.5 / size.y
      hoopModel.scale.set(hoopScaleFactor, hoopScaleFactor, hoopScaleFactor)

      hoopModel.updateMatrixWorld(true)
      const sBox = new THREE.Box3().setFromObject(hoopModel)
      const sSize = sBox.getSize(new THREE.Vector3())

      // Rim: ~82% up the hoop, opening radius ~18% of width
      rimLocalCenter.set(0, sBox.min.y + sSize.y * 0.82, sSize.z * 0.15)
      rimRadius = sSize.x * 0.18

      hoopGroup = new THREE.Group()
      hoopGroup.add(hoopModel)
      hoopGroup.visible = false
      scene.add(hoopGroup)
    })

    loader.load('assets/basketballwhite.glb', (gltf) => {
      ballTemplate = gltf.scene
      ballTemplate.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(ballTemplate)
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      if (maxDim > 0) {
        const scale = (BALL_RADIUS * 2) / maxDim
        ballTemplate.scale.set(scale, scale, scale)
      }
      ballTemplate.traverse((c) => { c.frustumCulled = false })

      readyBallAnchor = new THREE.Group()
      readyBallAnchor.visible = false
      readyBall = ballTemplate.clone()
      readyBall.visible = true
      readyBall.traverse((c) => { c.frustumCulled = false })
      readyBallAnchor.add(readyBall)
      if (xrCamera) {
        xrCamera.add(readyBallAnchor)
        updateReadyBallPose()
      }
    })
  }

  // Ball sits low at the centre-bottom of the screen
  const getReadyBallLocalPosition = () => {
    const distance = 0.9
    const fovRad = THREE.MathUtils.degToRad(xrCamera?.fov || 60)
    const halfHeight = Math.tan(fovRad * 0.5) * distance
    // 0 = centre, 1 = bottom edge. 0.88 sits it near the bottom.
    const y = -halfHeight * 0.88
    return new THREE.Vector3(0, y, -distance)
  }

  const updateReadyBallPose = () => {
    if (!xrCamera || !readyBallAnchor) return
    readyBallAnchor.position.copy(getReadyBallLocalPosition())
    readyBallAnchor.rotation.set(-0.2, 0, 0)
    readyBallAnchor.updateMatrixWorld(true)
  }

  const placeHoop = (point) => {
    if (!hoopGroup || !hoopModel) return

    hoopGroup.position.copy(point)
    hoopModel.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(hoopModel)
    hoopGroup.position.y -= (box.min.y - point.y) // sit base on the floor

    hoopAnchorPos.copy(hoopGroup.position)

    // Face the camera (Y only)
    const cp = new THREE.Vector3()
    xrCamera.getWorldPosition(cp)
    hoopGroup.lookAt(new THREE.Vector3(cp.x, hoopGroup.position.y, cp.z))

    hoopGroup.visible = true
    hoopModel.visible = true
    reticle.visible = false
    hoopPlaced = true
    hoopSlideOffset = 0
    hoopSlideDir = 1

    startGame()
  }

  const startGame = () => {
    score = 0
    timeLeft = GAME_DURATION
    gameActive = true
    ballInFlight = false
    activeFlight = null
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
      timeLeft--
      updateHUD()
      if (timeLeft <= 0) endGame()
    }, 1000)
  }

  const endGame = () => {
    gameActive = false
    if (readyBallAnchor) readyBallAnchor.visible = false
    if (gameTimer) { clearInterval(gameTimer); gameTimer = null }
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
        if (activeFlight) { xrScene.remove(activeFlight.mesh); activeFlight = null }
        startGame()
      })
    }
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

  const getRimWorldPos = () => {
    hoopGroup.updateMatrixWorld(true)
    return hoopGroup.localToWorld(rimLocalCenter.clone())
  }

  // Continuously oscillate the hoop left <-> right
  const updateHoopSlide = (delta) => {
    if (!hoopGroup || !hoopPlaced) return

    hoopSlideOffset += hoopSlideDir * HOOP_SLIDE_SPEED * delta
    if (hoopSlideOffset > HOOP_SLIDE_RANGE) {
      hoopSlideOffset = HOOP_SLIDE_RANGE
      hoopSlideDir = -1
    } else if (hoopSlideOffset < -HOOP_SLIDE_RANGE) {
      hoopSlideOffset = -HOOP_SLIDE_RANGE
      hoopSlideDir = 1
    }

    // Slide along the hoop's local right axis (left-right from the user's view)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(hoopGroup.quaternion)
    hoopGroup.position.copy(hoopAnchorPos).addScaledVector(right, hoopSlideOffset)
  }

  // Launch the ball along a scripted arc toward where the camera is facing
  const shootBall = () => {
    if (!gameActive || !ballTemplate || !xrCamera || ballInFlight) return

    const ball = ballTemplate.clone()
    ball.visible = true
    xrScene.add(ball)

    const start = new THREE.Vector3()
    if (readyBallAnchor) readyBallAnchor.getWorldPosition(start)
    else xrCamera.getWorldPosition(start)
    ball.position.copy(start)

    ballInFlight = true
    if (readyBall) readyBall.visible = false

    // Camera heading on the horizontal plane (aim by pointing the phone)
    const camPos = new THREE.Vector3()
    const camDir = new THREE.Vector3()
    xrCamera.getWorldPosition(camPos)
    xrCamera.getWorldDirection(camDir)
    const heading = new THREE.Vector3(camDir.x, 0, camDir.z)
    if (heading.lengthSq() < 1e-6) heading.set(0, 0, -1)
    heading.normalize()

    // Travel to the hoop's depth so a well-aimed shot reaches the rim
    let dist = 3.0
    if (hoopPlaced) {
      dist = Math.hypot(hoopAnchorPos.x - camPos.x, hoopAnchorPos.z - camPos.z)
    }
    dist = THREE.MathUtils.clamp(dist, 1.2, 6.0)

    const floorY = groundPlane ? groundPlane.position.y : (start.y - 1.3)
    const end = new THREE.Vector3(
      camPos.x + heading.x * dist,
      floorY + BALL_RADIUS,
      camPos.z + heading.z * dist
    )

    activeFlight = {
      mesh: ball,
      t: 0,
      start: start.clone(),
      end,
      scored: false
    }
  }

  // Advance the scripted arc each frame
  const updateFlight = (delta) => {
    if (!activeFlight) return
    const f = activeFlight
    f.t += delta / SHOOT_DURATION
    const t = Math.min(f.t, 1)

    // Horizontal: straight line. Vertical: parabolic arch.
    const x = THREE.MathUtils.lerp(f.start.x, f.end.x, t)
    const z = THREE.MathUtils.lerp(f.start.z, f.end.z, t)
    const linearY = THREE.MathUtils.lerp(f.start.y, f.end.y, t)
    const arch = 4 * ARC_HEIGHT * t * (1 - t)
    f.mesh.position.set(x, linearY + arch, z)

    // Spin for realism
    f.mesh.rotation.x += delta * 6
    f.mesh.rotation.z += delta * 3

    // Scoring: during the descent, is the ball aligned with the (moving) rim?
    if (!f.scored && hoopGroup && t > 0.4) {
      const rim = getRimWorldPos()
      const hDist = Math.hypot(f.mesh.position.x - rim.x, f.mesh.position.z - rim.z)
      const nearRimHeight = Math.abs(f.mesh.position.y - rim.y) < BALL_RADIUS * 2.5
      if (hDist < rimRadius * 1.2 && nearRimHeight) {
        f.scored = true
        score++
        updateHUD()
        uiManager.showInstruction('SCORE! 🏀 +1')
        setTimeout(() => { if (gameActive) uiManager.showInstruction('Swipe up to shoot!') }, 600)
      }
    }

    // Flight finished -> respawn the ready ball
    if (t >= 1) {
      xrScene.remove(f.mesh)
      activeFlight = null
      respawnReadyBall()
    }
  }

  const respawnReadyBall = () => {
    ballInFlight = false
    if (readyBall) {
      readyBall.visible = true
      readyBall.rotation.set(0, 0, 0)
    }
    if (readyBallAnchor) updateReadyBallPose()
  }

  // Touch handlers
  const handleTouchStart = (e) => {
    if (e.cancelable) e.preventDefault()
    if (!hoopPlaced) {
      if (!xrCamera || !groundPlane) return
      const t = e.touches[0]
      const ndc = new THREE.Vector2(
        (t.clientX / window.innerWidth) * 2 - 1,
        -(t.clientY / window.innerHeight) * 2 + 1
      )
      raycaster.setFromCamera(ndc, xrCamera)
      const hits = raycaster.intersectObject(groundPlane)
      if (hits.length > 0) placeHoop(hits[0].point)
      return
    }
    if (!gameActive) return
    swipeStart = {x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now()}
  }

  const handleTouchMove = (e) => {
    if (e.cancelable) e.preventDefault()
  }

  const handleTouchEnd = (e) => {
    if (e.cancelable) e.preventDefault()
    if (!swipeStart || !gameActive) return
    const endY = e.changedTouches[0].clientY
    const dt = (Date.now() - swipeStart.time) / 1000
    const dy = swipeStart.y - endY
    swipeStart = null

    // Any deliberate upward swipe shoots the ball
    if (dy > 30 && dt < 1.2) {
      shootBall()
    }
  }

  return {
    name: 'buzzer-beater-renderer',

    onStart: () => {
      const xrData = XR8.Threejs.xrScene()
      if (!xrData) return
      initScene(xrData)

      const canvas = document.getElementById('camerafeed')
      canvas.addEventListener('touchstart', handleTouchStart, {passive: false})
      canvas.addEventListener('touchmove', handleTouchMove, {passive: false})
      canvas.addEventListener('touchend', handleTouchEnd, {passive: false})

      uiManager.showInstruction('Tap the floor to place the hoop!')
    },

    onUpdate: () => {
      const delta = timer.getDelta()

      // Placement reticle
      if (!hoopPlaced && reticle && xrCamera && groundPlane) {
        raycaster.setFromCamera(screenCenter, xrCamera)
        const hits = raycaster.intersectObject(groundPlane)
        if (hits.length > 0) {
          reticle.position.copy(hits[0].point)
          reticle.position.y += 0.02
          reticle.visible = true
        } else {
          reticle.visible = false
        }
        reticle.rotation.y += 0.015
      }

      // Keep the ready ball anchored to the camera
      if (readyBallAnchor && readyBallAnchor.parent !== xrCamera && xrCamera) {
        xrCamera.add(readyBallAnchor)
      }
      if (gameActive && readyBallAnchor) updateReadyBallPose()
      if (gameActive && readyBall && !ballInFlight) readyBall.rotation.y += delta * 1.2

      updateHoopSlide(delta)
      updateFlight(delta)
    },

    onStop: () => {
      if (gameTimer) { clearInterval(gameTimer); gameTimer = null }
      gameActive = false
      showBuzzerHUD(false)
      const canvas = document.getElementById('camerafeed')
      if (canvas) {
        canvas.removeEventListener('touchstart', handleTouchStart)
        canvas.removeEventListener('touchmove', handleTouchMove)
        canvas.removeEventListener('touchend', handleTouchEnd)
      }
      if (activeFlight && xrScene) { xrScene.remove(activeFlight.mesh); activeFlight = null }
      if (xrScene) {
        if (hoopGroup) xrScene.remove(hoopGroup)
        if (groundPlane) xrScene.remove(groundPlane)
        if (reticle) xrScene.remove(reticle)
        if (readyBallAnchor) {
          if (readyBallAnchor.parent) readyBallAnchor.parent.remove(readyBallAnchor)
          else xrScene.remove(readyBallAnchor)
        }
      }
    }
  }
}
