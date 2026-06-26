export class UIManager {
  constructor(gameState) {
    this.gameState = gameState

    this.instruction = document.getElementById('instruction')
    this.scorePill = document.getElementById('score-pill')

    this.menuScreen = document.getElementById('menu-screen')
    this.mascotCard = document.getElementById('mascot-card')
    this.maskCard = document.getElementById('mask-card')
    this.buzzerCard = document.getElementById('buzzer-card')
    this.arcadeCard = document.getElementById('arcade-card')
    this.classicCard = document.getElementById('classic-card')
    this.backBtn = document.getElementById('back-btn')

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
    if (this.shutterBtn) {
      this.shutterBtn.addEventListener('click', () => this.triggerCapture())
    }

    if (this.closePreviewBtn) {
      this.closePreviewBtn.addEventListener('click', () => {
        this.previewModal.classList.remove('active')
        this.shutterContainer.style.display = 'flex'
        this.showInstruction('Tap the shutter to take a photo!')
      })
    }
  }

  showMenu(unlockedType) {
    if (!this.menuScreen) return
    this.resetUI()
    this.menuScreen.style.display = 'flex'

    if (unlockedType === 'atomic') {
      if (this.mascotCard) this.mascotCard.style.display = 'block'
      if (this.maskCard) this.maskCard.style.display = 'block'
      if (this.buzzerCard) this.buzzerCard.style.display = 'none'
      if (this.arcadeCard) this.arcadeCard.style.display = 'none'
      if (this.classicCard) this.classicCard.style.display = 'none'
    } else if (unlockedType === 'power') {
      if (this.mascotCard) this.mascotCard.style.display = 'none'
      if (this.maskCard) this.maskCard.style.display = 'none'
      if (this.buzzerCard) this.buzzerCard.style.display = 'block'
      if (this.arcadeCard) this.arcadeCard.style.display = 'none'
      if (this.classicCard) this.classicCard.style.display = 'none'
    }
  }

  hideMenu() {
    if (this.menuScreen) this.menuScreen.style.display = 'none'
  }

  showBackButton(onBack) {
    if (!this.backBtn) return
    this.backBtn.style.display = 'block'
    
    // Replace listener cleanly
    const newBtn = this.backBtn.cloneNode(true)
    this.backBtn.parentNode.replaceChild(newBtn, this.backBtn)
    this.backBtn = newBtn
    
    this.backBtn.addEventListener('click', () => {
      if (onBack) onBack()
    })
  }

  hideBackButton() {
    if (this.backBtn) this.backBtn.style.display = 'none'
  }

  resetUI() {
    this.showInstruction('')
    if (this.shutterContainer) this.shutterContainer.style.display = 'none'
    if (this.scorePill) this.scorePill.style.display = 'none'
    if (this.foundOverlay) this.foundOverlay.classList.remove('active')
    if (this.previewModal) this.previewModal.classList.remove('active')
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

  showShutterButton(customText) {
    if (this.shutterContainer) this.shutterContainer.style.display = 'flex'
    this.showInstruction(customText || 'Stand next to the mascot and tap the shutter!')
  }

  triggerCapture() {
    if (this.flashEl) {
      this.flashEl.style.opacity = '1'
      setTimeout(() => { this.flashEl.style.opacity = '0' }, 120)
    }

    // The WebGL canvas already has the camera feed + 3D overlay composited
    // by 8th Wall's GlTextureRenderer, so just capture it directly
    const gl = document.getElementById('camerafeed')
    if (!gl) return

    const dataUrl = gl.toDataURL('image/jpeg', 0.92)
    this.showPreview(dataUrl, gl)
  }

  showPreview(dataUrl) {
    if (!this.previewModal) return
    this.previewImg.src = dataUrl
    this.shutterContainer.style.display = 'none'
    this.showInstruction('')

    const newShare = this.shareBtn.cloneNode(true)
    this.shareBtn.parentNode.replaceChild(newShare, this.shareBtn)
    this.shareBtn = newShare
    this.shareBtn.addEventListener('click', () => {
      // Convert dataUrl to blob for sharing
      fetch(dataUrl).then(r => r.blob()).then(blob => {
        const file = new File([blob], 'mascot_photo.jpg', {type: 'image/jpeg'})
        if (navigator.share && navigator.canShare({files: [file]})) {
          navigator.share({files: [file], title: 'Mascot Photo!'}).catch(() => {})
        }
      })
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
