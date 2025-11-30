
### 1. The "Area-Preserving" Paradox

Assumption: The plan assumes that Hemi-Oct encoding results in variable pixel density that requires normalization via the Jacobian Determinant (det(J)). The Risk: Standard Octahedral encoding is analytically area-preserving.

If the mapping is area-preserving, then det(J)=1 (or a constant C) across the entire UV domain.

Consequently, the proposed weighting formula w=1/det(JTJ)​ will evaluate to 1.0 for all pixels.

Implication: If true, "Density" is not the problem—Shape (Anisotropy) is. We would need to switch the weighting strategy to correct for the Condition Number of the Jacobian (maximum stretch direction) rather than the Determinant.


### 2. Scalar Noise Sufficiency is Invalid (The Anisotropy Premise)
**The Premise:** We assume that Hemi-Octahedral encoding introduces significant **anisotropic distortion**, rendering simple scalar noise weighting ($w$) insufficient for high-fidelity reconstruction.

**The Logic:** While Octahedral encoding is area-preserving, it is not angle-preserving (conformal). Simulation data confirms that at the "diagonals" of the UV map, grid cells are not merely scaled; they are deformed into rectangles with aspect ratios exceeding 2:1.

**The Implication:** Applying uniform (scalar) noise in Texture Space results in "streaked" or elongated noise artifacts when projected into View Space. To achieve perceptual uniformity, the dithering algorithm must employ **Vector-Weighted Dithering**. We must calculate distinct scaling factors for the U and V axes ($w_u, w_v$) derived from the partial derivatives of the projection (the Jacobian) to ensure the noise footprint remains circular (isotropic) on the sphere's surface.

### 3. The UV-Diagonal Correlation (Heuristic Feasibility)

**Assumption:** We assume that the anisotropic stretch factors ($w_u$ and $w_v$) are strictly a function of the grid geometry rather than surface depth ($N.z$). While $N.z$ is rotationally symmetric, Octahedral distortion is 4-way symmetric, peaking specifically at the UV diagonals (where $|u| \approx |v|$).

We hypothesize that a **Polynomial Approximation** of the raw UV coordinates (e.g. involving terms like $|u \cdot v|$ or $u^2 - v^2$) can approximate the analytical Jacobian Singular Values with an $R^2 > 0.9$, while costing significantly fewer GPU cycles than calculating the exact derivatives.

**The Risk:** If the mapping between UV position and Jacobian stretch is highly non-linear or requires high-order polynomials to approximate accurately, the "Heuristic" shader complexity may exceed the cost of the Analytical method (which uses standard `fwidth` or derivative instructions), rendering the approximation redundant.

### 4. The "Bit-Packing" Reality Check (Hardware Validity)

Assumption: That reducing Normal precision to 12 bits (6 bits/channel) actually yields a performance benefit.

The Risk: GPUs fetch memory in aligned blocks (typically 16, 32, or 64 bits).

Target B (12-bit) leaves 4 bits empty in a 16-bit container. Unless we have a specific variable to pack into those 4 bits (e.g., a 4-bit Roughness or Metallic selector), we are saving zero memory bandwidth compared to the Baseline 16-bit RG8.

If we cannot pack useful data into those 4 bits, the only benefit is internal cache compression (delta color compression), which is hardware-specific and opaque.

Verification Math: We must verify that a valid G-Buffer packing strategy exists for those 4 bits.
Simulation: Can we fit perceptually decent Roughness into 4 bits (16 levels)?
If No: Then the target should technically be Target C (10-bit) to allow packing into a R10G10B10A2 format (where Normals get 10 bits total, 5 per axis), or the paper's premise shifts from "Bandwidth Reduction" to "GBuffer Packing Density."

### 5. The "Noise Frequency vs. Quantization Step" Nyquist Limit

Assumption: That TAA can resolve any amplitude of noise given enough frames.

The Risk: TAA relies on neighborhood clamping and history rejection.

In Target B (12-bit / 6-bit per axis), the quantization step size is 1/64.

To hide this banding, the dithering noise amplitude must be ≥1.0 LSB (Least Significant Bit).

In View Space, 1 LSB of a 6-bit Normal map represents a surface angle change of ≈2.8∘.

The Artifact: If the noise jitters the normal by ≈3∘ every frame, the TAA's history rejection (which detects motion/ghosting) might interpret this noise as "movement" rather than "sub-pixel detail." This will cause the TAA to reject the history, causing the surface to flicker permanently (smearing).
