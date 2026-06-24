export class UIManager {
  constructor(gameState) {
    this.gameState = gameState
    this.selfieStream = null
    this.selfieVideoEl = null
    this.inSelfieMode = false

    // Set by threejs-scene-init to trigger 3D selfie transition
    this._startSelfieMode = null

    this.scoreText = document.getElementById('score-text')
    this.progressText = document.getElementById('progress-text')
    this.clueText = document.getElementById('clue-text')

    this.onboardingScreen = document.getElementById('onboarding-screen')
    this.onboardingBtn = document.getElementById('onboarding-btn')

    this.foundModal = document.getElementById('found-modal')
    this.foundTitle = document.getElementById('found-title')
    this.foundBody = document.getElementById('found-body')
    this.foundPoints = document.getElementById('found-points')
    this.foundBtn = document.getElementById('found-btn')

    this.shutterContainer = document.getElementById('shutter-container')
    this.shutterBtn = document.getElementById('shutter-btn')
    this.flashContainer = document.getElementById('flash-container')

    this.selfieBtnContainer = document.getElementById('selfie-btn-container')
    this.selfieBtn = document.getElementById('selfie-btn')

    this.previewModal = document.getElementById('preview-modal')
    this.previewImg = document.getElementById('preview-img')
    this.shareBtn = document.getElementById('share-btn')
    this.downloadBtn = document.getElementById('download-btn')
    this.closePreviewBtn = document.getElementById('close-preview-btn')

    this.gameoverModal = document.getElementById('gameover-modal')
    this.promoCodeText = document.getElementById('promo-code')
    this.claimEmail = document.getElementById('claim-email')
    this.claimBtn = document.getElementById('claim-btn')

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
      this.shutterBtn.addEventListener('click', () => this.triggerShutterCapture())
    }

    // "Take Selfie" button — transitions from AR placement to front-camera selfie
    if (this.selfieBtn) {
      this.selfieBtn.addEventListener('click', () => {
        this.hideSelfieButton()
        if (this._startSelfieMode) this._startSelfieMode()
        this.enterSelfieMode()
      })
    }

    if (this.closePreviewBtn) {
      this.closePreviewBtn.addEventListener('click', () => {
        this.hidePreviewModal()
        if (this.inSelfieMode) {
          this.showShutterButton()
          this.updateClue('Strike a pose with the mascot and tap the shutter!')
        }
      })
    }
  }

  // --- HUD ---

  updateHUD(score, progressCount, totalCount, nextClue) {
    if (this.scoreText) this.scoreText.innerText = `${score} PTS`
    if (this.progressText) this.progressText.innerText = `${progressCount}/${totalCount}`
    if (this.clueText) this.clueText.innerText = nextClue
  }

  updateClue(text) {
    if (this.clueText) this.clueText.innerText = text
  }

  // --- Modals ---

  showFoundModal(title, body, points, onContinue) {
    if (!this.foundModal) return
    this.foundTitle.innerText = title
    this.foundBody.innerText = body
    this.foundPoints.innerText = `+${points}`

    const newBtn = this.foundBtn.cloneNode(true)
    this.foundBtn.parentNode.replaceChild(newBtn, this.foundBtn)
    this.foundBtn = newBtn
    this.foundBtn.addEventListener('click', () => {
      this.foundModal.classList.remove('active')
      if (onContinue) onContinue()
    })
    this.foundModal.classList.add('active')
  }

  // --- Selfie Button (shown after mascot placed, before front camera) ---

  showSelfieButton() {
    if (this.selfieBtnContainer) this.selfieBtnContainer.style.display = 'flex'
  }

  hideSelfieButton() {
    if (this.selfieBtnContainer) this.selfieBtnContainer.style.display = 'none'
  }

  // --- Selfie Mode (front camera) ---

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

      this.showShutterButton()
      this.updateClue('Strike a pose with the mascot and tap the shutter!')
    } catch (err) {
      console.error('Failed to start front camera:', err)
      this.showShutterButton()
    }
  }

  // --- Shutter ---

  showShutterButton() {
    if (this.shutterContainer) this.shutterContainer.style.display = 'flex'
  }

  hideShutterButton() {
    if (this.shutterContainer) this.shutterContainer.style.display = 'none'
  }

  triggerShutterCapture() {
    if (this.flashContainer) {
      this.flashContainer.style.opacity = '1'
      setTimeout(() => { this.flashContainer.style.opacity = '0' }, 150)
    }

    const video = this.inSelfieMode ? this.selfieVideoEl : document.querySelector('video')
    const webglCanvas = document.getElementById('camerafeed')
    if (!video || !webglCanvas) return

    const captureCanvas = document.createElement('canvas')
    const ctx = captureCanvas.getContext('2d')
    captureCanvas.width = video.videoWidth || window.innerWidth
    captureCanvas.height = video.videoHeight || window.innerHeight

    if (this.inSelfieMode) {
      ctx.save()
      ctx.translate(captureCanvas.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height)
      ctx.restore()
    } else {
      ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height)
    }

    ctx.drawImage(webglCanvas, 0, 0, captureCanvas.width, captureCanvas.height)

    const dataUrl = captureCanvas.toDataURL('image/jpeg')
    this.showPreviewModal(dataUrl, captureCanvas)
  }

  // --- Preview Modal ---

  showPreviewModal(dataUrl, canvas) {
    if (!this.previewModal) return
    this.previewImg.src = dataUrl
    this.hideShutterButton()

    const newShareBtn = this.shareBtn.cloneNode(true)
    this.shareBtn.parentNode.replaceChild(newShareBtn, this.shareBtn)
    this.shareBtn = newShareBtn
    this.shareBtn.addEventListener('click', () => {
      canvas.toBlob((blob) => {
        const file = new File([blob], 'mascot_selfie.jpg', {type: 'image/jpeg'})
        if (navigator.share && navigator.canShare({files: [file]})) {
          navigator.share({
            files: [file],
            title: 'Mascot Selfie!',
            text: 'Check out my photo with the team mascot!'
          }).then(() => this.handlePhotoConfirmed())
            .catch(err => console.warn('Share cancelled:', err))
        } else {
          alert('Web Share not supported. Use "Save to Device" instead.')
        }
      }, 'image/jpeg')
    })

    const newDownloadBtn = this.downloadBtn.cloneNode(true)
    this.downloadBtn.parentNode.replaceChild(newDownloadBtn, this.downloadBtn)
    this.downloadBtn = newDownloadBtn
    this.downloadBtn.addEventListener('click', () => {
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = 'mascot_selfie.jpg'
      link.click()
      this.handlePhotoConfirmed()
    })

    this.previewModal.classList.add('active')
  }

  hidePreviewModal() {
    if (this.previewModal) this.previewModal.classList.remove('active')
  }

  handlePhotoConfirmed() {
    this.hidePreviewModal()
    const reward = this.gameState.completePhotoCapture()
    if (reward) {
      this.updateHUD(
        reward.totalScore,
        this.gameState.scannedTargets.length,
        this.gameState.totalTargets,
        this.gameState.getCurrentClue()
      )
      this.showFoundModal(reward.title, reward.description, reward.points, () => {
        if (reward.isFinished) {
          this.showGameOverModal('QUEST-HERO-77', (email) => {
            this.syncUserDataWithBackend(email, reward.totalScore)
          })
        }
      })
    }
  }

  // --- Game Over ---

  showGameOverModal(promoCode, onClaim) {
    if (!this.gameoverModal) return
    this.promoCodeText.innerText = promoCode
    const newBtn = this.claimBtn.cloneNode(true)
    this.claimBtn.parentNode.replaceChild(newBtn, this.claimBtn)
    this.claimBtn = newBtn
    this.claimBtn.disabled = false
    this.claimBtn.innerText = 'Enter Giveaway'
    this.claimBtn.addEventListener('click', (e) => {
      e.preventDefault()
      const email = this.claimEmail.value
      if (!email || !email.includes('@')) {
        alert('Please enter a valid email address!')
        return
      }
      if (onClaim) onClaim(email)
    })
    this.gameoverModal.classList.add('active')
  }

  syncUserDataWithBackend(email, score) {
    this.claimBtn.innerText = 'Syncing...'
    this.claimBtn.disabled = true
    setTimeout(() => {
      console.log(`[Firebase DB] Logged: ${email}, Score: ${score}`)
      alert(`Confirmed! Code QUEST-HERO-77 registered to ${email}.`)
      this.hideAllModals()
    }, 1500)
  }

  hideAllModals() {
    if (this.foundModal) this.foundModal.classList.remove('active')
    if (this.gameoverModal) this.gameoverModal.classList.remove('active')
    if (this.previewModal) this.previewModal.classList.remove('active')
    this.hideShutterButton()
    this.hideSelfieButton()
  }
}
