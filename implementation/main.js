import * as THREE from 'three';
import { wgslFn, normalView, positionView, vec3, vec2, uniform, mix, step, abs, texture, screenCoordinate, sin, cos } from 'three/tsl';
import * as WEBGPU from 'three/webgpu';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import encodingShaderCode from './encoding.wgsl?raw';


// --- 1. BOILERPLATE ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10);
camera.position.z = 2.5;

const renderer = new WEBGPU.WebGPURenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);


// --- 2. WGSL FUNCTIONS ---
const encoderFn = wgslFn(encodingShaderCode);

const specularShader = wgslFn(`
  fn visualize_specular(N: vec3f, V: vec3f, L: vec3f, roughness: f32) -> vec3f {
    let H = normalize(L + V);
    let NdotH = max(dot(N, H), 0.0);
    // Standard Blinn-Phong approx for sharp highlights
    let shininess = 2.0 / (pow(roughness, 4.0) + 0.001) - 2.0; 
    let spec = pow(NdotH, shininess);
    return vec3f(spec); 
  }
`);


// --- 3. THE LAB CONTROLS ---
const uRoughness = uniform(0.15);
const uBitDepth = uniform(8.0);
const uNoiseAmp = uniform(1.0);

const uEncodingMode = uniform(0);
const uNoiseMode = uniform(0);
const uNoiseDist = uniform(0);
const uJWDMode = uniform(0);

const uLightDir = uniform(new THREE.Vector3(0, 0, 1));

const V_view = positionView.negate().normalize();

// Load blue noise texture
const loader = new THREE.TextureLoader();
const blueNoiseMap = loader.load('./blue_noise_64.png');
blueNoiseMap.wrapS = THREE.RepeatWrapping;
blueNoiseMap.wrapT = THREE.RepeatWrapping;
blueNoiseMap.minFilter = THREE.NearestFilter;
blueNoiseMap.magFilter = THREE.NearestFilter;
const blueNoiseSize = 64.0;
const noiseUV = screenCoordinate.xy.div(blueNoiseSize);
const offsetB = vec2(37.0, 17.0).div(blueNoiseSize);
const offsetC = vec2(59.0, 83.0).div(blueNoiseSize);
const s1 = texture(blueNoiseMap, noiseUV).x;
const s2 = texture(blueNoiseMap, noiseUV.add(offsetB)).x;
const s3 = texture(blueNoiseMap, noiseUV.add(offsetC)).x;
const noiseCombined = vec3(s1, s2, s3);


// --- 4. THE PIPELINE ---
const N_target = encoderFn({
    n: normalView,
    noise_in: noiseCombined,
    frag_pos: screenCoordinate.xy,
    bits: uBitDepth,
    enc_mode: uEncodingMode,
    noise_mode: uNoiseMode,
    dist_mode: uNoiseDist,
    jwd_mode: uJWDMode,
    amp: uNoiseAmp
});

const Spec_target = specularShader({ N: N_target, V: V_view, L: uLightDir, roughness: uRoughness });

const material = new WEBGPU.MeshBasicNodeMaterial();
material.colorNode = Spec_target;

const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 256), material);
scene.add(mesh);


// --- 5. GUI & RENDER ---
const gui = new GUI({ title: 'Research Controls' });

const params = {
    encoding: 'Ground Truth',
    noise: 'Blue Noise',
    distribution: 'Rectangular',
    jwd: 'Off',
    bitDepth: 8,
    roughness: 0.15,
    azimuth: 0.0,
    elevation: 0.0,
    noiseAmp: 1.0,
    saveImage: () => saveCanvas()
};

gui.add(params, 'encoding', ['Ground Truth', 'Cartesian', 'Hemi-Oct'])
   .name('Encoding Type')
   .onChange(v => {
       if (v === 'Ground Truth') uEncodingMode.value = 0;
       if (v === 'Cartesian')    uEncodingMode.value = 1;
       if (v === 'Hemi-Oct')     uEncodingMode.value = 2;
   });

gui.add(params, 'noise', ['Blue Noise', 'IGN'])
   .name('Dither Pattern')
   .onChange(v => {
       if (v === 'Blue Noise') uNoiseMode.value = 0;
       if (v === 'IGN')        uNoiseMode.value = 1;
   });

gui.add(params, 'distribution', ['Rectangular', 'Triangular'])
    .name('Distribution')
    .onChange(v => {
        uNoiseDist.value = v === 'Rectangular' ? 0 : 1;
    });

gui.add(params, 'jwd', ['Off', 'JWD', 'AJWD'])
   .name('JWD Mode')
   .onChange(v => {
       if (v === 'Off')  uJWDMode.value = 0;
       if (v === 'JWD')  uJWDMode.value = 1;
       if (v === 'AJWD') uJWDMode.value = 2;
   });

gui.add(params, 'bitDepth', 2, 16, 1)
   .name('Bit Depth')
   .onChange(v => uBitDepth.value = v);
const maxRoughness = 0.5;
gui.add(params, 'roughness', 0.01, maxRoughness).onChange(v => uRoughness.value = v);

const folderLight = gui.addFolder('Light Position');
function updateLightDirection() {
    const theta = params.azimuth;
    const phi = params.elevation;

    const x = Math.sin(theta) * Math.cos(phi);
    const y = Math.sin(phi);
    const z = Math.cos(theta) * Math.cos(phi);

    uLightDir.value.set(x, y, z).normalize(); 
}
folderLight.add(params, 'azimuth', -Math.PI, Math.PI)
    .name('Azimuth (X)')
    .onChange(updateLightDirection);
folderLight.add(params, 'elevation', -Math.PI / 2, Math.PI / 2)
    .name('Elevation (Y)')
    .onChange(updateLightDirection);
updateLightDirection();

gui.add(params, 'noiseAmp', 0.0, 2.0)
   .name('Noise Amplitude')
   .onChange(v => uNoiseAmp.value = v);
   
gui.add(params, 'saveImage').name("📸 Save Cropped Frame");


// --- 6. INTERACTION (Click to move light) ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let isDragging = false;

function updateLightFromPointer(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(mesh);

    if (intersects.length > 0) {
        const point = intersects[0].point;
        const normal = point.clone().normalize(); 
        const viewDir = point.clone().sub(camera.position).normalize();
        const lightDir = viewDir.reflect(normal).normalize();

        uLightDir.value.copy(lightDir);

        const phi = Math.asin(lightDir.y); 
        const theta = Math.atan2(lightDir.x, lightDir.z);
        params.azimuth = theta;
        params.elevation = phi;
        folderLight.controllers.forEach(c => c.updateDisplay());
    }
}

// Event Listeners
renderer.domElement.addEventListener('pointerdown', (e) => {
    isDragging = true;
    updateLightFromPointer(e);
});
window.addEventListener('pointermove', (e) => {
    if (isDragging) {
        updateLightFromPointer(e);
    }
});
window.addEventListener('pointerup', () => {
    isDragging = false;
});


// --- 7. RENDER LOOP ---
await renderer.init();

function animate() {
	renderer.render(scene, camera);
	requestAnimationFrame(animate);
}
animate();

// --- 8. IMAGE SAVING HELPERS ---

// Helper to trigger download
function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    document.body.appendChild(a);
    a.style.display = 'none';
    const url = window.URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Main saving function with cropping logic
function saveCanvas() {
    const canvas = renderer.domElement;
    const width = canvas.width;
    const height = canvas.height;

    // --- 1. Generate Filename ---
    const enc = params.encoding.replace(/\s+/g, '');
    const noise = params.noise.replace(/\s+/g, '');
    const dist = params.distribution === 'Rectangular' ? 'Rect' : 'Tri';
    const bits = params.bitDepth;
    const rough = params.roughness.toFixed(3);
    const noiseAmp = params.noiseAmp.toFixed(3);
    const az = (params.azimuth * 180 / Math.PI).toFixed(0);
    const el = (params.elevation * 180 / Math.PI).toFixed(0);
    const filename = `${enc}_${noise}_${dist}_${bits}b_R${rough}_NAmp${noiseAmp}_Az${az}El${el}.png`;

    // --- 2. Find Highlight Center (Iterative Parallax Correction) ---
    const L = uLightDir.value.clone().normalize();
    const camPos = camera.position.clone();
    
    // Initial Guess: Assume V is constant (infinite viewer approximation)
    let V = camPos.clone().normalize(); 
    let H = L.clone().add(V).normalize();
    
    // Refine 3 times (Newton's method style convergence)
    for (let i = 0; i < 3; i++) {
        const surfacePoint = H.clone();
        
        // Recalculate V from the specific surface point to the camera
        V = camPos.clone().sub(surfacePoint).normalize();
        
        // Recalculate H based on the new local V
        H = L.clone().add(V).normalize();
    }

    // Project the precise highlight point to Screen Space
    const highlightNDC = H.clone().project(camera);
    const centerX = (highlightNDC.x * 0.5 + 0.5) * width;
    const centerY = (-(highlightNDC.y) * 0.5 + 0.5) * height;

    // --- 3. Determine Crop Size (Same as before) ---
    const baseSize = 256;
    const roughnessScale = 1500; 
    let boxSize = baseSize + (params.roughness * roughnessScale);
    boxSize = Math.min(boxSize, Math.min(width, height));
    boxSize = Math.floor(boxSize);

    // --- 4. Perform Crop ---
    const halfSize = Math.floor(boxSize / 2);
    const srcX = Math.floor(centerX - halfSize);
    const srcY = Math.floor(centerY - halfSize);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = boxSize;
    tempCanvas.height = boxSize;
    const ctx = tempCanvas.getContext('2d');

    // Fill Black
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, boxSize, boxSize);

    // Calculate Intersection
    const drawSrcX = Math.max(0, srcX);
    const drawSrcY = Math.max(0, srcY);
    const drawSrcW = Math.min(width, srcX + boxSize) - drawSrcX;
    const drawSrcH = Math.min(height, srcY + boxSize) - drawSrcY;
    const drawDestX = drawSrcX - srcX;
    const drawDestY = drawSrcY - srcY;

    ctx.drawImage(
        canvas, 
        drawSrcX, drawSrcY, drawSrcW, drawSrcH, 
        drawDestX, drawDestY, drawSrcW, drawSrcH
    );
    tempCanvas.toBlob(blob => downloadBlob(blob, "CROP_" + filename));
}