// ── Camera rig: directed moves (GSAP-tweened), controlled micro handheld, roll, focus
import * as THREE from 'three';
import { hand } from './util.js';

const _t = new THREE.Vector3(), _d = new THREE.Vector3();
export function makeRig(o) {
  return Object.assign({ x: 0, y: 0, z: 5, tx: 0, ty: 0, tz: 0, fov: 40, roll: 0, hand: 0.004, shake: 0, focus: 5, aperture: 0.5, motion: 0.6 }, o);
}
export function applyRig(camera, rig, t, aspect, P) {
  const h = rig.hand, s = rig.shake;
  const sx = hand(t, 1) * h + (s ? (Math.sin(t * 61.0) * 0.5 + Math.sin(t * 37.3) * 0.5) * s : 0);
  const sy = hand(t, 2) * h * 0.7 + (s ? (Math.sin(t * 53.1) * 0.5 + Math.sin(t * 29.7) * 0.5) * s : 0);
  camera.position.set(rig.x + sx, rig.y + sy, rig.z);
  _t.set(rig.tx + hand(t * 0.8, 3) * h * 0.6, rig.ty + hand(t * 0.8, 4) * h * 0.4, rig.tz);
  const portrait = aspect < 1 && P;
  if (portrait) {
    // portrait recomposition: re-dolly along the same line of sight (same direction, same move), then reframe
    _d.subVectors(camera.position, _t); const d = _d.length(), m = P.minD ?? 0.8;
    if (d > m) { camera.position.copy(_t).addScaledVector(_d.normalize(), m + (d - m) * (P.dolly ?? 1)); }
    camera.position.y += P.dy || 0; _t.y += P.ty || 0;
  }
  camera.up.set(0, 1, 0);
  camera.lookAt(_t);
  camera.rotateZ(rig.roll + hand(t * 0.5, 5) * h * 0.25);
  // keep horizontal framing on narrow / portrait screens
  const base = rig.fov, k = portrait ? (P.k ?? 1.45) : aspect < 1.6 ? Math.min(1.9, Math.pow(1.6 / aspect, 0.72)) : 1;
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base) / 2) * k));
  if (Math.abs(camera.fov - fov) > 1e-4 || camera.aspect !== aspect) { camera.fov = fov; camera.aspect = aspect; camera.updateProjectionMatrix(); }
}
