fn encode_surface(n: vec3f, noise_in: vec3f, frag_pos: vec2f, bits: f32, enc_mode: f32, noise_mode: f32, amp: f32) -> vec3f {
    let e = i32(enc_mode);
    let nm = i32(noise_mode);

    // Mode 0: Ground Truth (Bypass)
    if (e == 0) { return n; }

    // Calculate Noise once
    let noise_val = get_noise(nm, noise_in, frag_pos) * amp;

    // Route to Encoding
    if (e == 1) { return encode_cartesian(n, noise_val, bits); }
    if (e == 2) { return encode_hemi_oct(n, noise_val, bits); }

    return n;
}

// --- HELPER: Noise Generation ---
fn get_noise(mode: i32, noise_in: vec3f, frag_pos: vec2f) -> vec2f {
    // Mode 0: None
    if (mode == 0) { return vec2f(0.0); }

    // Mode 1: Blue Noise (Texture)
    if (mode == 1) { return noise_in.xy - 0.5; }

    // Mode 2: IGN (Procedural)
    if (mode == 2) {
        let r1 = ign(frag_pos);
        let r2 = ign(frag_pos + vec2f(5.588238, 5.588238));
        return vec2f(r1, r2) - 0.5;
    }
    return vec2f(0.0);
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