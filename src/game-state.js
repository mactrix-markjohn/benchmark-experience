// GameState manages scores, scanned targets, progress, and local persistence.

export class GameState {
  constructor() {
    this.score = 0
    this.scannedTargets = [] // List of scanned target names
    this.totalTargets = 1
    this.photoCaptured = false

    // Target configuration mapping target name to its rewards and game metadata
    this.targetsConfig = {
      'image-target-atomic': {
        title: 'Mascot Discovered! 🐯',
        description: 'You scanned the Mascot Decal! The life-sized Astronaut mascot has spawned in world space. Stand next to him and take a photo!',
        points: 150,
        nextClue: 'Objective: Stand next to the mascot and tap the shutter button to take a selfie!',
      }
    }

    this.loadFromLocalStorage()
  }

  // Load progress from localStorage
  loadFromLocalStorage() {
    try {
      const storedScanned = localStorage.getItem('benchmark_scanned_targets')
      const storedScore = localStorage.getItem('benchmark_score')
      const storedPhoto = localStorage.getItem('benchmark_photo_captured')
      
      if (storedScanned) {
        this.scannedTargets = JSON.parse(storedScanned)
      }
      if (storedScore) {
        this.score = parseInt(storedScore, 10) || 0
      }
      if (storedPhoto) {
        this.photoCaptured = storedPhoto === 'true'
      }
    } catch (e) {
      console.warn('LocalStorage is not available:', e)
    }
  }

  // Save progress to localStorage
  saveToLocalStorage() {
    try {
      localStorage.setItem('benchmark_scanned_targets', JSON.stringify(this.scannedTargets))
      localStorage.setItem('benchmark_score', this.score.toString())
      localStorage.setItem('benchmark_photo_captured', this.photoCaptured.toString())
    } catch (e) {
      console.warn('Unable to save to LocalStorage:', e)
    }
  }

  // Check if target has already been scanned
  isTargetScanned(targetName) {
    return this.scannedTargets.includes(targetName)
  }

  // Try scanning a target. Returns reward data if successful, null if already scanned or invalid.
  scanTarget(targetName) {
    if (!this.targetsConfig[targetName]) {
      return null
    }

    if (this.isTargetScanned(targetName)) {
      return null
    }

    this.scannedTargets.push(targetName)
    this.score += this.targetsConfig[targetName].points
    this.saveToLocalStorage()

    const targetData = this.targetsConfig[targetName]
    return {
      name: targetName,
      title: targetData.title,
      description: targetData.description,
      points: targetData.points,
      totalScore: this.score,
      progress: this.scannedTargets.length,
      nextClue: targetData.nextClue,
      isFinished: this.scannedTargets.length === this.totalTargets && this.photoCaptured
    }
  }

  // Completes the photo capture milestone, awarding points
  completePhotoCapture() {
    if (this.photoCaptured) return null
    
    this.photoCaptured = true
    this.score += 100 // Extra 100 points for taking the selfie
    this.saveToLocalStorage()

    return {
      title: 'AR Selfie Saved! 📸',
      description: 'You successfully captured and shared your photo with the mascot! You earned bonus points.',
      points: 100,
      totalScore: this.score,
      isFinished: this.scannedTargets.length === this.totalTargets
    }
  }

  // Get clue text based on current scan progress
  getCurrentClue() {
    if (this.scannedTargets.length === 0) {
      return 'Locate and scan the Mascot Decal (Atomic Cover) to start your quest!'
    }
    if (!this.photoCaptured) {
      return 'Objective: Frame your selfie with the mascot and tap the shutter button!'
    }
    return 'Quest Completed! Enter your email to claim your grand prize!'
  }

  // Reset progress
  resetGame() {
    this.score = 0
    this.scannedTargets = []
    this.photoCaptured = false
    this.saveToLocalStorage()
  }
}
