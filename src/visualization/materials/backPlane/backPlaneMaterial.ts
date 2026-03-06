import * as THREE from 'three';

let sharedHalftoneTile: THREE.DataTexture | null = null;

function getHalftoneTile(): THREE.DataTexture {
  if (sharedHalftoneTile) return sharedHalftoneTile;

  const size = 32;
  const data = new Uint8Array(size * size * 4);
  const half = size * 0.5;
  const radius = size * 0.3;
  const feather = size * 0.04;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - half;
      const dy = y + 0.5 - half;
      const d = Math.sqrt(dx * dx + dy * dy);
      const t = THREE.MathUtils.clamp((d - radius) / Math.max(0.001, feather), 0, 1);
      const dot = 1 - t;
      const v = Math.floor(255 * dot);
      const idx = (y * size + x) * 4;
      data[idx + 0] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  sharedHalftoneTile = tex;
  return tex;
}

export function createBackPlaneMaterial(
  initialOpacity: number,
  layerPhase: number,
): THREE.MeshBasicMaterial {
  const halftone = getHalftoneTile().clone();
  halftone.needsUpdate = true;
  halftone.repeat.set(12, 18);
  halftone.offset.set(layerPhase * 0.13, layerPhase * 0.07);

  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.45, 0.48, 0.58),
    map: halftone,
    alphaMap: halftone,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  mat.opacity = initialOpacity;
  mat.userData.layerPhase = layerPhase;
  return mat;
}
