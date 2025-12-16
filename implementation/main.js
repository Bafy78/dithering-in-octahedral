import * as THREE from 'three';
import { wgslFn, normalView, positionView, vec3, float, uniform, mix, step, abs, length, sin, cos } from 'three/tsl';
import * as WEBGPU from 'three/webgpu';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js'; // Standard UI lib

// --- 1. BOILERPLATE ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10); // Narrower FOV for focus
camera.position.z = 2.5;

const renderer = new WEBGPU.WebGPURenderer({ antialias: false }); // Disable AA to see raw noise
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// --- 2. WGSL FUNCTIONS ---
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
const uLightAzimuth = uniform(0.0);
const uLightElevation = uniform(0.0);
const theta = uLightAzimuth;
const phi = uLightElevation;
const lx = sin(theta).mul(cos(phi));
const ly = sin(phi);
const lz = cos(theta).mul(cos(phi));

// Modes: 0=Float32, 1=RG8, 2=HemiOct
const uMode = uniform(0); 
// Visualization: 0=Standard, 1=Difference Heatmap
const uVisMode = uniform(0); 

// Construct Light Vector from Slider Values
const L_dynamic = vec3(lx, ly, lz);
const V_view = positionView.negate().normalize();

// --- 4. THE PIPELINE ---

// A. Calculate Ground Truth
const N_gt = normalView;
const Spec_gt = specularShader({ N: N_gt, V: V_view, L: L_dynamic, roughness: uRoughness });

// B. Calculate Target (based on uMode)
const N_rg8 = rg8Shader({ n: normalView });
const N_hemi = hemiOctShader({ n_in: normalView });

// Selector Logic
const isRG8 = step(0.5, uMode).mul(step(uMode, 1.5));
const isHemi = step(1.5, uMode);

// Mix the Normal based on mode
const N_target = mix(
    mix(N_gt, N_rg8, isRG8),
    N_hemi, 
    isHemi
);

const Spec_target = specularShader({ N: N_target, V: V_view, L: L_dynamic, roughness: uRoughness });

// --- 5. THE MEASUREMENT LOGIC ---

// Calculate Delta: | GT_Spec - Target_Spec |
// We amplify it by 10.0 so we can actually see the tiny banding errors.
const errorHeatmap = abs(Spec_gt.sub(Spec_target)).mul(10.0); 

// Final Output Switch
// If VisMode is 0, show Target Specular. If 1, show Error Heatmap (Green)
const finalColor = mix(
    Spec_target, 
    vec3(0.0, 1.0, 0.0).mul(errorHeatmap.x),
    uVisMode
);

const material = new WEBGPU.MeshBasicNodeMaterial();
material.colorNode = finalColor;

const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 512, 512), material);
scene.add(mesh);

// --- 6. GUI & RENDER ---
// This is your "Virtual Lab Bench"
const gui = new GUI({ title: 'Research Controls' });

const params = {
    mode: 'Ground Truth',
    visualization: 'Standard',
    roughness: 0.15,
    azimuth: 0.0,   // Changed from lightX
    elevation: 0.0, // Changed from lightY
    rotateX: 0.0,
    rotateY: 0.0,
    saveImage: () => saveCanvas()
};

gui.add(params, 'mode', ['Ground Truth', 'Cartesian RG8', 'Hemi-Oct RG8']).onChange(v => {
    if(v === 'Ground Truth') uMode.value = 0;
    if(v === 'Cartesian RG8') uMode.value = 1;
    if(v === 'Hemi-Oct RG8') uMode.value = 2;
});

gui.add(params, 'visualization', ['Standard', 'Difference (x10)']).onChange(v => {
    uVisMode.value = v === 'Standard' ? 0 : 1;
});

gui.add(params, 'roughness', 0.01, 0.5).onChange(v => uRoughness.value = v);
const folderLight = gui.addFolder('Light Position');
// Allow full 360 rotation (2*PI) horizontally
folderLight.add(params, 'azimuth', -Math.PI, Math.PI)
    .name('Azimuth (X)')
    .onChange(v => uLightAzimuth.value = v);

// Allow +/- 90 degrees vertically
folderLight.add(params, 'elevation', -Math.PI / 2, Math.PI / 2)
    .name('Elevation (Y)')
    .onChange(v => uLightElevation.value = v);

const folderMesh = gui.addFolder('Mesh Rotation');
folderMesh.add(params, 'rotateX', 0, Math.PI * 2).onChange(v => mesh.rotation.x = v);
folderMesh.add(params, 'rotateY', 0, Math.PI * 2).onChange(v => mesh.rotation.y = v);

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