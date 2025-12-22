import * as THREE from 'three';
import { wgslFn, normalView, positionView, vec3, uniform, mix, step, abs, texture, screenCoordinate, sin, cos } from 'three/tsl';
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
const uVisMode = uniform(0);

const uLightAzimuth = uniform(0.0);
const uLightElevation = uniform(0.0);
const theta = uLightAzimuth;
const phi = uLightElevation;
const lx = sin(theta).mul(cos(phi));
const ly = sin(phi);
const lz = cos(theta).mul(cos(phi));

// Construct Light Vector from Slider Values
const L_dynamic = vec3(lx, ly, lz);
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
const noiseSample = texture(blueNoiseMap, noiseUV);

// --- 4. THE PIPELINE ---
const N_gt = normalView;
const Spec_gt = specularShader({ N: N_gt, V: V_view, L: L_dynamic, roughness: uRoughness });

const N_target = encoderFn({
    n: normalView,
    noise_in: noiseSample,
    frag_pos: screenCoordinate.xy,
    bits: uBitDepth,
    enc_mode: uEncodingMode,
    noise_mode: uNoiseMode,
    amp: uNoiseAmp
});

const Spec_target = specularShader({ N: N_target, V: V_view, L: L_dynamic, roughness: uRoughness });

// --- 5. THE MEASUREMENT LOGIC ---

const rawError = abs(Spec_gt.sub(Spec_target));
const heat = rawError.pow(0.5).mul(2.0);

// Simple Heatmap: Black -> Blue -> Green -> Red
const heatColor = mix(
    vec3(0.0, 0.0, 1.0),
    vec3(1.0, 0.0, 0.0),
    step(0.5, heat)
);

const finalColor = mix(
    Spec_target, 
    heatColor,
    uVisMode
);

const material = new WEBGPU.MeshBasicNodeMaterial();
material.colorNode = finalColor;

const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 512, 512), material);
scene.add(mesh);

// --- 6. GUI & RENDER ---
const gui = new GUI({ title: 'Research Controls' });

const params = {
    encoding: 'Ground Truth',
    noise: 'None',
    visualization: 'Standard',
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

gui.add(params, 'noise', ['None', 'Blue Noise', 'IGN'])
   .name('Dither Pattern')
   .onChange(v => {
       if (v === 'None')       uNoiseMode.value = 0;
       if (v === 'Blue Noise') uNoiseMode.value = 1;
       if (v === 'IGN')        uNoiseMode.value = 2;
   });

gui.add(params, 'visualization', ['Standard', 'Difference (x10)']).onChange(v => {
    uVisMode.value = v === 'Standard' ? 0 : 1;
});

gui.add(params, 'bitDepth', 2, 16, 1)
   .name('Bit Depth')
   .onChange(v => uBitDepth.value = v);
gui.add(params, 'roughness', 0.01, 0.5).onChange(v => uRoughness.value = v);
const folderLight = gui.addFolder('Light Position');
folderLight.add(params, 'azimuth', -Math.PI, Math.PI)
    .name('Azimuth (X)')
    .onChange(v => uLightAzimuth.value = v);
folderLight.add(params, 'elevation', -Math.PI / 2, Math.PI / 2)
    .name('Elevation (Y)')
    .onChange(v => uLightElevation.value = v);

gui.add(params, 'noiseAmp', 0.0, 2.0)
   .name('Noise Amplitude')
   .onChange(v => uNoiseAmp.value = v);
   
gui.add(params, 'saveImage').name("📸 Save Frame for Python");

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
        a.download = `capture_${params.mode}_${Date.now()}.png`;
        a.click();
        window.URL.revokeObjectURL(url);
    });
}