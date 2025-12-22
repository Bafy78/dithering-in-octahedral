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
renderer.setPixelRatio(window.devicePixelRatio);
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

const uLightDir = uniform(new THREE.Vector3(0, 0, 1));

const V_view = positionView.negate().normalize();

// Load blue noise texture
const loader = new THREE.TextureLoader();
const blueNoiseMap = loader.load('./blue_noise_64.png')
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
    amp: uNoiseAmp
});

const Spec_target = specularShader({ N: N_target, V: V_view, L: uLightDir, roughness: uRoughness });

const material = new WEBGPU.MeshBasicNodeMaterial();
material.colorNode = Spec_target;

const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), material);
scene.add(mesh);


// --- 5. GUI & RENDER ---
const gui = new GUI({ title: 'Research Controls' });

const params = {
    encoding: 'Ground Truth',
    noise: 'Blue Noise',
    distribution: 'Rectangular',
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

gui.add(params, 'bitDepth', 2, 16, 1)
   .name('Bit Depth')
   .onChange(v => uBitDepth.value = v);
gui.add(params, 'roughness', 0.01, 0.5).onChange(v => uRoughness.value = v);

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
   
gui.add(params, 'saveImage').name("📸 Save Frame for Python");


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
window.addEventListener('pointerdown', (e) => {
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

// Helper to download the frame
function saveCanvas() {
    renderer.domElement.toBlob(blob => {
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style.display = 'none';
        const url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = `capture_${Date.now()}.png`;
        a.click();
        window.URL.revokeObjectURL(url);
    });
}