# Perceptual Efficiency of Anisotropic Jacobian-Weighted Dithering on Octahedral-Encoded Normal Maps

## Objective
To determine the optimal combination of vector encoding scheme (Cartesian vs. Octahedral) and dithering algorithm (Bayer vs Blue Noise vs. IGN) for maximizing perceptual quality (SSIM/FLIP) within strict G-Buffer Bit Budgets, focusing specifically on single-frame perceptual fidelity (mitigating low-frequency banding) rather than raw signal-to-noise ratio.

While existing surveys compare 16-bit Cartesian to 16-bit Octahedral, this comparison is effectively solved: Octahedral is mathematically superior. The open research question is: How much 'slack' does the superior distribution of Octahedral encoding provide? Can we cash in that efficiency to reduce the bit budget?

Specifically, this paper aims to validate if **12-bit Octahedral encoding with Distortion-Weighted dithering** can replace standard 16-bit Cartesian encoding (RG8). We aim to prove that modulating noise amplitude based on geometric distortion allows us to free up 4 bits of memory per pixel converting objectionable quantization artifacts into perceptually acceptable high-frequency noise.


## Context & Terms
* **Normal Map:** A texture encoding surface normal vectors for lighting calculations.
* **G-Buffer Quantization:** The process of packing geometric data into low-bit-depth containers to save memory bandwidth.
* **Octahedral Encoding:** A method of mapping a 3D unit sphere onto a 2D square grid. It is area-preserving but introduces variable geometric distortion (non-uniform density) at the poles.
    * **Hemispherical Octahedral (Hemi-Oct)**: A variant of Octahedral encoding optimized for View Space G-Buffers. It isolates the central "front-facing" diamond of the map and scales it to fill the $[0,1]^2$ texture space, doubling the precision density compared to standard Octahedral.
* **Dithering:** Injecting noise prior to quantization to convert low-frequency quantization banding into high-frequency noise.
* **Adaptive Dithering Weighting**: A technique where noise amplitude is scaled inversely to geometric distortion. We investigate two sub-types:
    * **Anisotropic Jacobian Dithering**: A technique where the noise amplitude is calculated and applied independently for the U and V axes (w) rather than as a scalar global multiplier (w). This compensates for the non-conformal nature of the Hemi-Oct projection, ensuring that noise projected into View Space remains Isotropic (circular) rather than Anisotropic (streaked).
* **Z-Reconstruction**: The standard optimization of storing only the X and Y components of the normal vector and deriving Z mathematically ($z=\sqrt{1−x^2−y^2​}$), assuming unit length.
* **Precise Encoding (octP)**: An optimization where the encoder searches the four nearest grid points to find the one with minimal angular error. While this reduces mathematical error, it does not increase the available bit resolution, meaning quantization steps (banding) remain visible in low-bit-depth scenarios.


## The "Epsilon" (The Innovation)
**Current industry standards** typically rely on 16-bit RG8 precision (8 bits per axis) for normal maps. Reducing this to 12 bits (6 bits per axis) traditionally results in visible quantization banding.

**The Gap:** While noise injection (dithering) is a standard technique to mitigate quantization banding (e.g., Crytek, Meyer et al.), current implementations universally apply uniform noise amplitude across the texture map. This ignores the variable pixel density of Octahedral encoding. Because the projection is area-preserving but not angle-preserving, uniform 2D noise manifests as anisotropic, non-uniform noise in 3D view space, causing excessive 'sparkling' artifacts at the poles where the sampling density is highest.
Furthermore, while exhaustive search methods like 'Precise Encoding' minimize angular error, they incur a high ALU cost (approx. 5x standard encoding) and fail to address the visual banding inherent to low-bit-depth containers. Precise quantization aligns the bands, but Dithering eliminates them.

**The Contribution:** We advance beyond subjective visual inspection to a rigorous quantitative efficiency analysis. We introduce **Jacobian-Weighted Dithering** as a mechanism to normalize noise perception. We aim to prove that this technique allows for 25% memory compression (16-bit → 12-bit) using Hemispherical Octahedral encoding while maintaining an SSIM score >0.98.


## Assumptions to Verify

Before commencing the experimental phase, we must validate the mathematical premises via Python simulation (using SymPy/NumPy). If these assumptions fail, the proposed Jacobian weighting strategy must be adjusted, for example from an Area-based metric (Determinant) to an Angular-based metric (Singular Values).
The assumptions are described in `Assumptions.md`


## Experimental Constraints: The Bit Budgets
To ensure a fair "apples-to-apples" comparison, we will test against specific hardware-relevant configurations:

| Category | Total Bits | Format | Description |
| :--- | :--- | :--- | :--- |
| **Control** | 32-bit | Float32 | The "Ground Truth" (Best Precision). |
| **Baseline** | 16-bit | Cartesian (RG8) | The Industry Standard. 8 bits X / 8 bits Y. Z is reconstructed. |
| **Target A** | 14-bit | Hemi-Oct (7-7) | The "safe" optimization. |
| **Target B** | 12-bit | Hemi-Oct (6-6) | The "Hero" Case. Uses 6 bits for U / 6 bits for V. Leaves 4 bits free in a 16-bit container. |
| **Target C** | 10-bit | Hemi-Oct (5-5) | The "Stress Test." Extreme compression to see where the method breaks. |
| **Target P** | 12-bit | Hemi-Oct Precise | The "Math" Case. Uses octP search without dithering. Used to prove that lower angular error does not necessarily equal better visual quality. |

*Note on Quantization Noise: We acknowledge that at lower bit-depth, the angular quantization step requires a dithering noise amplitude that may negatively impact raw single-frame SSIM scores. To account for this, we differentiate between Signal Accuracy (Single Frame) and Perceptual Convergence (Accumulated).*


## Execution Plan (The Virtual Lab)

### 1. The Pipeline
We will implement a two-branch rendering pipeline in WebGPU/Three.js:
* **Path A (Baseline):** Normal → Quantize X/Y to 8-bit (RG8) → Reconstruct Z → Render.
* **Path B (Optimized):** Normal → Encode Hemi-Oct (U,V) → **Calculate Anistropic Jacobian Weights ($w.x$ and $w.y$)** → Generate Noise → Scale Noise.x by w.x AND Scale Noise.y by w.y → Add to UV → Quantize to n-bits → Decode Render.

**Data Capture:** The application will render specific rotational frames and export them as Lossless PNGs to separate real-time performance from image quality analysis.

### 2. The Variables
We test the resilience of the bit budgets against different noise types and weighting strategies.

**A. Noise Injection Strategy**
To prevent geometric distortion from warping the noise patterns, all noise generation is seeded by Screen-Space Coordinates (gl_FragCoord.xy) combined with a per-frame jitter index (t).

Justification for Screen-Space: While this approach introduces a "Shower Door" effect (view-dependent noise) during motion, it is the standard implementation for G-Buffer dithering as it ensures consistent noise frequency regardless of object distance. We assume a production pipeline would rely on TAA (Temporal Anti-Aliasing) to integrate this noise over multiple frames; therefore, we prioritize screen-space consistency over object-space coherence.

Validation of Temporal Stability: While our primary focus is static frame accuracy, the high amplitude of noise required for 6-bit encoding risks dominating perceptual error metrics (FLIP/SSIM). Therefore, for Targets B and C, we will generate two sets of capture data:
* **Raw Frame**: While modern pipelines rely on TAA, analyzing the Static Frame is critical to ensure the dithering noise floor does not exceed the perceptual threshold. We treat the Static Frame as a 'Worst Case Scenario' (e.g., rapid camera movement where TAA fails). If the Jacobian-Weighted Dithering is perceptually acceptable in a static frame, it is guaranteed to be stable under TAA.
* **Accumulated Frame**: A simple 8-frame accumulation buffer (averaging samples over time) to simulate a standard TAA resolve. During this capture, the noise generator will cycle through 8 distinct phases (Blue Noise offsets or IGN time-seeds) while the camera remains static, ensuring the accumulation mathematically converges the dithering noise to zero. This allows us to measure the "Converged Surface Quality" separately from the "Dithering Noise Floor." If the accumulated frame achieves High SSIM while the Raw frame has Low SSIM, the dithering strategy is successful.

We will try the following noises:
* **Bayer:** Ordered Dithering (Grid-like, screen-aligned).
* **Blue Noise:** Pre-computed Texture (High quality, memory cost).
* **IGN (Interleaved Gradient Noise):** Algebraic (High speed, ALU-only).
    * *Note:* We acknowledge that IGN is optimized for Temporal Anti-Aliasing (TAA). In our static benchmarks, IGN may score lower than Blue Noise due to its high-frequency "checkerboard" pattern. This is a noted trade-off: we accept lower static SSIM for the benefit of ALU-only performance.

**B. Amplitude Logic (Weighting strategy)**
We test three levels of mathematical precision for the noise scaling factor $w$:
* **Control (Uniform):** Constant noise amplitude ξ applied across the entire UV map ($w$=vec2(1.0, 1.1)).
* **Analytical Vector-Jacobian**: We calculate the stretch factors of the mapping along the U and V axes independently. To ensure the projected noise is uniform on the sphere surface, we must shrink the texture-space noise in the direction where the mapping stretches the texture. Let $J = [\frac{\partial{P}}{\partial{u}},\frac{\partial{P}}{\partial{v}}]$ be the Jacobian matrix (3 x 2). The weights are the inverse of the column norms:

$$ w_u = \frac{1}{\lVert\frac{\partial{P}}{\partial{u}}\rVert}, w_v = \frac{1}{\lVert\frac{\partial{P}}{\partial{v}}\rVert} $$


### 3. Rotational Stress Test
To ensure we capture artifacts at the "poles" and "diagonals" of the Octahedral map, the test sphere will rotate relative to the light source. 
We will capture frames specifically when the specular highlight crosses regions of highest geometric distortion (where the derivative of the projection approaches infinity). We isolate single-frame signal degradation (SSIM) rather than temporal noise coherence, as the latter is highly dependent on the specific TAA implementation used by the renderer.

To ensure the 'BRDF amplification' of quantization errors is captured, Surface Roughness will be strictly clamped to the 0.1–0.2 range. We avoid α=0.0 (perfect mirror) as it eliminates the gradient falloff where banding is most visible, and avoid α>0.4 as it masks the very artifacts we aim to measure.

### 4. Metrics
Once the images are exported, we will use Python scripts and CLI tools to generate the error metrics:
* **FLIP (NVIDIA):** We will run the official FLIP tool to generate Perceptual Error Maps. We will specifically look for "fireflies" (high-contrast error dots) which indicate failed dithering at the poles.
* **SSIM (Structural Similarity):** Computed via Python (Scikit-Image) on both Raw and Accumulated frames to measure global structural consistency against the Ground Truth.
* **Angular Error Heatmap:** We will compute the angle $\theta$ between the ground truth vector $N_{gt}$ and the reconstructed vector $N_{rec}$:
    $$\theta = \arccos(N_{gt} \cdot N_{rec})$$
    This allows us to visualize if the **Weighted** dithering successfully reduces the anisotropic stretching errors along the diagonals compared to **Uniform** dithering.
* **Specular Luminance Delta:** While Angular Error measures the vector difference, it does not account for visual impact. We will compute the per-pixel luminance difference specifically within the specular lobe region: $ΔL=∣L_{GroundTruth}​ − L_{target}​∣$. This differentiates between a normal vector error in a shadow (invisible) vs. a highlight (highly visible).
* **Gradient Alignment Score**: To validate the "Shape" of the noise, we will compute the gradient of the error map in View Space. 
    * If noise is isotropic, the gradients of the error should be randomly distributed in direction.
    * If noise is anisotropic (streaked), the error gradients will cluster perpendicular to the streak.

    We will plot a histogram of Error Gradient directions relative to the Surface Tangent U.


## Hypothesis
1.  **The Weighting Correction:** We hypothesize that **Target B (12-bit) + Uniform Dithering** will fail at the poles (manifesting as distinct banding in the specular highlight), whereas **Target B + Vector Jacobian-Weighted Dithering** will smooth these artifacts, achieving parity with the 16-bit Baseline.
2.  **The Efficiency Victory:** We anticipate that while Raw 12-bit frames may show high variance, the Accumulated 12-bit Weighted Octahedral method will achieve an SSIM score >0.98. This confirms that analytical Vector Jacobian attenuation allows us to recover the perceptual precision lost by discarding 4 bits. 
3.  **The IGN Trade-off:** While Blue Noise will yield the highest static SSIM, IGN will perform within an acceptable margin for real-time applications. We predict the visual difference between IGN and Blue Noise will be negligible once Jacobian Weighting is applied, as the weighting suppresses the worst-case noise pixels.
4. **The Precision vs. Perception Divergence**: We hypothesize that while Target P (12-bit Precise) would get the lowest Mean Squared Error (MSE), it will score lower on FLIP (Perceptual Error) than Target B (Jacobian Dithered). This will demonstrate that in memory-constrained G-Buffers, noise-based error masking is perceptually superior to analytical error minimization.

## Expected Deliverables
1.  **Efficiency Curve:** A graph plotting Bit-Depth (X-axis) vs. SSIM Score (Y-axis).
2. **Heatmap of Bit-Efficiency** A heatmap where color = ∣NGT​−NTarget​∣.The goal is to show that our "Weighted Dithering" redistributes the error so that it is perceptually uniform, rather than clustered at the poles.
2.  **The "Artifact Grid":** A side-by-side visual comparison of the specular highlight at the Octahedral Pole, showing: [No Dither] vs [Uniform Dither] vs [Scalar Weighted Dither] vs [Vector Weigthed Dither].
3.  **Code Snippet:** A copy-paste ready GLSL function for "Jacobian-Weighted Octahedral Encoding" for public use.