export class UIManager {
  constructor(gameState) {
    this.gameState = gameState
    this.selfieStream = null
    this.selfieVideoEl = null
    this.inSelfieMode = false
    this._startSelfieMode = null

    this.instruction = document.getElementById('instruction')
    this.scorePill = document.getElementById('score-pill')

    this.onboardingScreen = document.getElementById('onboarding-screen')
    this.onboardingBtn = document.getElementById('onboarding-btn')

    this.foundOverlay = document.getElementById('found-overlay')
    this.foundPoints = document.getElementById('found-points')
    this.foundBtn = document.getElementById('found-btn')

    this.selfieBtnEl = document.getElementById('selfie-btn')
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

    if (this.selfieBtnEl) {
      this.selfieBtnEl.addEventListener('click', () => {
        this.selfieBtnEl.style.display = 'none'
        if (this._startSelfieMode) this._startSelfieMode()
        this.enterSelfieMode()
      })
    }

    if (this.closePreviewBtn) {
      this.closePreviewBtn.addEventListener('click', () => {
        this.previewModal.classList.remove('active')
        if (this.inSelfieMode) {
          this.shutterContainer.style.display = 'flex'
          this.showInstruction('Strike a pose and tap the shutter!')
        }
      })
    }
  }

  // --- Minimal UI helpers ---

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

  // --- Found overlay (compact) ---

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

  // --- Selfie button ---

  showSelfieButton() {
    if (this.selfieBtnEl) this.selfieBtnEl.style.display = 'block'
  }

  // --- Selfie mode (front camera) ---

  async enterSelfieMode() {
    this.inSelfieMode = true
    try {
      this.selfieStream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: 'user', width: {ideal: 1920}, height: {ideal: 1080}}
      })
      this.selfieVideoEl = document.getElementById('selfie-video')
      this.selfieVideoEl.srcObject = this.selfieStream
      await this.selfieVideoEl.play()
      this.selfieVideoEl.style.display = 'block'
      document.getElementById('camerafeed').style.background = 'transparent'

      this.shutterContainer.style.display = 'flex'
      this.showInstruction('Strike a pose and tap the shutter!')
    } catch (err) {
      console.error('Front camera failed:', err)
      this.shutterContainer.style.display = 'flex'
    }
  }

  // --- Capture ---

  triggerCapture() {
    if (this.flashEl) {
      this.flashEl.style.opacity = '1'
      setTimeout(() => { this.flashEl.style.opacity = '0' }, 120)
    }

    const video = this.inSelfieMode ? this.selfieVideoEl : document.querySelector('video')
    const gl = document.getElementById('camerafeed')
    if (!video || !gl) return

    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    c.width = video.videoWidth || window.innerWidth
    c.height = video.videoHeight || window.innerHeight

    if (this.inSelfieMode) {
      ctx.save()
      ctx.translate(c.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, c.width, c.height)
      ctx.restore()
    } else {
      ctx.drawImage(video, 0, 0, c.width, c.height)
    }
    ctx.drawImage(gl, 0, 0, c.width, c.height)

    const url = c.toDataURL('image/jpeg')
    this.showPreview(url, c)
  }

  showPreview(dataUrl, canvas) {
    if (!this.previewModal) return
    this.previewImg.src = dataUrl
    this.shutterContainer.style.display = 'none'

    const newShare = this.shareBtn.cloneNode(true)
    this.shareBtn.parentNode.replaceChild(newShare, this.shareBtn)
    this.shareBtn = newShare
    this.shareBtn.addEventListener('click', () => {
      canvas.toBlob((blob) => {
        const file = new File([blob], 'mascot_selfie.jpg', {type: 'image/jpeg'})
        if (navigator.share && navigator.canShare({files: [file]})) {
          navigator.share({files: [file], title: 'Mascot Selfie!'})
            .catch(() => {})
        }
      }, 'image/jpeg')
    })

    const newDl = this.downloadBtn.cloneNode(true)
    this.downloadBtn.parentNode.replaceChild(newDl, this.downloadBtn)
    this.downloadBtn = newDl
    this.downloadBtn.addEventListener('click', () => {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = 'mascot_selfie.jpg'
      a.click()
    })

    this.previewModal.classList.add('active')
  }

  // Kept for compatibility but simplified
  updateHUD() {}
  updateClue(text) { this.showInstruction(text) }
}
