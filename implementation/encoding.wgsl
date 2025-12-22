fn encode_surface(n: vec3f, noise_in: vec3f, frag_pos: vec2f, bits: f32, mode: f32, amp: f32) -> vec3f {
    let m = i32(mode);
    var noise_val = vec2f(0.0);

    // Mode 0: Ground Truth
    if (m == 0) { return n; }

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

    // Mode 3: Hemi-Oct Uniform Dither (Blue Noise Texture)
    if (m == 3) {
        noise_val = noise_in.xy - 0.5;
    }

    // Mode 4: Hemi-Oct + IGN (Procedural)
    if (m == 4) {
        let r1 = ign(frag_pos);
        let r2 = ign(frag_pos + vec2f(5.588238, 5.588238));
        noise_val = vec2f(r1, r2) - 0.5;
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

fn ign(pixel: vec2f) -> f32 {
    let magic = vec3f(0.06711056, 0.00583715, 52.9829189);
    return fract(magic.z * fract(dot(pixel, magic.xy)));
}