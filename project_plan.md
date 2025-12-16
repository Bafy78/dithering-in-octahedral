# Perceptual Efficiency of Anisotropic Jacobian-Weighted Dithering on Octahedral-Encoded Normal Maps

## Objective
While existing surveys compare 16-bit Cartesian to 16-bit Octahedral, this comparison is effectively solved: Octahedral is mathematically superior. The open research question is: How much 'slack' does the superior distribution of Octahedral encoding provide? How much can we utilize this efficiency to mask quantization artifacts, rendering the standard 16-bit container as perceptually indistinguishable from 32-bit float as possible?

Specifically, this paper aims to validate if **Distortion-Weighted dithering** can resolve the anisotropic noise artifacts inherent to standard 16-bit Octahedral encoding (RG8). We aim to prove that modulating noise amplitude based on geometric distortion eliminates the 'sparkling' artifacts at the diagonals, allowing standard 16-bit Octahedral maps to achieve a perceptual quality (SSIM) indistinguishable from 32-bit Float vectors.


## Context & Terms
* **Normal Map:** A texture encoding surface normal vectors for lighting calculations.
* **G-Buffer Quantization:** The process of packing geometric data into fixed-precision containers to save memory bandwidth.
* **Octahedral Encoding:** A method of mapping a 3D unit sphere onto a 2D square grid. It is area-preserving but introduces variable geometric distortion (non-uniform density) at the mid-quadrants (diagonals).
    * **Hemispherical Octahedral (Hemi-Oct)**: A variant of Octahedral encoding optimized for View Space G-Buffers. It isolates the central "front-facing" diamond of the map and scales it to fill the $[0,1]^2$ texture space, doubling the precision density compared to standard Octahedral.
* **Dithering:** Injecting noise prior to quantization to convert low-frequency quantization banding into high-frequency noise.
* **Adaptive Dithering Weighting**: A technique where noise amplitude is scaled inversely to geometric distortion. We investigate two sub-types:
    * **Anisotropic Jacobian-Weighted Dithering (AJWD)**: A technique where the noise amplitude is calculated and applied independently for the U and V axes (w) rather than as a scalar global multiplier (w). This compensates for the non-conformal nature of the Hemi-Oct projection, ensuring that noise projected into View Space remains Isotropic (circular) rather than Anisotropic (streaked).
* **Z-Reconstruction**: The standard optimization of storing only the X and Y components of the normal vector and deriving Z mathematically ($z=\sqrt{1−x^2−y^2​}$), assuming unit length.


## The "Epsilon" (The Innovation)
**Current industry standards** typically rely on 16-bit RG8 precision (8 bits per axis) for normal maps.

**The Gap:** While noise injection (dithering) is a standard technique to mitigate quantization banding (e.g., Crytek, Meyer et al.), current implementations universally apply uniform noise amplitude across the texture map. This ignores the variable pixel density of Octahedral encoding. Because the projection is area-preserving but not angle-preserving, uniform 2D noise manifests as anisotropic, non-uniform noise in 3D view space, causing excessive 'sparkling' artifacts at the diagonals where the sampling density is highest.

**The Contribution:** We advance beyond subjective visual inspection to a rigorous quantitative efficiency analysis. We introduce **Jacobian-Weighted Dithering** as a mechanism to normalize noise perception. We aim to prove that this technique yields a higher perceptual quality (SSIM/FLIP) than Uniform Dithering within the same standard 16-bit container.


## Assumptions to Verify

### 1. The "Area-Preserving" Paradox

Assumption: The plan assumes that Hemi-Oct encoding results in variable pixel density that requires normalization via the Jacobian Determinant (det(J)). The Risk: Standard Octahedral encoding is analytically area-preserving.

If the mapping is area-preserving, then det(J)=1 (or a constant C) across the entire UV domain.

Consequently, the proposed weighting formula w=1/det(JTJ)​ will evaluate to 1.0 for all pixels.

Implication: If true, "Density" is not the problem—Shape (Anisotropy) is. We would need to switch the weighting strategy to correct for the Condition Number of the Jacobian (maximum stretch direction) rather than the Determinant.


### 2. Scalar Noise Sufficiency is Invalid (The Anisotropy Premise)
**The Premise:** We assume that Hemi-Octahedral encoding introduces significant **anisotropic distortion**, rendering simple scalar noise weighting ($w$) insufficient for high-fidelity reconstruction.

**The Logic:** While Octahedral encoding is area-preserving, it is not angle-preserving (conformal). Simulation data confirms that at the "diagonals" of the UV map, grid cells are not merely scaled; they are deformed into rectangles with aspect ratios exceeding 2:1.

**The Implication:** Applying uniform (scalar) noise in Texture Space results in "streaked" or elongated noise artifacts when projected into View Space. To achieve perceptual uniformity, the dithering algorithm must employ **Vector-Weighted Dithering**. We must calculate distinct scaling factors for the U and V axes ($w_u, w_v$) derived from the partial derivatives of the projection (the Jacobian) to ensure the noise footprint remains circular (isotropic) on the sphere's surface.


## Experimental Constraints: The Bit Budgets
To ensure a fair "apples-to-apples" comparison, we will test against specific hardware-relevant configurations:

| Format | Dithering Strategy | Description |
| :--- | :--- | :--- |
| 32-bit Float | None | The "Ground Truth" (Best Precision). |
| 16-bit Cartesian | None | The quantized version. |
| 16-bit Cartesian | Uniform | The standard legacy implementation. |
| 16-bit Hemi-Oct | Uniform | Standard Octahedral optimization with standard dithering. |
| 16-bit Hemi-Oct | Anisotropic Jacobian Weighted | The proposed method. |

## Execution Plan (The Virtual Lab)

### 1. The Pipeline
We will implement the following rendering pipeline in Three.js + WebGPU (using WGSL instead of TSL):
Normal → Encode Hemi-Oct (U,V) → **Calculate Anistropic Jacobian Weights ($w.x$ and $w.y$)** → Generate Noise → Scale Noise.x by w.x AND Scale Noise.y by w.y → Add to UV → Quantize to 8-bits → Decode Render.

**Data Capture:** The application will render specific rotational frames and export them as Lossless PNGs to separate real-time performance from image quality analysis.

### 2. The Variables
We test the resilience of the perceptual quality against different noise types and weighting strategies.

**A. Noise Injection Strategy**
To prevent geometric distortion from warping the noise patterns, all noise generation is seeded by Screen-Space Coordinates (gl_FragCoord.xy) combined with a per-frame jitter index (t).

Justification for Screen-Space: While this approach introduces a "Shower Door" effect (view-dependent noise) during motion, it is the standard implementation for G-Buffer dithering as it ensures consistent noise frequency regardless of object distance.

We will try the following noises:
* **Bayer:** Ordered Dithering (Grid-like, screen-aligned).
* **Blue Noise:** Pre-computed Texture (High quality, memory cost).
* **IGN (Interleaved Gradient Noise):** Algebraic (High speed, ALU-only).
    * *Note:* We acknowledge that IGN is optimized for Temporal Anti-Aliasing (TAA). In our static benchmarks, IGN may score lower than Blue Noise due to its high-frequency "checkerboard" pattern. This is a noted trade-off: we accept lower static SSIM for the benefit of ALU-only performance.

**B. Amplitude Logic (Weighting strategy)**
* **Control (Uniform):** Constant noise amplitude applied across the entire UV map.
* **Analytical Vector-Jacobian**: We calculate the stretch factors of the mapping along the U and V axes independently. To ensure the projected noise is uniform on the sphere surface, we must shrink the texture-space noise in the direction where the mapping stretches the texture. Let $J = [\frac{\partial{P}}{\partial{u}},\frac{\partial{P}}{\partial{v}}]$ be the Jacobian matrix (3 x 2). The weights are the inverse of the column norms:

$$ w_u = \frac{1}{\lVert\frac{\partial{P}}{\partial{u}}\rVert}, w_v = \frac{1}{\lVert\frac{\partial{P}}{\partial{v}}\rVert} $$


### 3. Rotational Stress Test
To ensure we capture artifacts at the center and mid-quadrants of the Octahedral map, the test sphere will rotate relative to the light source. 
We will capture frames specifically when the specular highlight crosses regions of highest geometric distortion (where the derivative of the projection approaches infinity). We isolate single-frame signal degradation (SSIM) rather than temporal noise coherence, as the latter is highly dependent on the specific TAA implementation used by the renderer.

To ensure the 'BRDF amplification' of quantization errors is captured, Surface Roughness will be strictly clamped to the 0.1–0.2 range. We avoid α=0.0 (perfect mirror) as it eliminates the gradient falloff where banding is most visible, and avoid α>0.4 as it masks the very artifacts we aim to measure.

### 4. Metrics
Once the images are exported, we will use Python scripts and CLI tools to generate the error metrics:
* **FLIP (NVIDIA):** We will run the official FLIP tool to generate Perceptual Error Maps. We will specifically look for "fireflies" (high-contrast error dots) which indicate failed dithering.
* **SSIM (Structural Similarity):** Computed via Python (Scikit-Image) on frames to measure global structural consistency against the Ground Truth.
* **Angular Error Heatmap:** We will compute the angle $\theta$ between the ground truth vector $N_{gt}$ and the reconstructed vector $N_{rec}$:
    $$\theta = \arccos(N_{gt} \cdot N_{rec})$$
    This allows us to visualize if the **Weighted** dithering successfully reduces the anisotropic stretching errors along the diagonals compared to **Uniform** dithering.
* **Specular Luminance Delta:** While Angular Error measures the vector difference, it does not account for visual impact. We will compute the per-pixel luminance difference specifically within the specular lobe region: $ΔL=∣L_{GroundTruth}​ − L_{target}​∣$. This differentiates between a normal vector error in a shadow (invisible) vs. a highlight (highly visible).
* **Gradient Alignment Score**: To validate the "Shape" of the noise, we will compute the gradient of the error map in View Space. 
    * If noise is isotropic, the gradients of the error should be randomly distributed in direction.
    * If noise is anisotropic (streaked), the error gradients will cluster perpendicular to the streak.

    We will plot a histogram of Error Gradient directions relative to the Surface Tangent U.


## Hypothesis
1.  **The Weighting Correction:** We hypothesize that **Uniform Dithering** will fail at the mid-quadrant lobes (manifesting as distinct banding in the specular highlight), whereas **AJWD** will smooth these artifacts, achieving higher FLIP scores.
2.  **The Parity:** We anticipate that **AJWD** will effectively close the perceptual gap between 16-bit Octahedral and 32-bit Float, rendering the quantization noise perceptually invisible under standard viewing conditions.
3.  **The IGN Trade-off:** While Blue Noise will yield the highest static SSIM, IGN will perform within an acceptable margin for real-time applications. We predict the visual difference between IGN and Blue Noise will be negligible once Jacobian Weighting is applied, as the weighting suppresses the worst-case noise pixels.

## Expected Deliverables
1.  **Error Distribution Histogram**: A comparison of error magnitudes at the Diagonals vs. the Equator for Uniform vs. Weighted dithering
2. **Heatmap of Bit-Efficiency** A heatmap where color = ∣NGT​−NTarget​∣.The goal is to show that our "Weighted Dithering" redistributes the error so that it is perceptually uniform, rather than clustered at the Diagonals.
2.  **The "Artifact Grid":** A side-by-side visual comparison of the specular highlight at the Octahedral Pole, showing: [No Dither] vs [Uniform Dither] vs [Scalar Weighted Dither] vs [Vector Weigthed Dither].
3.  **Code Snippet:** A copy-paste ready GLSL function for "Jacobian-Weighted Octahedral Encoding" for public use.