# The Invariance of Dithering Efficiency Under Non-Conformal Projections: A Case Study on Octahedral Normal Maps

## Abstract

## 1. Introduction

### 1.1 The Bandwidth Bottleneck: Briefly context setting on G-Buffer quantization (16-bit constraints) and the industry standard shift to Octahedral (Oct) and Hemi-Octahedral encoding

### 1.2 The Problem of Variable Density: Define the core tension—Octahedral maps are not area-preserving and not shape-preserving. They introduce significant distortion at the mid-quadrants

### 1.3 The Hypothesis of Weighted Dithering: Introduce the intuitive (but incorrect) assumption: that variable geometric distortion requires variable (Jacobian-weighted) noise to achieve perceptual uniformit

### 1.4 Contribution: State the paper's conclusion upfront—that Uniform PDF Dithering in texture space is theoretically optimal because noise and quantization error undergo identical projection transformations

## 2. Related Work

### 2.1 Unit Vector Encodings: Survey of Stereographic, Paraboloid, and the dominance of Octahedral (Meyer et al., Cigolle et al.)

### 2.2 Quantization & Dithering: Overview of standard approaches (Bayer, Blue Noise, IGN) and current scalar weighting strategies in HDR imaging

### 2.3 Perceptual Metrics in Rendering: Brief touch on FSIM as superior metrics to MSE or even SSIM or FLIP for normal map artifacts

## 3. Theoretical Analysis

### 3.1 Differential Geometry of the Projection: Define the mapping Φ:Ω→S2. Introduce the Jacobian JΦ​(u) and the First-Order Taylor expansion of the error

To quantify the non-uniformity of the Hemi-Octahedral projection, we performed a numerical analysis of the Jacobian determinant across the domain Ω. Contrary to the assumption of area-preservation, our analysis reveals significant variance in pixel density. The determinant ranges from a compressed 0.6 at the pole to a highly expanded 2.55 at the mid-quadrants ('cheeks'), indicating that precision density varies by a factor of over 4× across the view frustum.

Insert the "Topology Discovery" plot here

### 3.2 The Quantization Error Model: Mathematical definition of the "shape" of a quantization cell on the sphere surface (e3d​)

### 3.3 Noise Propagation & The Ratio Test

        Derive the projected noise vector ξ3d​.

        The Proof: Demonstrate that the Masking Efficiency Ratio R=∣∣ξ3d​∣∣/∣∣e3d​∣∣ simplifies to a constant when ξuv​∝Δ.
        We numerically verified this invariance by computing the local Masking Efficiency Ratio R for 10242 vectors across the hemisphere. As predicted by the first-order Taylor approximation, the ratio remained effectively constant across the entire domain (Mean: 1.00, σ<1e−6), confirming that the projected noise scales in exact proportion to the projected quantization gap.
        Insert the scatter plot from your notebook (plt.scatter(range(len(ratios)), ratios...)) here. It will look like a flat line, which is visually powerful evidence that the "problem" is solved by the geometry itself.

### 3.4 The Anisotropy Fallacy

        Analyze the shape of the artifacts (streaks).

        Contrast Case A (Uniform) vs. Case B (Jacobian-Corrected).

        Prove why "circular" noise on the sphere is suboptimal because it fails to cover the "major axis" of the quantization streak (under-dithering) while adding waste energy on the "minor axis" (over-dithering).

## 4. Experimental Methodology

### 4.1 Implementation: Description of the WebGPU/Three.js pipeline and the specific WGSL implementation of Hemi-Octahedral encoding

### 4.2 The Comparator: Explicitly defining the "Strawman" algorithm—Anisotropic Jacobian-Weighted Dithering (AJWD)—which attempts to enforce isotropic noise in View Space

### 4.3 Test Scenarios

        Stress Test: Sphere setup with high-specular materials (Roughness 0.1) to maximize "banding" visibility.

        Noise Types: Testing IGN vs. Blue Noise, and Rectangular vs Triangular to see if frequency distribution alters the geometric masking conclusion.

## 5. Results & Evaluation

### 5.1 Visual Inspection (The Artifact Grid)

        Compare the max distortion places vs. min distortion places.

        Demonstrate that AJWD exposes banding in high-stretch regions (due to noise shrinking) or creates "sandpaper" artifacts in compressed regions.

### 5.2 Quantitative Metrics

        FSIM Error Maps: Heatmaps showing perceptual failure points. Expectation: Uniform Dithering has a lower mean FSIM score than AJWD.

### 5.3 Performance Analysis

        ALU cost comparison. Show that calculating det(J) or partial derivatives adds significant shader overhead ( 10−15 instructions) for negative visual gain.

## 6. Discussion

### 6.1 The Intuition Trap: Discuss why graphics engineers often conflate Sampling Density (which needs weighting, e.g., in Monte Carlo integration) with Quantization Masking (which generally does not)

### 6.2 Temporal Stability: Briefly mention that while Uniform Dithering is spatially optimal, there remains the separate temporal challenge mentionned in Cigolle et Al., but Jacobian weighting does not solve it

## 7. Conclusion

    Summarize the findings: Complexity does not equal Quality.

    Final recommendation: Standard 16-bit Hemi-Oct with Uniform noise is the Pareto-optimal solution for G-Buffers.
