import * as THREE from 'three';
import { wgslFn, normalView, cameraPosition, positionView, vec3, float, uniform, mix, modelViewMatrix } from 'three/tsl';
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

// (A) The Independent Variable: RG8 Logic
const rg8Shader = wgslFn(`
  fn encode_rg8(n: vec3f) -> vec3f {
    let n_unorm = n * 0.5 + 0.5;
    let q_x = floor(n_unorm.x * 255.0) / 255.0;
    let q_y = floor(n_unorm.y * 255.0) / 255.0;
    let x = q_x * 2.0 - 1.0;
    let y = q_y * 2.0 - 1.0;
    let z_sq = 1.0 - (x * x) - (y * y);
    let z = sqrt(max(z_sq, 0.0));
    return normalize(vec3f(x, y, z));
  }
`);

// (B) The Measurement Tool: Specular Visualization
const specularShader = wgslFn(`
  fn visualize_specular(N: vec3f, V: vec3f, L: vec3f, roughness: f32) -> vec3f {
      let H = normalize(L + V);
      let NdotH = max(dot(N, H), 0.0);
      
      // High power falloff to highlight banding
      let shininess = 2.0 / (pow(roughness, 4.0) + 0.001) - 2.0;
      let spec = pow(NdotH, shininess);
      
      return vec3f(spec); 
  }
`);

// --- 3. WIRING THE NODES ---

const V_view = positionView.negate().normalize();
const L_world = vec3(1.0, 1.0, 1.0).normalize();
const L_view = L_world.transformDirection(modelViewMatrix).normalize();

const roughness = float(0.2); 

const N_groundTruth = normalView;
const N_quantized = rg8Shader({ n: normalView });

const uMix = uniform(1.0);
const N_final = mix(N_groundTruth, N_quantized, uMix);

const specularIntensity = specularShader({ 
    N: N_final, 
    V: V_view, 
    L: L_view, 
    roughness: roughness 
});

// --- 4. OBJECT CREATION ---
const material = new WEBGPU.MeshBasicNodeMaterial();
material.colorNode = specularIntensity; // Output the grayscale specular

const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), material); // High poly for smoothness
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
    uMix.value = uMix.value === 0 ? 1 : 0;
    console.log("Mode:", uMix.value === 0 ? "Ground Truth" : "RG8 Quantized");
});