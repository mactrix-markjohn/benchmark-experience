import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'

const BALL_RADIUS = 0.12
const GAME_DURATION = 20
const SHOOT_DURATION_MIN = 0.55
const SHOOT_DURATION_MAX = 0.9
const ARC_HEIGHT_MIN = 0.65
const ARC_HEIGHT_MAX = 1.05

const HOOP_LOCAL_POS = new THREE.Vector3(0, 0.18, -2.2)
const BALL_LOCAL_DISTANCE = 0.38

export const initBuzzerBeaterModule = (uiManager) => {
  let xrScene = null
  let xrCamera = null
  let gameRig = null

  let hoopModel = null
  let hoopAnchor = null
  let rimTargetObject = null
  let rimLocalCenter = new THREE.Vector3()
  let rimRadius = 0.18

  let ballTemplate = null
  let readyBall = null
  let readyBallAnchor = null

  let activeShot = null
  let score = 0
  let timeLeft = GAME_DURATION
  let gameActive = false
  let gameTimer = null
  let swipeStart = null

  const timer = new THREE.Clock()

  const getReadyBallLocalPosition = () => {
    const distance = BALL_LOCAL_DISTANCE
    const fovRad = THREE.MathUtils.degToRad(xrCamera?.fov || 60)
    const halfHeight = Math.tan(fovRad * 0.5) * distance
    return new THREE.Vector3(0, -halfHeight * 3.65, -distance)
  }

  const updateReadyBallPose = () => {
    if (!readyBallAnchor) return
    readyBallAnchor.position.copy(getReadyBallLocalPosition())
    readyBallAnchor.rotation.set(-0.35, 0, 0)
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

  const getRimWorldPos = () => {
    if (!hoopAnchor) return new THREE.Vector3()
    hoopAnchor.updateMatrixWorld(true)

    if (rimTargetObject) {
      const rimBox = new THREE.Box3().setFromObject(rimTargetObject)
      if (!rimBox.isEmpty()) return rimBox.getCenter(new THREE.Vector3())
    }

    return hoopAnchor.localToWorld(rimLocalCenter.clone())
  }

  const getArcPoint = (start, control, end, t) => {
    const invT = 1 - t
    return new THREE.Vector3()
      .copy(start).multiplyScalar(invT * invT)
      .add(control.clone().multiplyScalar(2 * invT * t))
      .add(end.clone().multiplyScalar(t * t))
  }

  const getArcTangent = (start, control, end, t) => {
    return new THREE.Vector3()
      .copy(control).sub(start).multiplyScalar(2 * (1 - t))
      .add(end.clone().sub(control).multiplyScalar(2 * t))
  }

  const startGame = () => {
    score = 0
    timeLeft = GAME_DURATION
    gameActive = true
    activeShot = null

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
        if (activeShot?.mesh?.parent) activeShot.mesh.parent.remove(activeShot.mesh)
        activeShot = null
        startGame()
      })
    }
  }

  const configureHoopRig = () => {
    if (!gameRig || !hoopAnchor || !hoopModel) return

    hoopAnchor.position.copy(HOOP_LOCAL_POS)
    hoopAnchor.rotation.set(0, 0, 0)
    hoopAnchor.visible = true
    hoopModel.visible = true

    hoopAnchor.updateMatrixWorld(true)
    const cameraWorld = new THREE.Vector3()
    xrCamera.getWorldPosition(cameraWorld)
    hoopAnchor.lookAt(new THREE.Vector3(cameraWorld.x, hoopAnchor.getWorldPosition(new THREE.Vector3()).y, cameraWorld.z))
    hoopAnchor.rotateY(Math.PI)
    hoopAnchor.updateMatrixWorld(true)
  }

  const shootBall = (swipeStrength = 0.5) => {
    if (!gameActive || !ballTemplate || !readyBallAnchor || activeShot) return

    const shotBall = ballTemplate.clone()
    shotBall.visible = true
    shotBall.traverse((child) => {
      child.frustumCulled = false
    })
    gameRig.add(shotBall)

    const start = readyBallAnchor.position.clone()
    const rimWorld = getRimWorldPos()
    const end = gameRig.worldToLocal(rimWorld.clone()).add(new THREE.Vector3(0, -BALL_RADIUS * 0.55, 0))
    const duration = THREE.MathUtils.lerp(SHOOT_DURATION_MAX, SHOOT_DURATION_MIN, swipeStrength)
    const midpoint = start.clone().lerp(end, 0.5)
    const control = midpoint.add(new THREE.Vector3(0, THREE.MathUtils.lerp(ARC_HEIGHT_MIN, ARC_HEIGHT_MAX, swipeStrength), 0))

    shotBall.position.copy(start)
    activeShot = {
      mesh: shotBall,
      start,
      control,
      end,
      duration,
      t: 0,
      scored: false,
    }

    if (readyBall) readyBall.visible = false
  }

  const updateShot = (delta) => {
    if (!activeShot) return

    activeShot.t += delta / activeShot.duration
    const t = Math.min(activeShot.t, 1)
    const pos = getArcPoint(activeShot.start, activeShot.control, activeShot.end, t)
    activeShot.mesh.position.copy(pos)

    const tangent = getArcTangent(activeShot.start, activeShot.control, activeShot.end, Math.min(t + 0.01, 1))
    if (tangent.lengthSq() > 1e-6) {
      tangent.normalize()
      activeShot.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent)
    }
    activeShot.mesh.rotateZ(delta * 10)

    const rimLocal = gameRig.worldToLocal(getRimWorldPos().clone())
    if (!activeShot.scored && t > 0.62) {
      const hDist = Math.hypot(activeShot.mesh.position.x - rimLocal.x, activeShot.mesh.position.z - rimLocal.z)
      const nearRimHeight = Math.abs(activeShot.mesh.position.y - rimLocal.y) < BALL_RADIUS * 1.5
      if (hDist < rimRadius * 0.8 && nearRimHeight) {
        activeShot.scored = true
        score += 1
        updateHUD()
        uiManager.showInstruction('SCORE! 🏀 +1')
        setTimeout(() => {
          if (gameActive) uiManager.showInstruction('Swipe up to shoot!')
        }, 600)
      }
    }

    if (t >= 1) {
      if (activeShot.mesh.parent) activeShot.mesh.parent.remove(activeShot.mesh)
      activeShot = null
      if (readyBall) {
        readyBall.visible = true
        readyBall.rotation.set(0, 0, 0)
      }
    }
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

    const endY = e.changedTouches[0].clientY
    const dt = (Date.now() - swipeStart.time) / 1000
    const dy = swipeStart.y - endY
    swipeStart = null

    if (dy > 30 && dt < 1.2) {
      const swipeStrength = THREE.MathUtils.clamp((dy / Math.max(window.innerHeight * 0.28, 1)) * 0.8, 0, 1)
      shootBall(swipeStrength)
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
    activeShot = null

    scene.add(new THREE.DirectionalLight(0xffffff, 1.5).translateX(5).translateY(10).translateZ(7))
    scene.add(new THREE.AmbientLight(0xffffff, 0.9))

    gameRig = new THREE.Group()
    xrCamera.add(gameRig)

    const loader = new GLTFLoader()

    loader.load('assets/HoopwithObject.glb', (gltf) => {
      hoopModel = gltf.scene
      hoopModel.rotation.x = -Math.PI / 2
      hoopModel.updateMatrixWorld(true)

      const box = new THREE.Box3().setFromObject(hoopModel)
      const size = box.getSize(new THREE.Vector3())
      const hoopScaleFactor = 1.35 / Math.max(size.y, 0.001)
      hoopModel.scale.setScalar(hoopScaleFactor)

      hoopAnchor = new THREE.Group()
      hoopAnchor.add(hoopModel)
      hoopAnchor.visible = false
      gameRig.add(hoopAnchor)

      rimTargetObject = hoopModel.getObjectByName('Object_6') || null
      hoopAnchor.updateMatrixWorld(true)

      if (rimTargetObject) {
        const rimBox = new THREE.Box3().setFromObject(rimTargetObject)
        const rimCenterWorld = rimBox.getCenter(new THREE.Vector3())
        const rimSize = rimBox.getSize(new THREE.Vector3())
        rimLocalCenter.copy(hoopAnchor.worldToLocal(rimCenterWorld.clone()))
        rimRadius = Math.max(rimSize.x, rimSize.z) * 0.5
      }

      configureHoopRig()
      hoopPlaced = true
      if (ballTemplate && readyBallAnchor) startGame()
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
      gameRig.add(readyBallAnchor)
      updateReadyBallPose()

      if (hoopPlaced) startGame()
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

      uiManager.showInstruction('Loading hoop...')
    },

    onUpdate: () => {
      const delta = timer.getDelta()

      if (gameRig?.parent !== xrCamera && xrCamera) {
        xrCamera.add(gameRig)
      }

      if (readyBallAnchor) updateReadyBallPose()
      if (gameActive && readyBall && !activeShot) {
        readyBall.rotation.y += delta * 1.2
      }

      updateShot(delta)
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

      if (activeShot?.mesh?.parent) activeShot.mesh.parent.remove(activeShot.mesh)
      activeShot = null

      if (gameRig?.parent) gameRig.parent.remove(gameRig)
      gameRig = null
      hoopAnchor = null
      readyBallAnchor = null
      readyBall = null
    },
  }
}
