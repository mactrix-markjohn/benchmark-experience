export class UIManager {
  constructor(gameState) {
    this.gameState = gameState

    this.instruction = document.getElementById('instruction')
    this.scorePill = document.getElementById('score-pill')

    this.onboardingScreen = document.getElementById('onboarding-screen')
    this.onboardingBtn = document.getElementById('onboarding-btn')

    this.foundOverlay = document.getElementById('found-overlay')
    this.foundPoints = document.getElementById('found-points')
    this.foundBtn = document.getElementById('found-btn')

    this.shutterBtn = document.getElementById('shutter-btn')
    this.shutterContainer = document.getElementById('shutter-container')
    this.flashEl = document.getElementById('flash-container')

    this.previewModal = document.getElementById('preview-modal')
    this.previewImg = document.getElementById('preview-img')
    this.shareBtn = document.getElementById('share-btn')
    this.downloadBtn = document.getElementById('download-btn')
    this.closePreviewBtn = document.getElementById('close-preview-btn')

    this.initEventListeners()
  }

  initEventListeners() {
    if (this.onboardingBtn) {
      this.onboardingBtn.addEventListener('click', () => {
        if (this.onboardingScreen) {
          this.onboardingScreen.style.opacity = '0'
          setTimeout(() => { this.onboardingScreen.style.display = 'none' }, 300)
        }
      })
    }

    if (this.shutterBtn) {
      this.shutterBtn.addEventListener('click', () => this.triggerCapture())
    }

    if (this.closePreviewBtn) {
      this.closePreviewBtn.addEventListener('click', () => {
        this.previewModal.classList.remove('active')
        this.shutterContainer.style.display = 'flex'
        this.showInstruction('Move around the mascot and take another shot!')
      })
    }
  }

  showInstruction(text) {
    if (!this.instruction) return
    if (text) {
      this.instruction.innerText = text
      this.instruction.style.display = 'block'
    } else {
      this.instruction.style.display = 'none'
    }
  }

  updateScore(pts) {
    if (this.scorePill) {
      this.scorePill.innerText = `${pts} PTS`
      this.scorePill.style.display = 'block'
    }
  }

  showFoundOverlay(points, onContinue) {
    if (!this.foundOverlay) return
    this.updateScore(points)
    if (this.foundPoints) this.foundPoints.innerText = `+${points}`

    const newBtn = this.foundBtn.cloneNode(true)
    this.foundBtn.parentNode.replaceChild(newBtn, this.foundBtn)
    this.foundBtn = newBtn
    this.foundBtn.addEventListener('click', () => {
      this.foundOverlay.classList.remove('active')
      if (onContinue) onContinue()
    })
    this.foundOverlay.classList.add('active')
  }

  showShutterButton() {
    if (this.shutterContainer) this.shutterContainer.style.display = 'flex'
    this.showInstruction('Stand next to the mascot and tap the shutter!')
  }

  triggerCapture() {
    if (this.flashEl) {
      this.flashEl.style.opacity = '1'
      setTimeout(() => { this.flashEl.style.opacity = '0' }, 120)
    }

    const video = document.querySelector('video')
    const gl = document.getElementById('camerafeed')
    if (!video || !gl) return

    // Use CSS pixel dimensions (what the user actually sees on screen)
    // to keep video and WebGL layers aligned without stretching
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const w = Math.round(window.innerWidth * dpr)
    const h = Math.round(window.innerHeight * dpr)
    c.width = w
    c.height = h

    ctx.drawImage(video, 0, 0, w, h)
    ctx.drawImage(gl, 0, 0, w, h)

    this.showPreview(c.toDataURL('image/jpeg'), c)
  }

  showPreview(dataUrl, canvas) {
    if (!this.previewModal) return
    this.previewImg.src = dataUrl
    this.shutterContainer.style.display = 'none'
    this.showInstruction('')

    const newShare = this.shareBtn.cloneNode(true)
    this.shareBtn.parentNode.replaceChild(newShare, this.shareBtn)
    this.shareBtn = newShare
    this.shareBtn.addEventListener('click', () => {
      canvas.toBlob((blob) => {
        const file = new File([blob], 'mascot_photo.jpg', {type: 'image/jpeg'})
        if (navigator.share && navigator.canShare({files: [file]})) {
          navigator.share({files: [file], title: 'Mascot Photo!'}).catch(() => {})
        }
      }, 'image/jpeg')
    })

    const newDl = this.downloadBtn.cloneNode(true)
    this.downloadBtn.parentNode.replaceChild(newDl, this.downloadBtn)
    this.downloadBtn = newDl
    this.downloadBtn.addEventListener('click', () => {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = 'mascot_photo.jpg'
      a.click()
    })

    this.previewModal.classList.add('active')
  }

  // Compatibility stubs
  updateHUD() {}
  updateClue(text) { this.showInstruction(text) }
}
