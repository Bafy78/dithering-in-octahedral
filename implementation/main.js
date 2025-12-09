import * as THREE from 'three';
import { wgslFn, normalView, positionView, vec3, float, uniform, mix, step } from 'three/tsl';
import * as WEBGPU from 'three/webgpu'

// --- 1. BOILERPLATE SETUP ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10);
camera.position.z = 2;

const renderer = new WEBGPU.WebGPURenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio*4);
document.body.appendChild(renderer.domElement);

// --- 2. DEFINE WGSL FUNCTIONS ---

// The First Independent Variable: RG8 Logic
const rg8Shader = wgslFn(`
  fn encode_rg8(n: vec3f) -> vec3f {
    let n_unorm = n * 0.5 + 0.5;
    let q_x = round(n_unorm.x * 255.0) / 255.0;
    let q_y = round(n_unorm.y * 255.0) / 255.0;
    let x = q_x * 2.0 - 1.0;
    let y = q_y * 2.0 - 1.0;
    let z_sq = 1.0 - (x * x) - (y * y);
    let z = sqrt(max(z_sq, 0.0));
    return normalize(vec3f(x, y, z));
  }
`);

// The Second Independent Variable: Hemi-Oct RG8 Logic
const hemiOctShader = wgslFn(`
  fn encode_hemi_oct(n_in: vec3f) -> vec3f {
    let l1_norm = abs(n_in.x) + abs(n_in.y) + n_in.z;
    let n = n_in / l1_norm;
    let u = n.x + n.y;
    let v = n.x - n.y;
    let uv_01 = vec2f(u, v) * 0.5 + 0.5;
    let q_uv = round(uv_01 * 255.0) / 255.0;

    let uv_recon = q_uv * 2.0 - 1.0;
    let temp_x = (uv_recon.x + uv_recon.y) * 0.5;
    let temp_y = (uv_recon.x - uv_recon.y) * 0.5;
    let z_l1 = 1.0 - abs(temp_x) - abs(temp_y);
    return normalize(vec3f(temp_x, temp_y, z_l1));
  }
`);

// The Measurement Tool: Specular Visualization
const specularShader = wgslFn(`
  fn visualize_specular(N: vec3f, V: vec3f, L: vec3f, roughness: f32) -> vec3f {
    let H = normalize(L + V);
    let NdotH = max(dot(N, H), 0.0);
    
    let shininess = 2.0 / (pow(roughness, 4.0) + 0.001) - 2.0;
    let spec = pow(NdotH, shininess);
    
    return vec3f(spec); 
  }
`);

// --- 3. WIRING THE NODES ---

const V_view = positionView.negate().normalize();
const L_view = vec3(0.0, 0.0, 1.0);

const roughness = float(0.2); 

const N_groundTruth = normalView;
const N_quantized = rg8Shader({ n: normalView });
const N_hemiOct_quantized = hemiOctShader({ n_in: normalView });

const uMode = uniform(0); 

// Logic: 
const selectRG8 = step(0.5, uMode); 
const selectHemi = step(1.5, uMode);

// Cascaded Mix:
const N_intermediate = mix(N_groundTruth, N_quantized, selectRG8);
const N_final = mix(N_intermediate, N_hemiOct_quantized, selectHemi);

const specularIntensity = specularShader({ 
    N: N_final,
    V: V_view,
    L: L_view,
    roughness: roughness 
});

// --- 4. OBJECT CREATION ---
const material = new WEBGPU.MeshBasicNodeMaterial();
material.colorNode = specularIntensity;

const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 256), material);
scene.add(mesh);

// --- 5. RENDER LOOP ---
await renderer.init();
function animate() {
	renderer.render(scene, camera);
	requestAnimationFrame(animate);
}

animate();

// --- 6. INTERACTION ---
window.addEventListener('click', () => {
    uMode.value = (uMode.value + 1) % 3;
    const labels = [
        "Ground Truth (32-bit Float)", 
        "Cartesian RG8 (16-bit)", 
        "Hemi-Oct RG8 (16-bit)"
    ];
    console.log("Current Mode:", labels[uMode.value]);
});