import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'

const UNITS_PER_METER = 1.0
const GRAVITY = -15.5
const BALL_RADIUS = 0.12 // 12cm radius
const GAME_DURATION = 20
const SHOOT_POWER = 3.6
const MAX_PHYSICS_STEP = 1 / 120

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

  // Collision: rim is a circle at a fixed height on the hoop
  let rimLocalCenter = new THREE.Vector3()
  let rimRadius = 0
  let backboardLocalBox = null
  let hoopScaleFactor = 1

  const activeBalls = []
  let ballTemplate = null

  let score = 0
  let timeLeft = GAME_DURATION
  let gameActive = false
  let gameTimer = null
  let swipeStart = null
  let readyBall = null
  let readyBallAnchor = null

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
    activeBalls.length = 0
    hoopSlideOffset = 0
    swipeStart = null

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

    // Ground (used for placing the hoop and bouncing)
    const groundGeo = new THREE.PlaneGeometry(100, 100)
    groundGeo.rotateX(-Math.PI / 2)
    groundPlane = new THREE.Mesh(groundGeo, new THREE.ShadowMaterial({ opacity: 0.5 }))
    groundPlane.receiveShadow = true
    scene.add(groundPlane)

    // Position ground plane 1.5 meters below the camera (average chest/phone height)
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

      // Scale hoop to ~1.5m tall for AR
      hoopScaleFactor = 1.5 / size.y
      hoopModel.scale.set(hoopScaleFactor, hoopScaleFactor, hoopScaleFactor)

      hoopModel.updateMatrixWorld(true)
      const sBox = new THREE.Box3().setFromObject(hoopModel)
      const sSize = sBox.getSize(new THREE.Vector3())

      // Rim: roughly 85% up the hoop, the opening radius ~20% of width
      rimLocalCenter.set(0, sBox.min.y + sSize.y * 0.82, sSize.z * 0.15)
      rimRadius = sSize.x * 0.18

      // Backboard: top portion of the hoop
      backboardLocalBox = new THREE.Box3(
        new THREE.Vector3(sBox.min.x, sBox.min.y + sSize.y * 0.7, sBox.min.z),
        new THREE.Vector3(sBox.max.x, sBox.max.y, sBox.min.z + sSize.z * 0.2)
      )

      hoopGroup = new THREE.Group()
      hoopGroup.add(hoopModel)
      hoopGroup.visible = false
      scene.add(hoopGroup)
    })

    // Ball - load the user's white basketball model
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
      
      ballTemplate.traverse((child) => {
        child.frustumCulled = false
      })

      readyBallAnchor = new THREE.Group()
      readyBallAnchor.visible = false
      readyBall = ballTemplate.clone()
      readyBall.visible = true
      readyBall.traverse((child) => {
        child.frustumCulled = false
      })
      readyBallAnchor.add(readyBall)
      if (xrCamera) {
        xrCamera.add(readyBallAnchor)
        updateReadyBallPose()
      }
    })
  }

  const getReadyBallLocalPosition = () => {
    // Fixed position in camera-local space: centered, low on the screen,
    // a short distance in front of the camera.
    return new THREE.Vector3(0, -0.42, -0.62)
  }

  const updateReadyBallPose = () => {
    if (!xrCamera || !readyBallAnchor) return
    const localPos = getReadyBallLocalPosition()
    readyBallAnchor.position.copy(localPos)
    readyBallAnchor.rotation.set(-0.28, 0, 0)
    readyBallAnchor.updateMatrixWorld(true)
  }

  const placeHoop = (point) => {
    if (!hoopGroup || !hoopModel) return

    hoopGroup.position.copy(point)
    hoopModel.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(hoopModel)
    // Align bottom of the hoop to the hit point
    hoopGroup.position.y -= (box.min.y - point.y)

    hoopAnchorPos.copy(hoopGroup.position)

    // Face camera (only Y axis)
    const cp = new THREE.Vector3()
    xrCamera.getWorldPosition(cp)
    hoopGroup.lookAt(new THREE.Vector3(cp.x, hoopGroup.position.y, cp.z))

    hoopGroup.visible = true
    hoopModel.visible = true
    reticle.visible = false
    hoopPlaced = true
    hoopSlideOffset = 0

    startGame()
  }

  const startGame = () => {
    score = 0
    timeLeft = GAME_DURATION
    gameActive = true
    if (readyBallAnchor) {
      readyBallAnchor.visible = true
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
        activeBalls.forEach(b => xrScene.remove(b.mesh))
        activeBalls.length = 0
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

  // Shoot a ball with a consistent lob arc.
  // power: 0..1 (swipe strength controls distance)
  // aim: -1..1 (horizontal swipe controls left/right adjustment)
  const shootBall = (power, aim) => {
    if (!gameActive || !ballTemplate || !xrCamera) return

    const ball = ballTemplate.clone()
    ball.visible = true
    xrScene.add(ball)

    // Start the ball exactly where the on-screen ready ball sits
    const startPos = new THREE.Vector3()
    if (readyBallAnchor) {
      readyBallAnchor.getWorldPosition(startPos)
    } else {
      xrCamera.getWorldPosition(startPos)
    }
    ball.position.copy(startPos)

    // Camera heading projected onto the horizontal plane (aim by turning phone)
    const camDir = new THREE.Vector3()
    xrCamera.getWorldDirection(camDir)
    const heading = new THREE.Vector3(camDir.x, 0, camDir.z)
    if (heading.lengthSq() < 1e-6) heading.set(0, 0, -1)
    heading.normalize()

    // Right vector in the horizontal plane (for left/right aim)
    const right = new THREE.Vector3(-heading.z, 0, heading.x)

    // Fixed launch angle gives a predictable basketball arc every time.
    const launchAngle = THREE.MathUtils.degToRad(52)

    // Power maps to total launch speed. Tuned so ~0.5 reaches a hoop
    // placed 2-3m away; the player learns the feel quickly.
    const MIN_SPEED = 5.0
    const MAX_SPEED = 9.0
    const speed = THREE.MathUtils.lerp(MIN_SPEED, MAX_SPEED, THREE.MathUtils.clamp(power, 0, 1))

    const hSpeed = speed * Math.cos(launchAngle)
    const vSpeed = speed * Math.sin(launchAngle)

    const velocity = new THREE.Vector3()
    velocity.addScaledVector(heading, hSpeed)              // forward
    velocity.addScaledVector(right, aim * hSpeed * 0.35)   // left/right aim
    velocity.y = vSpeed                                    // upward arc

    activeBalls.push({
      mesh: ball,
      velocity: velocity,
      age: 0,
      scored: false,
      bounces: 0,
      lastPos: ball.position.clone()
    })
  }

  const getRimWorldPos = () => {
    hoopGroup.updateMatrixWorld(true)
    const p = rimLocalCenter.clone()
    hoopGroup.localToWorld(p)
    return p
  }

  const checkScore = (ball) => {
    if (ball.scored || !hoopGroup) return
    const rimWorld = getRimWorldPos()
    const bp = ball.mesh.position

    const dx = bp.x - rimWorld.x
    const dz = bp.z - rimWorld.z
    const hDist = Math.sqrt(dx * dx + dz * dz)

    // Ball passes through rim (within radius, near rim height, moving down)
    if (hDist < rimRadius * 1.5 &&
        Math.abs(bp.y - rimWorld.y) < BALL_RADIUS * 3 &&
        ball.velocity.y < 0) {
      ball.scored = true
      score++
      updateHUD()
      uiManager.showInstruction('SCORE! +1')
      setTimeout(() => { if (gameActive) uiManager.showInstruction('Swipe up to shoot!') }, 600)
    }
  }

  const checkBackboard = (ball) => {
    if (!backboardLocalBox || !hoopGroup) return
    hoopGroup.updateMatrixWorld(true)
    const worldBox = backboardLocalBox.clone().applyMatrix4(hoopGroup.matrixWorld)
    const bp = ball.mesh.position
    const closest = new THREE.Vector3()
    worldBox.clampPoint(bp, closest)
    const dist = bp.distanceTo(closest)

    if (dist < BALL_RADIUS) {
      const normal = new THREE.Vector3().subVectors(bp, closest)
      if (normal.lengthSq() < 1e-6) {
        normal.set(0, 0, 1).applyQuaternion(hoopGroup.quaternion)
      } else {
        normal.normalize()
      }
      const dot = ball.velocity.dot(normal)
      if (dot < 0) {
        ball.velocity.addScaledVector(normal, -2 * dot)
        ball.velocity.multiplyScalar(0.72)
        ball.bounces++
        bp.addScaledVector(normal, BALL_RADIUS - dist + 0.012)
      }
    }
  }

  const checkRim = (ball) => {
    if (!hoopGroup) return
    const rimWorld = getRimWorldPos()
    const bp = ball.mesh.position

    const toCenter = new THREE.Vector2(bp.x - rimWorld.x, bp.z - rimWorld.z)
    const distFromAxis = toCenter.length()
    const rimTube = 0.04 * UNITS_PER_METER
    const ringDist = Math.abs(distFromAxis - rimRadius)

    if (ringDist < BALL_RADIUS + rimTube &&
        Math.abs(bp.y - rimWorld.y) < BALL_RADIUS + rimTube * 2) {
      const angle = Math.atan2(toCenter.y, toCenter.x)
      const closestOnRing = new THREE.Vector3(
        rimWorld.x + Math.cos(angle) * rimRadius,
        rimWorld.y,
        rimWorld.z + Math.sin(angle) * rimRadius
      )
      const normal = new THREE.Vector3().subVectors(bp, closestOnRing)
      if (normal.lengthSq() < 1e-6) return
      normal.normalize()
      const dot = ball.velocity.dot(normal)
      if (dot < 0) {
        ball.velocity.addScaledVector(normal, -2 * dot)
        ball.velocity.multiplyScalar(0.78)
        bp.addScaledVector(normal, BALL_RADIUS + rimTube - ringDist + 0.006)
        ball.bounces++
      }
    }
  }

  const simulateBallStep = (ball, stepDelta) => {
    ball.lastPos.copy(ball.mesh.position)
    ball.velocity.y += GRAVITY * stepDelta
    ball.mesh.position.addScaledVector(ball.velocity, stepDelta)

    // Spin
    ball.mesh.rotation.x += stepDelta * 5.2
    ball.mesh.rotation.z += stepDelta * 3.4

    if (hoopGroup) {
      checkBackboard(ball)
      checkRim(ball)
      checkScore(ball)
    }

    // Floor bounce
    if (groundPlane && ball.mesh.position.y < groundPlane.position.y + BALL_RADIUS) {
      ball.mesh.position.y = groundPlane.position.y + BALL_RADIUS
      ball.velocity.y = Math.abs(ball.velocity.y) * 0.58
      ball.velocity.x *= 0.74
      ball.velocity.z *= 0.74
      ball.bounces++
    }
  }

  const updateBalls = (delta) => {
    for (let i = activeBalls.length - 1; i >= 0; i--) {
      const ball = activeBalls[i]
      ball.age += delta

      let remaining = delta
      while (remaining > 0) {
        const stepDelta = Math.min(remaining, MAX_PHYSICS_STEP)
        simulateBallStep(ball, stepDelta)
        remaining -= stepDelta
      }

      // Cleanup
      if (ball.age > 6 || ball.bounces > 7) {
        xrScene.remove(ball.mesh)
        activeBalls.splice(i, 1)
      }
    }
  }

  // Hoop sliding logic removed as per user request

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
    swipeStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() }
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
    const dx = endX - swipeStart.x
    const dy = swipeStart.y - endY
    swipeStart = null

    // Upward swipe with enough distance
    if (dy > 30 && dt < 1.2) {
      // Power is driven mostly by swipe distance (learnable), with a small
      // boost from flick speed. A swipe of ~half the screen = full power.
      const distancePower = dy / (window.innerHeight * 0.5)
      const flickBoost = (dy / (dt * 1400)) * 0.25
      const power = THREE.MathUtils.clamp(distancePower + flickBoost, 0.1, 1)

      // Horizontal aim from sideways component of the swipe
      const aim = THREE.MathUtils.clamp(dx / (window.innerWidth * 0.4), -1, 1)

      shootBall(power, aim)
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

      if (readyBallAnchor?.parent !== xrCamera && xrCamera) {
        xrCamera.add(readyBallAnchor)
      }

      if (gameActive && readyBallAnchor) {
        updateReadyBallPose()
      }

      // Spin the ready ball slowly for effect
      if (gameActive && readyBall) {
        readyBall.rotation.y += delta * 1.4
      }

      updateBalls(delta)
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
      activeBalls.forEach(b => { if (xrScene) xrScene.remove(b.mesh) })
      activeBalls.length = 0
      if (xrScene) {
        if (hoopGroup) xrScene.remove(hoopGroup)
        if (groundPlane) xrScene.remove(groundPlane)
        if (reticle) xrScene.remove(reticle)
        if (readyBallAnchor) {
          if (readyBallAnchor.parent) {
            readyBallAnchor.parent.remove(readyBallAnchor)
          } else {
            xrScene.remove(readyBallAnchor)
          }
        }
      }
    }
  }
}
