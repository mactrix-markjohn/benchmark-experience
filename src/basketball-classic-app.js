import './basketball-components/basketball.css'

import {responsiveImmersiveComponent} from './basketball-components/responsive-immersive'
AFRAME.registerComponent('responsive-immersive', responsiveImmersiveComponent)

import {gltfPhysicsObjectComponent} from './basketball-components/glb-physics-object'
AFRAME.registerComponent('physics-object', gltfPhysicsObjectComponent)

import {swipeToShootComponent} from './basketball-components/swipe-to-shoot'
AFRAME.registerComponent('swipe-to-shoot', swipeToShootComponent)

import {proximityTriggerComponent} from './basketball-components/basketball-proximity'
AFRAME.registerComponent('proximity-trigger', proximityTriggerComponent)

import {handJointPositionComponent} from './basketball-components/vp-hand-physics-collider'
AFRAME.registerComponent('hand-joint-position', handJointPositionComponent)

import {onboardingComponent} from './basketball-components/onboarding'
AFRAME.registerComponent('onboarding', onboardingComponent)

import {scoreComponent} from './basketball-components/score'
AFRAME.registerComponent('proximity-score', scoreComponent)

import {autoplayVideoComponent} from './basketball-components/autoplay-video'
AFRAME.registerComponent('auto-play-video', autoplayVideoComponent)

import {controllersComponent} from './basketball-components/controllers'
AFRAME.registerComponent('controller-handler', controllersComponent)

import {cameraProximityComponent} from './basketball-components/player-proximity'
AFRAME.registerComponent('camera-proximity-trigger', cameraProximityComponent)

import {restitutionComponent} from './basketball-components/bounce'
AFRAME.registerComponent('set-restitution', restitutionComponent)

import {gltfPhysicsObjectComponent2} from './basketball-components/physics-object-bounce'
AFRAME.registerComponent('physics-object2', gltfPhysicsObjectComponent2)
