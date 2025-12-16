import * as THREE from 'three';
import { wgslFn, normalView, positionView, vec3, vec2, uv, uniform, mix, step, abs, texture, screenCoordinate, sin, cos } from 'three/tsl';
import * as WEBGPU from 'three/webgpu';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';

// --- 1. BOILERPLATE ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10);
camera.position.z = 2.5;

const renderer = new WEBGPU.WebGPURenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// --- 2. WGSL FUNCTIONS ---
const rg8Shader = wgslFn(`
  fn encode_rg8(n: vec3f, bits: f32) -> vec3f {
    let max_q = pow(2.0, bits) - 1.0; // Dynamic scale factor
    let n_unorm = n * 0.5 + 0.5;
    
    // Quantize
    let q_x = round(n_unorm.x * max_q) / max_q;
    let q_y = round(n_unorm.y * max_q) / max_q;
    
    // Reconstruct Z
    let x = q_x * 2.0 - 1.0;
    let y = q_y * 2.0 - 1.0;
    let z_sq = 1.0 - (x * x) - (y * y);
    let z = sqrt(max(z_sq, 0.0));
    return normalize(vec3f(x, y, z));
  }
`);

const hemiOctShader = wgslFn(`
  fn encode_hemi_oct(n_in: vec3f, bits: f32) -> vec3f {
    let max_q = pow(2.0, bits) - 1.0;
    
    let l1_norm = abs(n_in.x) + abs(n_in.y) + n_in.z;
    let n = n_in / l1_norm;
    let u = n.x + n.y;
    let v = n.x - n.y;
    let uv_01 = vec2f(u, v) * 0.5 + 0.5;

    // Quantize
    let q_uv = round(uv_01 * max_q) / max_q;

    // Decode
    let uv_recon = q_uv * 2.0 - 1.0;
    let temp_x = (uv_recon.x + uv_recon.y) * 0.5;
    let temp_y = (uv_recon.x - uv_recon.y) * 0.5;
    let z_l1 = 1.0 - abs(temp_x) - abs(temp_y);
    return normalize(vec3f(temp_x, temp_y, z_l1));
  }
`);

const hemiOctShaderDithered = wgslFn(`
  fn encode_hemi_oct_dithered(n_in: vec3f, noise: vec3f, bits: f32) -> vec3f {
    let max_q = pow(2.0, bits) - 1.0;

    let l1_norm = abs(n_in.x) + abs(n_in.y) + n_in.z;
    let n = n_in / l1_norm;
    let u = n.x + n.y;
    let v = n.x - n.y;
    let uv_01 = vec2f(u, v) * 0.5 + 0.5;

    let noise_centered = noise.xy - 0.5;
    
    // Dither amplitude scales with bit depth
    let dither_amp = 1.0 / max_q; 
    let uv_dithered = uv_01 + (noise_centered * dither_amp);

    let q_uv = round(uv_dithered * max_q) / max_q;

    let uv_recon = q_uv * 2.0 - 1.0;
    let temp_x = (uv_recon.x + uv_recon.y) * 0.5;
    let temp_y = (uv_recon.x - uv_recon.y) * 0.5;
    let z_l1 = 1.0 - abs(temp_x) - abs(temp_y);
    return normalize(vec3f(temp_x, temp_y, z_l1));
  }
`);

const hemiOctShaderAJWD = wgslFn(`
  fn encode_hemi_oct_ajwd(n_in: vec3f, noise: vec3f, bits: f32) -> vec3f {
    let max_q = pow(2.0, bits) - 1.0;

    let l1_norm = abs(n_in.x) + abs(n_in.y) + n_in.z;
    let n = n_in / l1_norm;
    let u = n.x + n.y;
    let v = n.x - n.y;
    let uv_01 = vec2f(u, v) * 0.5 + 0.5;

    let uv_center = vec2f(u, v); 
    let jacobian = get_jacobian_hemi_oct(uv_center);
    
    let safe_J = max(jacobian, 0.05); 
    let dither_scale = 1.0 / sqrt(safe_J);
    
    let final_scale = min(dither_scale, 2.5);

    let noise_centered = noise.xy - 0.5;
    let base_amp = 1.0 / max_q;
    
    let uv_dithered = uv_01 + (noise_centered * base_amp * final_scale);

    let q_uv = round(uv_dithered * max_q) / max_q;

    let uv_recon = q_uv * 2.0 - 1.0;
    let temp_x = (uv_recon.x + uv_recon.y) * 0.5;
    let temp_y = (uv_recon.x - uv_recon.y) * 0.5;
    let z_l1 = 1.0 - abs(temp_x) - abs(temp_y);
    
    return normalize(vec3f(temp_x, temp_y, z_l1));
  }
    fn get_jacobian_hemi_oct(uv: vec2f) -> f32 {
    let temp_x = (uv.x + uv.y) * 0.5;
    let temp_y = (uv.x - uv.y) * 0.5;
    let z = 1.0 - abs(temp_x) - abs(temp_y);
    let p = vec3f(temp_x, temp_y, z);
    
    let sx = sign(temp_x); // -1 or 1
    let sy = sign(temp_y); // -1 or 1
    
    let d_z_du = -0.5 * sx - 0.5 * sy;
    let d_z_dv = -0.5 * sx + 0.5 * sy;
    
    let dp_du = vec3f(0.5, 0.5, d_z_du);
    let dp_dv = vec3f(0.5, -0.5, d_z_dv);

    let r = length(p);
    let s = p / r;
    
    let ds_du = (dp_du - s * dot(s, dp_du)) / r;
    let ds_dv = (dp_dv - s * dot(s, dp_dv)) / r;

    let cross_prod = cross(ds_du, ds_dv);
    return length(cross_prod);
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
const uBitDepth = uniform(8.0);
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

// Load blue noise texture
const loader = new THREE.TextureLoader();
const blueNoiseMap = loader.load('./blue_noise_64.png')
blueNoiseMap.wrapS = THREE.RepeatWrapping;
blueNoiseMap.wrapT = THREE.RepeatWrapping;
blueNoiseMap.minFilter = THREE.NearestFilter;
blueNoiseMap.magFilter = THREE.NearestFilter;
const blueNoiseSize = 64.0;

// --- 4. THE PIPELINE ---

const noiseUV = screenCoordinate.xy.div(blueNoiseSize);
const noiseSample = texture(blueNoiseMap, noiseUV);

const N_gt = normalView;
const Spec_gt = specularShader({ N: N_gt, V: V_view, L: L_dynamic, roughness: uRoughness });

const N_rg8 = rg8Shader({ n: normalView, bits: uBitDepth });
const N_hemi = hemiOctShader({ n_in: normalView, bits: uBitDepth });
const N_hemi_dither_uniform = hemiOctShaderDithered({ n_in: normalView, noise: noiseSample, bits: uBitDepth });
const N_hemi_dither_weighted = hemiOctShaderAJWD({ n_in: normalView, noise: noiseSample, bits: uBitDepth });

const isRG8 = step(0.5, uMode).mul(step(uMode, 1.5));
const isHemi = step(1.5, uMode).mul(step(uMode, 2.5));
const isHemiUniformDither = step(2.5, uMode).mul(step(uMode, 3.5));
const isHemiAJWD = step(3.5, uMode);

const N_target = 
mix(
  mix(
      mix(
          mix(N_gt, N_rg8, isRG8),
          N_hemi, isHemi
      ),
      N_hemi_dither_uniform, isHemiUniformDither
  ),
  N_hemi_dither_weighted, isHemiAJWD
)

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
    mode: 'Ground Truth',
    visualization: 'Standard',
    bitDepth: 8,
    roughness: 0.15,
    azimuth: 0.0,
    elevation: 0.0,
    saveImage: () => saveCanvas()
};

gui.add(params, 'mode', [
    'Ground Truth', 
    'Cartesian', 
    'Hemi-Oct', 
    'Hemi-Oct + Uniform Dither',
    'Hemi-Oct + AJWD'
]).onChange(v => {
    if(v === 'Ground Truth') uMode.value = 0;
    if(v === 'Cartesian') uMode.value = 1;
    if(v === 'Hemi-Oct') uMode.value = 2;
    if(v === 'Hemi-Oct + Uniform Dither') uMode.value = 3;
    if(v === 'Hemi-Oct + AJWD') uMode.value = 4;
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