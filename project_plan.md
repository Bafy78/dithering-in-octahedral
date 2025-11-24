# Perceptual Efficiency of Jacobian-Weighted Dithering on Octahedral-Encoded Normal Maps

## Objective
To determine the optimal combination of vector encoding scheme (Cartesian vs. Octahedral) and dithering algorithm (Blue Noise vs. IGN) for maximizing perceptual quality (SSIM/FLIP) within strict G-Buffer Bit Budgets, focusing specifically on static frame reconstruction accuracy rather than temporal stability.

Specifically, this paper aims to validate if **12-bit Octahedral encoding with Distortion-Weighted dithering** can replace standard 16-bit Cartesian encoding (RG8). We aim to compare an Analytical Jacobian weighting strategy against a Heuristic approximation to determine if the computational cost of exact derivatives is necessary to prevent "sparkling" artifacts, or if a low-ALU proxy suffices. We aim to prove that modulating noise amplitude based on geometric distortion allows us to free up 4 bits of memory per pixel without visible degradation in specular highlights.

## Context & Terms
* **Normal Map:** A texture determining surface angle.
* **G-Buffer Quantization:** The process of packing geometric data into low-bit-depth containers to save memory bandwidth.
* **Octahedral Encoding:** A method of mapping a 3D unit sphere onto a 2D square grid. It is area-preserving but introduces variable geometric distortion (non-uniform density) at the poles.
* **Dithering:** Injecting noise prior to quantization to convert "banding artifacts" into "fuzz."
* **Adaptive Dithering Weighting**: A technique where noise amplitude is scaled inversely to geometric distortion. We investigate two sub-types:
    * **Analytical Jacobian**: Scaling based on the precise partial derivatives of the projection function.
    * **Heuristic Proxy**: Scaling based on surface normal components (e.g., ∣N.z∣) to approximate distortion zones with minimal ALU overhead.
* **Z-Reconstruction**: The standard optimization of storing only the X and Y components of the normal vector and deriving Z mathematically ($z=\sqrt{1−x^2−y^2​}$), assuming unit length.

## The "Epsilon" (The Innovation)
**Current industry standards** typically rely on 16-bit RG8 precision (8 bits per axis) for normal maps. Reducing this to 12 bits (6 bits per axis) traditionally results in visible quantization banding.

**The Gap:** Current research often ignores the interplay between procedural noise and geometric projection distortion. Uniform dithering applied to an Octahedral map results in non-uniform noise in 3D space—causing visual "sparkling" at the poles where the map density is highest.

**The Contribution:** We move beyond "visual inspection" to a rigid efficiency analysis. We introduce **Jacobian-Weighted Dithering** as a mechanism to normalize noise perception. We aim to prove that this technique allows for 25% memory compression (16-bit → 12-bit) while maintaining an SSIM score >0.98.

## Experimental Constraints: The Bit Budgets
To ensure a fair "apples-to-apples" comparison, we will test against specific hardware-relevant configurations:

| Category | Total Bits | Format | Description |
| :--- | :--- | :--- | :--- |
| **Control** | 32-bit | Float32 | The "Ground Truth" (Infinite Precision). |
| **Baseline** | 16-bit | Cartesian (RG8) | The Industry Standard. 8 bits X / 8 bits Y. Z is reconstructed. |
| **Target A** | 12-bit | Octahedral (6-6) | The "Hero" Case. Uses 6 bits for U / 6 bits for V. Leaves 4 bits free in a 16-bit container. |
| **Target B** | 10-bit | Octahedral (5-5) | The "Stress Test." Extreme compression to see where the method breaks. |

## Execution Plan (The Virtual Lab)

### 1. The Pipeline
We will implement a two-branch rendering pipeline in WebGPU/Three.js:
* **Path A (Baseline):** Normal → Quantize X/Y to 8-bit (RG8) → Reconstruct Z → Render.
* **Path B (Optimized):** Normal → Encode Octahedral (U,V) → **Calculate Jacobian Weight ($w$)** → Generate Noise → Scale Noise by $w$ → Add to UV → Quantize to n-bits → Decode Render.

**Data Capture:** The application will render specific rotational frames and export them as Lossless PNGs to separate real-time performance from image quality analysis.

### 2. The Variables
We test the resilience of the bit budgets against different noise types and weighting strategies.

**A. Noise Injection Strategy**
To prevent geometric distortion from warping the noise patterns, all noise generation is seeded by Screen-Space Coordinates (gl_FragCoord.xy).

Justification for Screen-Space: While this approach introduces a "Shower Door" effect (view-dependent noise) during motion, it is the standard implementation for G-Buffer dithering as it ensures consistent noise frequency regardless of object distance. We assume a production pipeline would rely on TAA (Temporal Anti-Aliasing) to integrate this noise over multiple frames; therefore, we prioritize screen-space consistency over object-space coherence.

* **Bayer:** Ordered Dithering (Grid-like, screen-aligned).
* **Blue Noise:** Pre-computed Texture (High quality, memory cost).
* **IGN (Interleaved Gradient Noise):** Algebraic (High speed, ALU-only).
    * *Note:* We acknowledge that IGN is optimized for Temporal Anti-Aliasing (TAA). In our static benchmarks, IGN may score lower than Blue Noise due to its high-frequency "checkerboard" pattern. This is a noted trade-off: we accept lower static SSIM for the benefit of ALU-only performance.

**B. Amplitude Logic (The New Variable)**
We test three levels of mathematical precision for the noise scaling factor $w$:
* **Control (Uniform):** Constant noise amplitude ξ applied across the entire UV map ($w$=1.0).
* **Analytical Jacobian**: $w$ is calculated using the explicit partial derivatives of the Octahedral projection. The noise is scaled by the determinant of the Jacobian matrix J, ensuring noise density is mathematically normalized relative to surface area:
$$ w=\frac{1}{\sqrt{det(J^TJ)}}​ $$
* **Heuristic Approximation**: $w$ is calculated using a low-cost proxy based on the "fold" region of the Octahedral map, approximated by the Z-component of the normal.
$$ w=smoothstep(0.0,ϵ,|N.z|) $$

*Hypothesis: We expect this to approximate the Analytical result at <10% of the ALU cost.*

### 3. Rotational Stress Test
To ensure we capture artifacts at the "poles" and "diagonals" of the Octahedral map, the test sphere will rotate relative to the light source. 
We will capture frames specifically when the specular highlight crosses regions of highest geometric distortion (where the derivative of the projection approaches infinity). We isolate single-frame signal degradation (SSIM) rather than temporal noise coherence, as the latter is highly dependent on the specific TAA implementation used by the renderer.

To ensure the 'BRDF amplification' of quantization errors is captured, Surface Roughness will be strictly clamped to the 0.1–0.2 range. We avoid α=0.0 (perfect mirror) as it eliminates the gradient falloff where banding is most visible, and avoid α>0.4 as it masks the very artifacts we aim to measure.

### 4. Metrics
Once the images are exported, we will use Python scripts and CLI tools to generate the error metrics:
* **FLIP (NVIDIA):** We will run the official FLIP tool to generate Perceptual Error Maps. We will specifically look for "fireflies" (high-contrast error dots) which indicate failed dithering at the poles.
* **SSIM (Structural Similarity):** Computed via Python (Scikit-Image) to measure global structural consistency against the Ground Truth.
* **Angular Error Heatmap:** We will compute the angle $\theta$ between the ground truth vector $N_{gt}$ and the reconstructed vector $N_{rec}$:
    $$\theta = \arccos(N_{gt} \cdot N_{rec})$$
    This allows us to visualize if the **Weighted** dithering successfully reduces the anisotropic stretching errors along the diagonals compared to **Uniform** dithering.
* **Specular Luminance Delta:** While Angular Error measures the vector difference, it does not account for visual impact. We will compute the per-pixel luminance difference specifically within the specular lobe region: $ΔL=∣L_{GroundTruth}​ − L_{target}​∣$. This differentiates between a normal vector error in a shadow (invisible) vs. a highlight (highly visible).
* **Shader Complexity (Instruction Count)**: We will compile both the Analytical and Heuristic shaders to SPIR-V/ISA to compare the instruction count and register pressure. This quantifies the "cost" of the precision gained by the Analytical method.

## Hypothesis
1.  **The Weighting Correction:** We hypothesize that **Target A (12-bit) + Uniform Dithering** will fail at the poles (manifesting as distinct banding in the specular highlight), whereas **Target A + Jacobian-Weighted Dithering** will smooth these artifacts, achieving parity with the 16-bit Baseline.
2.  **The Efficiency Victory:** The 12-bit Weighted Octahedral method will achieve an SSIM score >0.98. This confirms that smart math (Jacobian attenuation) allows us to "buy back" the precision lost by discarding 4 bits. We also hypothesize that the Heuristic Approximation will achieve an SSIM score within 0.5% of the Analytical Jacobian while requiring significantly fewer GPU cycles. This would prove that for real-time rendering, exact derivative calculation is unnecessary, and simple Z-based damping is sufficient to hide quantization artifacts.
3.  **The IGN Trade-off:** While Blue Noise will yield the highest static SSIM, IGN will perform within an acceptable margin for real-time applications. We predict the visual difference between IGN and Blue Noise will be negligible once Jacobian Weighting is applied, as the weighting suppresses the worst-case noise pixels.

## Expected Deliverables
1.  **Efficiency Curve:** A graph plotting Bit-Depth (X-axis) vs. SSIM Score (Y-axis).
2. **Heatmap of Bit-Efficiency** A heatmap where color = ∣NGT​−NTarget​∣.The goal is to show that our "Weighted Dithering" redistributes the error so that it is perceptually uniform, rather than clustered at the poles.
2.  **The "Artifact Grid":** A side-by-side visual comparison of the specular highlight at the Octahedral Pole, showing: [No Dither] vs [Uniform Dither] vs [Weighted Dither].
3.  **Code Snippet:** A copy-paste ready GLSL function for "Jacobian-Weighted Octahedral Encoding" for public use.