fn encode_surface(n: vec3f, noise_in: vec3f, frag_pos: vec2f, bits: f32, enc_mode: f32, noise_mode: f32, dist_mode: f32, jwd_mode: f32, amp: f32) -> vec3f {
    let e = i32(enc_mode);
    let nm = i32(noise_mode);
    let dm = i32(dist_mode);
    let jwd = i32(jwd_mode);

    // Mode 0: Ground Truth (Bypass)
    if (e == 0) { return n; }

    // Calculate Noise with Distribution logic
    var noise_val = get_noise(nm, dm, noise_in, frag_pos) * amp;

    // Mode 1: Cartesian
    if (e == 1) { return encode_cartesian(n, noise_val, bits); }

    // Mode 2: Hemi-Oct (With Optional JWD/AJWD)
    if (e == 2) {
        // Only calculate JWD factors if requested and in Hemi-Oct mode
        if (jwd > 0) {
            // Reconstruct U,V temporarily to calculate distortion
            let l1 = abs(n.x) + abs(n.y) + n.z;
            let n_norm = n / l1;
            let u = n_norm.x + n_norm.y;
            let v = n_norm.x - n_norm.y;
            let uv = vec2f(u, v);

            // JWD (Mode 1)
            if (jwd == 1) {
                let distortion = get_jacobian_distortion(uv);
                noise_val = noise_val * sqrt(max(distortion, 0.5) / 0.5);

            // AJWD (Mode 2)
            if (jwd == 2) {
                let stretch = get_anisotropic_stretch(uv);
                var scale_u = 1.0;  
                var scale_v = 1.0;
                if (stretch.x > stretch.y) {
                    scale_v = stretch.x / stretch.y;
                } else {
                    scale_u = stretch.y / stretch.x;
                }
                noise_val = noise_val * vec2f(scale_u, scale_v);
            }
            }
        }
        return encode_hemi_oct(n, noise_val, bits); 
    }

    return n;
}

// --- HELPER: Noise Generation ---
fn get_noise(mode: i32, dist: i32, noise_in: vec3f, frag_pos: vec2f) -> vec2f {
    var r = vec2f(0.0);

    // Mode 0: Blue Noise
    if (mode == 0) { 
        if (dist == 0) {
            r = noise_in.xy - 0.5;
        } else {
            // TPDF: Subtract two channels to get triangular distribution
            r = vec2f(noise_in.x - noise_in.y, noise_in.y - noise_in.z);
        }
    }

    // Mode 1: IGN
    if (mode == 1) {
        let u1 = ign(frag_pos);
        let u2 = ign(frag_pos + vec2f(5.588, 1.3));

        if (dist == 0) {
            r = vec2f(u1, u2) - 0.5;
        } else {
            r = vec2f(remap_noise_tri(u1), remap_noise_tri(u2));
        }
    }
    
    return r;
}

fn remap_noise_tri(v: f32) -> f32 {
    let orig = v * 2.0 - 1.0;
    let m = orig * inverseSqrt(abs(orig) + 1e-6);
    return m - sign(orig);
}

// --- HELPER: Cartesian Encoding (Updated to support Dither) ---
fn encode_cartesian(n: vec3f, noise: vec2f, bits: f32) -> vec3f {
    let max_q = pow(2.0, bits) - 1.0;
    let dither_amp = 1.0 / max_q;

    // 1. Map Normal XY to [0,1]
    let n_unorm = n.xy * 0.5 + 0.5;

    // 2. Apply Dither
    let n_dithered = n_unorm + (noise * dither_amp);

    // 3. Quantize
    let q_xy = round(n_dithered * max_q) / max_q;

    // 4. Decode
    let xy = q_xy * 2.0 - 1.0;
    
    // reconstruct Z assuming hemisphere
    let z_sq = 1.0 - dot(xy, xy); 
    let z = sqrt(max(z_sq, 0.0));
    
    return normalize(vec3f(xy.x, xy.y, z));
}

// --- HELPER: Hemi-Oct Encoding ---
fn encode_hemi_oct(n_in: vec3f, noise: vec2f, bits: f32) -> vec3f {
    let max_q = pow(2.0, bits) - 1.0;
    
    // 1. Project
    let l1_norm = abs(n_in.x) + abs(n_in.y) + n_in.z;
    let n = n_in / l1_norm;
    let u = n.x + n.y;
    let v = n.x - n.y;
    let uv_01 = vec2f(u, v) * 0.5 + 0.5;

    // 2. Dither
    let dither_amp = 1.0 / max_q;
    let uv_dithered = uv_01 + (noise * dither_amp);

    // 3. Quantize
    let q_uv = round(uv_dithered * max_q) / max_q;

    // 4. Decode
    let uv_recon = q_uv * 2.0 - 1.0;
    let temp_x = (uv_recon.x + uv_recon.y) * 0.5;
    let temp_y = (uv_recon.x - uv_recon.y) * 0.5;
    let z_l1 = 1.0 - abs(temp_x) - abs(temp_y);
    
    return normalize(vec3f(temp_x, temp_y, z_l1));
}

fn ign(pixel: vec2f) -> f32 {
    let magic = vec3f(0.06711056, 0.00583715, 52.9829189);
    return fract(magic.z * fract(dot(pixel, magic.xy)));
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