import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'

const UNITS_PER_METER = 1.0
const GRAVITY = -9.8
const BALL_RADIUS = 0.12 // 12cm radius
const GAME_DURATION = 20
const HOOP_SLIDE_SPEED = 1.0
const HOOP_SLIDE_RANGE = 1.5
const SHOOT_POWER = 5.0

export const initBuzzerBeaterModule = (uiManager) => {
  let xrScene = null
  let xrCamera = null
  let groundPlane = null
  let reticle = null

  let hoopModel = null
  let hoopGroup = null
  let hoopPlaced = false
  let hoopAnchorPos = new THREE.Vector3()
  let hoopSlideDir = 1
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

    scene.add(new THREE.DirectionalLight(0xffffff, 1.5).translateX(5).translateY(10).translateZ(7))
    scene.add(new THREE.AmbientLight(0xffffff, 0.7))

    // Reticle
    const ringGeo = new THREE.RingGeometry(0.5, 0.6, 32)
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

      // Scale hoop to ~2.5m tall for AR (closer to real life)
      hoopScaleFactor = 2.5 / size.y
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
      
      // Calculate scale to match BALL_RADIUS (which is 0.12)
      const box = new THREE.Box3().setFromObject(ballTemplate)
      const size = box.getSize(new THREE.Vector3())
      
      // Assuming size.y is the diameter of the ball model
      const scale = (BALL_RADIUS * 2) / size.y
      ballTemplate.scale.set(scale, scale, scale)
      
      ballTemplate.visible = false
    })
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

  // Shoot a ball from the bottom of the screen toward where the camera points
  const shootBall = (swipeSpeed) => {
    if (!gameActive || !ballTemplate || !xrCamera) return

    const ball = ballTemplate.clone()
    ball.visible = true
    xrScene.add(ball)

    const camPos = new THREE.Vector3()
    const camDir = new THREE.Vector3()
    const camUp = new THREE.Vector3(0, 1, 0)
    xrCamera.getWorldPosition(camPos)
    xrCamera.getWorldDirection(camDir)

    // Start ball just below and in front of the camera so it's visible during throw
    ball.position.copy(camPos)
    ball.position.addScaledVector(camDir, 0.4)
    ball.position.addScaledVector(camUp, -0.3)

    // Launch direction: flatten the camera pitch slightly to throw forward, and add an upward arc
    const launchDir = new THREE.Vector3(camDir.x, 0, camDir.z).normalize()

    // speed limit
    const speed = Math.min(Math.max(swipeSpeed, 0.5), 2.5)
    
    // velocity
    const vx = launchDir.x * speed * SHOOT_POWER
    const vz = launchDir.z * speed * SHOOT_POWER
    // Add strong upward arc based on swipe
    const vy = speed * SHOOT_POWER * 0.8

    activeBalls.push({
      mesh: ball,
      velocity: new THREE.Vector3(vx, vy, vz),
      age: 0,
      scored: false,
      bounces: 0
    })
  }

  const getRimWorldPos = () => {
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
    const worldBox = backboardLocalBox.clone().applyMatrix4(hoopGroup.matrixWorld)
    const bp = ball.mesh.position
    const closest = new THREE.Vector3()
    worldBox.clampPoint(bp, closest)
    const dist = bp.distanceTo(closest)

    if (dist < BALL_RADIUS) {
      const normal = new THREE.Vector3().subVectors(bp, closest).normalize()
      const dot = ball.velocity.dot(normal)
      if (dot < 0) {
        ball.velocity.addScaledVector(normal, -2 * dot)
        ball.velocity.multiplyScalar(0.5)
        ball.bounces++
        bp.addScaledVector(normal, BALL_RADIUS - dist + 0.05)
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
      const normal = new THREE.Vector3().subVectors(bp, closestOnRing).normalize()
      const dot = ball.velocity.dot(normal)
      if (dot < 0) {
        ball.velocity.addScaledVector(normal, -2 * dot)
        ball.velocity.multiplyScalar(0.45)
        ball.bounces++
      }
    }
  }

  const updateBalls = (delta) => {
    for (let i = activeBalls.length - 1; i >= 0; i--) {
      const ball = activeBalls[i]
      ball.age += delta

      ball.velocity.y += GRAVITY * delta
      ball.mesh.position.addScaledVector(ball.velocity, delta)

      // Spin
      ball.mesh.rotation.x += delta * 6
      ball.mesh.rotation.z += delta * 4

      if (hoopGroup) {
        checkBackboard(ball)
        checkRim(ball)
        checkScore(ball)
      }

      // Floor bounce
      if (groundPlane && ball.mesh.position.y < groundPlane.position.y + BALL_RADIUS) {
        ball.mesh.position.y = groundPlane.position.y + BALL_RADIUS
        ball.velocity.y = Math.abs(ball.velocity.y) * 0.3
        ball.velocity.x *= 0.6
        ball.velocity.z *= 0.6
        ball.bounces++
      }

      // Cleanup
      if (ball.age > 4 || ball.bounces > 5) {
        xrScene.remove(ball.mesh)
        activeBalls.splice(i, 1)
      }
    }
  }

  const updateHoopSlide = (delta) => {
    if (!hoopGroup || !hoopPlaced || !gameActive) return

    hoopSlideOffset += hoopSlideDir * HOOP_SLIDE_SPEED * delta

    if (Math.abs(hoopSlideOffset) > HOOP_SLIDE_RANGE) {
      hoopSlideDir *= -1
      hoopSlideOffset = Math.sign(hoopSlideOffset) * HOOP_SLIDE_RANGE
    }

    // Slide along the hoop's local X axis (left-right from user's perspective)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(hoopGroup.quaternion)
    hoopGroup.position.copy(hoopAnchorPos).addScaledVector(right, hoopSlideOffset)
  }

  // Touch handlers
  const handleTouchStart = (e) => {
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

  const handleTouchEnd = (e) => {
    if (!swipeStart || !gameActive) return
    const endY = e.changedTouches[0].clientY
    const dt = (Date.now() - swipeStart.time) / 1000
    const dy = swipeStart.y - endY
    swipeStart = null

    // Upward swipe with enough speed
    if (dy > 30 && dt < 1.0) {
      const speed = Math.min(Math.max(dy / (dt * 400), 0.5), 2.5)
      shootBall(speed)
    }
  }

  return {
    name: 'buzzer-beater-renderer',

    onStart: () => {
      const xrData = XR8.Threejs.xrScene()
      if (!xrData) return
      initScene(xrData)

      const canvas = document.getElementById('camerafeed')
      canvas.addEventListener('touchstart', handleTouchStart)
      canvas.addEventListener('touchend', handleTouchEnd)

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

      updateHoopSlide(delta)
      updateBalls(delta)
    },

    onStop: () => {
      if (gameTimer) { clearInterval(gameTimer); gameTimer = null }
      gameActive = false
      showBuzzerHUD(false)
      const canvas = document.getElementById('camerafeed')
      if (canvas) {
        canvas.removeEventListener('touchstart', handleTouchStart)
        canvas.removeEventListener('touchend', handleTouchEnd)
      }
      activeBalls.forEach(b => { if (xrScene) xrScene.remove(b.mesh) })
      activeBalls.length = 0
      if (xrScene) {
        if (hoopGroup) xrScene.remove(hoopGroup)
        if (groundPlane) xrScene.remove(groundPlane)
        if (reticle) xrScene.remove(reticle)
      }
    }
  }
}
