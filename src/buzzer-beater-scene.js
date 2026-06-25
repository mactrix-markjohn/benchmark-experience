import * as THREE from 'three'

export const initBuzzerBeaterModule = (uiManager) => {
  let xrScene = null
  let xrCamera = null
  let targetHoop = null
  let groundPlane = null
  let reticle = null
  const raycaster = new THREE.Raycaster()
  const screenCenter = new THREE.Vector2(0, 0)
  let isPlaced = false

  const initScene = ({scene, camera, renderer}) => {
    xrScene = scene
    xrCamera = camera
    isPlaced = false

    // Lights
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5)
    dirLight.position.set(5, 10, 7)
    scene.add(dirLight)
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))

    // Scanning reticle
    const ringGeo = new THREE.RingGeometry(0.5, 0.6, 32)
    ringGeo.rotateX(-Math.PI / 2)
    reticle = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xff6600, side: THREE.DoubleSide, transparent: true, opacity: 0.8
    }))
    reticle.visible = false
    scene.add(reticle)

    // Ground plane for raycast
    const groundGeo = new THREE.PlaneGeometry(200, 200)
    groundGeo.rotateX(-Math.PI / 2)
    groundPlane = new THREE.Mesh(groundGeo, new THREE.MeshBasicMaterial({visible: false}))
    scene.add(groundPlane)

    // Placeholder Hoop (Orange Ring and Backboard)
    targetHoop = new THREE.Group()
    targetHoop.visible = false

    // Hoop Ring
    const torusGeo = new THREE.TorusGeometry(0.3, 0.03, 16, 100)
    torusGeo.rotateX(Math.PI / 2)
    const torus = new THREE.Mesh(torusGeo, new THREE.MeshStandardMaterial({color: 0xff4400}))
    targetHoop.add(torus)

    // Backboard mesh
    const boardGeo = new THREE.BoxGeometry(1.2, 0.8, 0.05)
    const board = new THREE.Mesh(boardGeo, new THREE.MeshStandardMaterial({color: 0xeeeeee}))
    board.position.set(0, 0.6, -0.3)
    targetHoop.add(board)

    // Stand / Pole
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.8)
    const pole = new THREE.Mesh(poleGeo, new THREE.MeshStandardMaterial({color: 0x333333}))
    pole.position.set(0, -0.6, -0.3)
    targetHoop.add(pole)

    scene.add(targetHoop)

    // Position ground plane below camera
    setTimeout(() => {
      if (xrCamera && groundPlane) {
        const cp = new THREE.Vector3()
        xrCamera.getWorldPosition(cp)
        groundPlane.position.y = cp.y - 1.5
      }
    }, 500)
  }

  const handleTap = (e) => {
    if (isPlaced || !xrCamera || !groundPlane) return
    const t = e.touches ? e.touches[0] : e
    const ndc = new THREE.Vector2(
      (t.clientX / window.innerWidth) * 2 - 1,
      -(t.clientY / window.innerHeight) * 2 + 1
    )
    raycaster.setFromCamera(ndc, xrCamera)
    const hits = raycaster.intersectObject(groundPlane)
    if (hits.length > 0) {
      targetHoop.position.copy(hits[0].point)
      // Elevate the hoop assembly slightly off the ground
      targetHoop.position.y += 0.9 // Keep the stand bottom on the floor
      
      const cp = new THREE.Vector3()
      xrCamera.getWorldPosition(cp)
      targetHoop.lookAt(new THREE.Vector3(cp.x, targetHoop.position.y, cp.z))

      targetHoop.visible = true
      reticle.visible = false
      isPlaced = true

      uiManager.showInstruction('Buzzer Beater Hoop Placed!')
      uiManager.showShutterButton('Tap the shutter to take a photo of your court!')
    }
  }

  const cleanUp = () => {
    if (xrScene) {
      if (targetHoop) xrScene.remove(targetHoop)
      if (groundPlane) xrScene.remove(groundPlane)
      if (reticle) xrScene.remove(reticle)
    }
    const canvas = document.getElementById('camerafeed')
    if (canvas) {
      canvas.removeEventListener('touchstart', handleTap)
    }
  }

  return {
    name: 'buzzer-beater-renderer',

    onStart: () => {
      const xrData = XR8.Threejs.xrScene()
      if (!xrData) return
      initScene(xrData)

      const canvas = document.getElementById('camerafeed')
      canvas.removeEventListener('touchstart', handleTap)
      canvas.addEventListener('touchstart', handleTap)

      uiManager.showInstruction('Tap the floor to place the basketball hoop!')
    },

    onUpdate: () => {
      if (!isPlaced && reticle && xrCamera && groundPlane) {
        raycaster.setFromCamera(screenCenter, xrCamera)
        const hits = raycaster.intersectObject(groundPlane)
        if (hits.length > 0) {
          reticle.position.copy(hits[0].point)
          reticle.position.y += 0.02
          reticle.visible = true
        } else {
          reticle.visible = false
        }
      }
    },

    onStop: () => {
      cleanUp()
    }
  }
}
