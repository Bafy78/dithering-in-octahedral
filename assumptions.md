
### 1. The "Area-Preserving" Paradox

Assumption: The plan assumes that Hemi-Oct encoding results in variable pixel density that requires normalization via the Jacobian Determinant (det(J)). The Risk: Standard Octahedral encoding is analytically area-preserving.

If the mapping is area-preserving, then det(J)=1 (or a constant C) across the entire UV domain.

Consequently, the proposed weighting formula w=1/det(JTJ)​ will evaluate to 1.0 for all pixels.

Implication: If true, "Density" is not the problem—Shape (Anisotropy) is. We would need to switch the weighting strategy to correct for the Condition Number of the Jacobian (maximum stretch direction) rather than the Determinant.


### 2. The Isotropic Noise Fallacy

Assumption: The plan implies that scaling the noise amplitude uniformly (scalar w) is sufficient to hide quantization. The Risk: Octahedral distortion is highly anisotropic. At the "diagonals" of the UV map (which map to the sphere's equator edges), the texels are not just smaller/larger; they are squashed.

A scalar weight w scales noise equally in U and V.

However, the distortion might stretch U much more than V (or vice versa) depending on the quadrant.

Implication: Scalar noise scaling might fix the "loudness" of the noise but fail to match the "shape" of the quantization bands. We may need Anisotropic Dithering (scaling noise U and noise V separately).

### 3. The "Equivalent Precision" Math

Assumption: Target B (12-bit Hemi-Oct) provides "enough" precision to rival 16-bit RG8. The Risk: We must verify the effective angular resolution.

RG8 (16-bit): Grid is 256×256 on a disk (reconstructed Z).

Hemi-Oct (12-bit): Grid is 64×64 spread over the hemisphere.

We must ensure the worst-case angular step Δθ in the 12-bit Hemi-Oct scenario is not significantly larger than the average step in the 16-bit RG8 scenario.

### 4. The Heuristic Correlation (N.z)

Assumption: The distortion factor correlates linearly (or smoothly) with N.z. The Risk: The distortion in Octahedral maps is highest at the diagonals (u=v), not necessarily just at low z. The heuristic w=f(N.z) might mask errors at the horizon but miss the critical diagonal artifacts.

### 5. The "Bit-Packing" Reality Check (Hardware Validity)

Assumption: That reducing Normal precision to 12 bits (6 bits/channel) actually yields a performance benefit.

The Risk: GPUs fetch memory in aligned blocks (typically 16, 32, or 64 bits).

Target B (12-bit) leaves 4 bits empty in a 16-bit container. Unless you have a specific variable to pack into those 4 bits (e.g., a 4-bit Roughness or Metallic selector), you are saving zero memory bandwidth compared to the Baseline 16-bit RG8.

If you cannot pack useful data into those 4 bits, the only benefit is internal cache compression (delta color compression), which is hardware-specific and opaque.

Verification Math: We must verify that a valid G-Buffer packing strategy exists for those 4 bits.
Simulation: Can we fit perceptually decent Roughness into 4 bits (16 levels)?
If No: Then the target should technically be Target C (10-bit) to allow packing into a R10G10B10A2 format (where Normals get 10 bits total, 5 per axis), or the paper's premise shifts from "Bandwidth Reduction" to "GBuffer Packing Density."

### 6. The "Noise Frequency vs. Quantization Step" Nyquist Limit

Assumption: That TAA can resolve any amplitude of noise given enough frames.

The Risk: TAA relies on neighborhood clamping and history rejection.

In Target B (12-bit / 6-bit per axis), the quantization step size is 1/64.

To hide this banding, the dithering noise amplitude must be ≥1.0 LSB (Least Significant Bit).

In View Space, 1 LSB of a 6-bit Normal map represents a surface angle change of ≈2.8∘.

The Artifact: If the noise jitters the normal by ≈3∘ every frame, the TAA's history rejection (which detects motion/ghosting) might interpret this noise as "movement" rather than "sub-pixel detail." This will cause the TAA to reject the history, causing the surface to flicker permanently (smearing).

### 7. The "Singular Value" vs. "Determinant" Distinction

This expands on your Point 2, but requires specific mathematical verification.

Assumption: That the Determinant of the Jacobian (Area scale) is the correct metric for noise scaling.

The Risk: As you suspected, the Determinant measures area stretch. However, banding is visible perpendicular to the gradient.

If a pixel is squashed into a long, thin rectangle (high anisotropy), the quantization steps become very far apart in one direction and very close in the other.

Using the Determinant (Average Area) might under-dither the "long" direction (leaving bands visible) and over-dither the "short" direction (adding unnecessary noise).

Verification Math: Instead of w=1/det(JTJ)​, we likely need to decompose J using SVD (Singular Value Decomposition) to find σmax​ (the maximum stretch).

Hypothesis to Test: Noise amplitude should be driven by the Spectral Norm (largest singular value) of the Jacobian inverse, not the Determinant.
w=∣∣J−1∣∣2​=σmin​(J)1​

Why: We need the noise to be large enough to bridge the widest gap in the distorted grid.
