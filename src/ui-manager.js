// UIManager manages HTML/CSS screen updates, HUD metrics, and modal dialogs.

export class UIManager {
  constructor(gameState, onCaptureDone) {
    this.gameState = gameState
    this.onCaptureDone = onCaptureDone

    // Cache DOM element references
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
    // 1. Onboarding start button
    if (this.onboardingBtn) {
      this.onboardingBtn.addEventListener('click', () => {
        if (this.onboardingScreen) {
          this.onboardingScreen.style.opacity = '0'
          setTimeout(() => {
            this.onboardingScreen.style.display = 'none'
          }, 300)
        }
      })
    }

    // 2. Shutter button capture action
    if (this.shutterBtn) {
      this.shutterBtn.addEventListener('click', () => {
        this.triggerShutterCapture()
      })
    }

    // 3. Close preview button
    if (this.closePreviewBtn) {
      this.closePreviewBtn.addEventListener('click', () => {
        this.hidePreviewModal()
        // If they close preview without claiming, reset the clue text to prompt them
        this.updateHUD(
          this.gameState.score,
          this.gameState.scannedTargets.length,
          this.gameState.totalTargets,
          this.gameState.getCurrentClue()
        )
      })
    }
  }

  // Updates stats and clues on the active HUD overlay
  updateHUD(score, progressCount, totalCount, nextClue) {
    if (this.scoreText) {
      this.scoreText.innerText = `${score} PTS`
    }
    if (this.progressText) {
      this.progressText.innerText = `${progressCount}/${totalCount}`
    }
    if (this.clueText) {
      this.clueText.innerText = nextClue
    }
  }

  // Displays popup when a target is successfully scanned
  showFoundModal(title, body, points, onContinue) {
    if (!this.foundModal) return

    this.foundTitle.innerText = title
    this.foundBody.innerText = body
    this.foundPoints.innerText = `+${points}`

    // Remove any old event listeners
    const newBtn = this.foundBtn.cloneNode(true)
    this.foundBtn.parentNode.replaceChild(newBtn, this.foundBtn)
    this.foundBtn = newBtn

    // Register close logic
    this.foundBtn.addEventListener('click', () => {
      this.foundModal.classList.remove('active')
      if (onContinue) onContinue()
    })

    this.foundModal.classList.add('active')
  }

  // Show camera shutter button for selfies
  showShutterButton() {
    if (this.shutterContainer) {
      this.shutterContainer.style.display = 'flex'
    }
  }

  // Hides shutter button
  hideShutterButton() {
    if (this.shutterContainer) {
      this.shutterContainer.style.display = 'none'
    }
  }

  // Captures and merges camera video feed and WebGL canvas overlay
  triggerShutterCapture() {
    // 1. Trigger camera flash visual overlay
    if (this.flashContainer) {
      this.flashContainer.style.opacity = '1'
      setTimeout(() => {
        this.flashContainer.style.opacity = '0'
      }, 150)
    }

    // 2. Perform canvas screen capture merging
    const video = document.querySelector('video')
    const webglCanvas = document.getElementById('camerafeed')
    
    if (!video || !webglCanvas) {
      alert('Error: Camera stream not detected!')
      return
    }

    const captureCanvas = document.createElement('canvas')
    const ctx = captureCanvas.getContext('2d')
    
    // Set matching dimensions
    captureCanvas.width = video.videoWidth || window.innerWidth
    captureCanvas.height = video.videoHeight || window.innerHeight

    // Draw background webcam stream frame
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height)
    
    // Draw foreground 3D WebGL elements
    ctx.drawImage(webglCanvas, 0, 0, captureCanvas.width, captureCanvas.height)

    // Convert the combined frame to data URL image
    const dataUrl = captureCanvas.toDataURL('image/jpeg')
    this.showPreviewModal(dataUrl, captureCanvas)
  }

  // Show photo preview modal
  showPreviewModal(dataUrl, canvas) {
    if (!this.previewModal) return

    this.previewImg.src = dataUrl
    this.hideShutterButton()

    // Setup share button logic
    const newShareBtn = this.shareBtn.cloneNode(true)
    this.shareBtn.parentNode.replaceChild(newShareBtn, this.shareBtn)
    this.shareBtn = newShareBtn

    this.shareBtn.addEventListener('click', () => {
      canvas.toBlob((blob) => {
        const file = new File([blob], 'mascot_selfie.jpg', { type: 'image/jpeg' })
        
        if (navigator.share && navigator.canShare({ files: [file] })) {
          navigator.share({
            files: [file],
            title: 'Mascot Selfie Checkpoint!',
            text: 'Look at my photo with the team mascot at the game!'
          }).then(() => {
            this.handlePhotoConfirmed()
          }).catch(err => {
            console.warn('Native share failed or cancelled:', err)
          })
        } else {
          // Fallback: Copy to clipboard or alert
          alert('Web Share is not supported on this browser. Tapping "Save Photo" will download it directly!')
          this.handlePhotoConfirmed()
        }
      }, 'image/jpeg')
    })

    // Setup download button logic
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

  // Complete the quest milestone upon saving/sharing
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

      this.showFoundModal(
        reward.title,
        reward.description,
        reward.points,
        () => {
          if (reward.isFinished) {
            // Generate a mock unique code representing the team sponsor gate
            this.showGameOverModal('QUEST-HERO-77', (email) => {
              // MOCK FIREBASE BACKEND SYNC
              this.syncUserDataWithBackend(email, reward.totalScore)
            })
          }
        }
      )
    }
  }

  // Mock server backend sync representing a Firestore submission
  syncUserDataWithBackend(email, score) {
    this.claimBtn.innerText = 'Syncing...'
    this.claimBtn.disabled = true

    setTimeout(() => {
      console.log(`[Firebase DB] Logged completion for: ${email}, Score: ${score}`)
      alert(`Backend Sync Confirmed!\nUnique Promo Code: QUEST-HERO-77 registered to ${email}.\nShow this at the concession stand for your 15% discount!`)
      this.hideAllModals()
    }, 1500)
  }

  hidePreviewModal() {
    if (this.previewModal) {
      this.previewModal.classList.remove('active')
    }
  }

  // Displays game completion screen and email entry form
  showGameOverModal(promoCode, onClaim) {
    if (!this.gameoverModal) return

    this.promoCodeText.innerText = promoCode

    // Remove old listeners
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

      if (onClaim) {
        onClaim(email)
      }
    })

    this.gameoverModal.classList.add('active')
  }

  // Hide all modals
  hideAllModals() {
    if (this.foundModal) this.foundModal.classList.remove('active')
    if (this.gameoverModal) this.gameoverModal.classList.remove('active')
    if (this.previewModal) this.previewModal.classList.remove('active')
    this.hideShutterButton()
  }
}
