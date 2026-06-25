import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'

const UNITS_PER_METER = 1.0 / 0.21
const GRAVITY = -9.8 * UNITS_PER_METER
const BALL_RADIUS = 0.12 * UNITS_PER_METER
const GAME_DURATION = 20
const HOOP_SLIDE_SPEED = 1.5
const HOOP_SLIDE_RANGE = 2.0 * UNITS_PER_METER

export const initBuzzerBeaterModule = (uiManager) => {
  let xrScene = null
  let xrCamera = null
  let groundPlane = null
  let reticle = null

  let hoopModel = null
  let hoopGroup = null
  let hoopPlaced = false
  let hoopCenter = new THREE.Vector3()
  let hoopSlideDir = 1

  // Collision geometry
  let rimCenter = new THREE.Vector3()
  let rimRadius = 0.0
  let backboardBox = null

  const activeBalls = []
  let ballTemplate = null

  let score = 0
  let timeLeft = GAME_DURATION
  let gameActive = false
  let gameTimer = null
  let swipeStart = null

  const clock = new THREE.Clock()
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

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5)
    dirLight.position.set(5, 10, 7)
    dirLight.castShadow = true
    scene.add(dirLight)
    scene.add(new THREE.AmbientLight(0xffffff, 0.7))

    // Ground reticle
    const ringGeo = new THREE.RingGeometry(0.5, 0.6, 32)
    ringGeo.rotateX(-Math.PI / 2)
    reticle = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xff6600, side: THREE.DoubleSide, transparent: true, opacity: 0.8
    }))
    reticle.visible = false
    scene.add(reticle)

    // Ground plane for raycasting
    const groundGeo = new THREE.PlaneGeometry(500, 500)
    groundGeo.rotateX(-Math.PI / 2)
    groundPlane = new THREE.Mesh(groundGeo, new THREE.MeshBasicMaterial({
      visible: false, side: THREE.DoubleSide
    }))
    scene.add(groundPlane)

    setTimeout(() => {
      if (xrCamera && groundPlane) {
        const cp = new THREE.Vector3()
        xrCamera.getWorldPosition(cp)
        groundPlane.position.y = cp.y - (1.3 * UNITS_PER_METER)
      }
    }, 500)

    const loader = new GLTFLoader()

    loader.load('assets/basketballhoop.glb', (gltf) => {
      hoopModel = gltf.scene

      hoopModel.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(hoopModel)
      const size = box.getSize(new THREE.Vector3())
      const hoopScale = (2.0 * UNITS_PER_METER) / size.y
      hoopModel.scale.set(hoopScale, hoopScale, hoopScale)

      hoopModel.updateMatrixWorld(true)
      const scaledBox = new THREE.Box3().setFromObject(hoopModel)
      const scaledSize = scaledBox.getSize(new THREE.Vector3())

      rimCenter = new THREE.Vector3(0, scaledBox.min.y + scaledSize.y * 0.85, 0)
      rimRadius = scaledSize.x * 0.2

      const bbMin = new THREE.Vector3(
        scaledBox.min.x, scaledBox.min.y + scaledSize.y * 0.75, scaledBox.min.z
      )
      const bbMax = scaledBox.max.clone()
      backboardBox = new THREE.Box3(bbMin, bbMax)

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
      const ballScale = (BALL_RADIUS * 2) / Math.max(size.x, size.y, size.z)
      ballTemplate.scale.set(ballScale, ballScale, ballScale)
      ballTemplate.visible = false
    })
  }

  const placeHoop = (point) => {
    if (!hoopGroup || !hoopModel) return
    hoopGroup.position.copy(point)

    hoopModel.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(hoopModel)
    hoopGroup.position.y -= box.min.y - point.y

    hoopCenter.copy(hoopGroup.position)

    const cp = new THREE.Vector3()
    xrCamera.getWorldPosition(cp)
    hoopGroup.lookAt(new THREE.Vector3(cp.x, hoopGroup.position.y, cp.z))

    hoopGroup.visible = true
    hoopModel.visible = true
    reticle.visible = false
    hoopPlaced = true

    startGame()
  }

  const startGame = () => {
    score = 0
    timeLeft = GAME_DURATION
    gameActive = true
    updateHUD()
    showBuzzerHUD(true)
    uiManager.showInstruction('Swipe up to shoot!')

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

    const playAgainBtn = document.getElementById('buzzer-play-again')
    if (playAgainBtn) {
      const newBtn = playAgainBtn.cloneNode(true)
      playAgainBtn.parentNode.replaceChild(newBtn, playAgainBtn)
      newBtn.addEventListener('click', () => {
        overlay.classList.remove('active')
        activeBalls.forEach(b => xrScene.remove(b.mesh))
        activeBalls.length = 0
        startGame()
      })
    }
  }

  const updateHUD = () => {
    const timerEl = document.getElementById('buzzer-timer')
    const scoreEl = document.getElementById('buzzer-score')
    if (timerEl) timerEl.innerText = `${timeLeft}s`
    if (scoreEl) scoreEl.innerText = `${score}`
  }

  const showBuzzerHUD = (show) => {
    const hud = document.getElementById('buzzer-hud')
    if (hud) hud.style.display = show ? 'flex' : 'none'
  }

  const shootBall = (swipeSpeed) => {
    if (!gameActive || !ballTemplate || !xrCamera || !hoopGroup) return

    const ball = ballTemplate.clone()
    ball.visible = true
    xrScene.add(ball)

    const camPos = new THREE.Vector3()
    const camDir = new THREE.Vector3()
    xrCamera.getWorldPosition(camPos)
    xrCamera.getWorldDirection(camDir)

    ball.position.copy(camPos)
    ball.position.addScaledVector(camDir, 1.0)
    ball.position.y -= 0.5 * UNITS_PER_METER

    // Aim at the hoop's current world position (rim height)
    const hoopWorldPos = new THREE.Vector3()
    hoopGroup.getWorldPosition(hoopWorldPos)
    const rimWorldY = rimCenter.y + hoopGroup.position.y
    hoopWorldPos.y = rimWorldY

    const toHoop = new THREE.Vector3().subVectors(hoopWorldPos, ball.position)
    const dist = toHoop.length()
    const flightTime = Math.max(dist / (swipeSpeed * 8 * UNITS_PER_METER), 0.3)

    const vx = toHoop.x / flightTime
    const vz = toHoop.z / flightTime
    const vy = (toHoop.y - 0.5 * GRAVITY * flightTime * flightTime) / flightTime

    activeBalls.push({
      mesh: ball,
      velocity: new THREE.Vector3(vx, vy, vz),
      age: 0,
      scored: false,
      bounces: 0
    })
  }

  const checkScore = (ball) => {
    if (ball.scored) return
    const rimWorld = new THREE.Vector3().copy(rimCenter)
    hoopGroup.localToWorld(rimWorld)

    const bp = ball.mesh.position
    const dx = bp.x - rimWorld.x
    const dz = bp.z - rimWorld.z
    const hDist = Math.sqrt(dx * dx + dz * dz)

    if (hDist < rimRadius * 1.3 &&
        Math.abs(bp.y - rimWorld.y) < BALL_RADIUS * 2.5 &&
        ball.velocity.y < 0) {
      ball.scored = true
      score++
      updateHUD()
      uiManager.showInstruction('SCORE! +1')
      setTimeout(() => { if (gameActive) uiManager.showInstruction('Swipe up to shoot!') }, 700)
    }
  }

  const checkBackboardCollision = (ball) => {
    if (!backboardBox) return
    const worldBox = backboardBox.clone().applyMatrix4(hoopGroup.matrixWorld)
    const bp = ball.mesh.position
    const closest = new THREE.Vector3()
    worldBox.clampPoint(bp, closest)
    const dist = bp.distanceTo(closest)

    if (dist < BALL_RADIUS) {
      const normal = new THREE.Vector3().subVectors(bp, closest).normalize()
      const dot = ball.velocity.dot(normal)
      ball.velocity.addScaledVector(normal, -2 * dot)
      ball.velocity.multiplyScalar(0.55)
      ball.bounces++
      bp.addScaledVector(normal, BALL_RADIUS - dist + 0.01)
    }
  }

  const checkRimCollision = (ball) => {
    const rimWorld = new THREE.Vector3().copy(rimCenter)
    hoopGroup.localToWorld(rimWorld)

    const bp = ball.mesh.position
    const toCenter = new THREE.Vector2(bp.x - rimWorld.x, bp.z - rimWorld.z)
    const distFromAxis = toCenter.length()
    const rimTube = 0.03 * UNITS_PER_METER
    const ringDist = Math.abs(distFromAxis - rimRadius)

    if (ringDist < BALL_RADIUS + rimTube &&
        Math.abs(bp.y - rimWorld.y) < BALL_RADIUS + rimTube) {
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
        ball.velocity.multiplyScalar(0.5)
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
      ball.mesh.rotation.x += delta * 5
      ball.mesh.rotation.z += delta * 3

      if (hoopGroup) {
        checkBackboardCollision(ball)
        checkRimCollision(ball)
        checkScore(ball)
      }

      if (groundPlane && ball.mesh.position.y < groundPlane.position.y + BALL_RADIUS) {
        ball.mesh.position.y = groundPlane.position.y + BALL_RADIUS
        ball.velocity.y = Math.abs(ball.velocity.y) * 0.35
        ball.velocity.x *= 0.7
        ball.velocity.z *= 0.7
        ball.bounces++
      }

      if (ball.age > 5 || ball.bounces > 6) {
        xrScene.remove(ball.mesh)
        activeBalls.splice(i, 1)
      }
    }
  }

  const updateHoopSlide = (delta) => {
    if (!hoopGroup || !hoopPlaced || !gameActive) return
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(hoopGroup.quaternion)
    hoopGroup.position.addScaledVector(right, hoopSlideDir * HOOP_SLIDE_SPEED * delta)

    const offset = new THREE.Vector3().subVectors(hoopGroup.position, hoopCenter)
    offset.y = 0
    if (offset.length() > HOOP_SLIDE_RANGE) hoopSlideDir *= -1
  }

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

    if (dy > 40 && dt < 0.8) {
      const speed = Math.min(dy / (dt * 500), 3.0)
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

      uiManager.showInstruction('Tap the floor to place the basketball hoop!')
    },

    onUpdate: () => {
      const delta = clock.getDelta()

      if (!hoopPlaced && reticle && xrCamera && groundPlane) {
        raycaster.setFromCamera(screenCenter, xrCamera)
        const hits = raycaster.intersectObject(groundPlane)
        if (hits.length > 0) {
          reticle.position.copy(hits[0].point)
          reticle.position.y += 0.02
          reticle.visible = true
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
