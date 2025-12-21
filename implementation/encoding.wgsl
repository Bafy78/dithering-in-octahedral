fn encode_surface(n: vec3f, noise_in: vec3f, bits: f32, mode: f32, amp: f32) -> vec3f {
    let m = i32(mode);
    var noise_val = vec2f(0.0);

    // Mode 0: Ground Truth
    if (m == 0) {
        return n;
    }

    // Mode 1: RG8 (Cartesian)
    if (m == 1) {
        let max_q = pow(2.0, bits) - 1.0;
        let n_unorm = n * 0.5 + 0.5;
        let q_x = round(n_unorm.x * max_q) / max_q;
        let q_y = round(n_unorm.y * max_q) / max_q;
        let x = q_x * 2.0 - 1.0;
        let y = q_y * 2.0 - 1.0;
        let z_sq = 1.0 - (x * x) - (y * y);
        let z = sqrt(max(z_sq, 0.0));
        return normalize(vec3f(x, y, z));
    }

    // Mode 3: Hemi-Oct Uniform Dither
    if (m == 3) {
        noise_val = noise_in.xy - 0.5;
    }

    // Hemi-Oct
    if (m==4 || m==5) {
        let l1 = abs(n.x) + abs(n.y) + n.z;
        let n_norm = n / l1;
        let u = n_norm.x + n_norm.y;
        let v = n_norm.x - n_norm.y;

        // Mode 4: Hemi-Oct JWD
        if (m == 4) {
            let distortion = get_jacobian_distortion(vec2f(u, v));
            noise_val = (noise_in.xy - 0.5) * sqrt(max(distortion, 0.5) / 0.5);
        }

        // Mode 5: Hemi-Oct AJWD
        if (m == 5) {
            let stretch = get_anisotropic_stretch(vec2f(u, v));
            var scale_u = 1.0;  
            var scale_v = 1.0;
            if (stretch.x > stretch.y) {
                scale_v = stretch.x / stretch.y;
            } else {
                scale_u = stretch.y / stretch.x;
            }
            noise_val = (noise_in.xy - 0.5) * vec2f(scale_u, scale_v);
        }
    }

    return common_hemi_oct(n, noise_val * amp, bits);
}

// --- HELPER: Shared Hemi-Oct Math ---
fn common_hemi_oct(n_in: vec3f, noise: vec2f, bits: f32) -> vec3f {
    let max_q = pow(2.0, bits) - 1.0;

    // 1. Project
    let l1_norm = abs(n_in.x) + abs(n_in.y) + n_in.z;
    let n = n_in / l1_norm;
    let u = n.x + n.y;
    let v = n.x - n.y;
    let uv_01 = vec2f(u, v) * 0.5 + 0.5;

    // 2. Dither (Apply noise)
    let dither_amp = 1.0 / max_q;
    let uv_dithered = uv_01 + (noise * dither_amp);

    // 3. Quantize
    let q_uv = round(uv_dithered * max_q) / max_q;

    // 4. Decode / Reconstruct
    let uv_recon = q_uv * 2.0 - 1.0;
    let temp_x = (uv_recon.x + uv_recon.y) * 0.5;
    let temp_y = (uv_recon.x - uv_recon.y) * 0.5;
    let z_l1 = 1.0 - abs(temp_x) - abs(temp_y);
    
    return normalize(vec3f(temp_x, temp_y, z_l1));
}

// --- HELPER: Stretches for JWD and AJWD ---
struct SurfaceDerivatives {
    ds_du: vec3f,
    ds_dv: vec3f,
}
fn get_surface_derivatives(uv: vec2f) -> SurfaceDerivatives {
    let uv_abs = abs(uv);
    let temp_x = (uv_abs.x + uv_abs.y) * 0.5;
    let temp_y = (uv_abs.x - uv_abs.y) * 0.5;
    let z = 1.0 - temp_x - abs(temp_y);
    
    let sy = step(uv_abs.y, uv_abs.x) * 2.0 - 1.0;
    let d_z_du = -0.5 - 0.5 * sy; 
    let d_z_dv = -0.5 + 0.5 * sy;
    
    let dp_du = vec3f(0.5, 0.5, d_z_du);
    let dp_dv = vec3f(0.5, -0.5, d_z_dv);

    let p = vec3f(temp_x, temp_y, z);
    let r = length(p);
    let s = p / r;
    
    let ds_du = (dp_du - s * dot(s, dp_du)) / r;
    let ds_dv = (dp_dv - s * dot(s, dp_dv)) / r;

    return SurfaceDerivatives(ds_du, ds_dv);
}

fn get_anisotropic_stretch(uv: vec2f) -> vec2f {
    let ds = get_surface_derivatives(uv);
    return vec2f(length(ds.ds_du), length(ds.ds_dv));
}

fn get_jacobian_distortion(uv: vec2f) -> f32 {
    let ds = get_surface_derivatives(uv);
    return length(cross(ds.ds_du, ds.ds_dv));
}