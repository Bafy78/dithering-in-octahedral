# Theoretical Optimality of Uniform Dithering in Non-Conformal Normal Mapping

## Introduction
In the context of G-Buffer compression, High-Quality (HQ) normal mapping relies on non-linear projections—specifically Octahedral (Oct) and Hemi-Octahedral encodings—to map the unit sphere $S^2$ onto a 2D square domain $\Omega = [0,1]^2$. A primary concern in precision analysis is the non-uniform distribution of density resulting from these projections. Since the mapping $\Phi: \Omega \rightarrow S^2$ is not isometric, the surface area represented by a single texel varies across the domain.

A natural hypothesis for optimizing perceptual quality is that the amplitude of dithering noise injected in the domain $\Omega$ should be modulated by the inverse of the local geometric distortion (i.e., the Jacobian determinant of $\Phi$). This section investigates this hypothesis. We present a theoretical proof that **Uniform Probability Density Function (PDF) Dithering** in the domain space naturally yields the optimal noise distribution in the range space (View Space), regardless of the projection's distortion characteristics.

## First-Order Approximation of Quantization Error
Let the encoding function be a differentiable bijection $\Phi(u, v)$ mapping a coordinate $\mathbf{u} = [u, v]^T$ in texture space to a unit normal vector $\mathbf{n}$ in 3D space.

The process of quantization discretizes the continuous domain $\Omega$ into a grid with step size $\Delta$. The maximum quantization error vector in the domain space, $\mathbf{e}_{uv}$, is bounded by the grid spacing:
$$||\mathbf{e}_{uv}|| \leq \frac{\Delta}{2}$$

To understand the perceptual impact of this error, we analyze its projection onto the sphere. For a sufficiently high-resolution grid (e.g., 16-bit), we can approximate the manifold locally as a Euclidean plane. The projected error $\mathbf{e}_{3d}$ can be estimated via the first-order Taylor series expansion, governed by the Jacobian matrix $\mathbf{J}_\Phi(\mathbf{u})$:

$$\mathbf{e}_{3d} \approx \mathbf{J}_\Phi(\mathbf{u}) \cdot \mathbf{e}_{uv}$$

Here, $\mathbf{J}_\Phi$ encodes the local scaling and shearing (anisotropy) of the map. In regions of high distortion (such as the diagonals of the Octahedral map), the magnitude $||\mathbf{e}_{3d}||$ increases significantly. This is the source of the visible "banding" artifacts: the physical gaps between representable vectors become larger than the perceptual threshold.

## Invariance of the Noise-to-Signal Ratio
Dithering aims to mask these quantization gaps by injecting a random noise vector $\boldsymbol{\xi}$ prior to quantization. We analyze a standard uniform dithering strategy where the noise amplitude is fixed to the quantization step size $\Delta$ in the domain $\Omega$.

$$\boldsymbol{\xi}_{uv} \sim U\left[-\frac{\Delta}{2}, \frac{\Delta}{2}\right]$$

When this noise is projected into 3D View Space, it undergoes the same geometric transformation as the signal itself. The projected noise vector $\boldsymbol{\xi}_{3d}$ is locally approximated by:

$$\boldsymbol{\xi}_{3d} \approx \mathbf{J}_\Phi(\mathbf{u}) \cdot \boldsymbol{\xi}_{uv}$$

To determine the efficiency of the dithering, we define the **Masking Efficiency Ratio** ($R$) as the magnitude of the projected noise relative to the magnitude of the projected quantization gap. For ideal masking, we require the noise footprint to match the quantization footprint ($R \approx 1$).

$$R(\mathbf{u}) = \frac{||\boldsymbol{\xi}_{3d}||}{||\mathbf{e}_{3d}||} = \frac{||\mathbf{J}_\Phi(\mathbf{u}) \cdot \boldsymbol{\xi}_{uv}||}{||\mathbf{J}_\Phi(\mathbf{u}) \cdot \mathbf{e}_{uv}||}$$

Since the noise $\boldsymbol{\xi}_{uv}$ is defined to match the scale of the quantization error $\mathbf{e}_{uv}$ (i.e., $\boldsymbol{\xi}_{uv} \propto \mathbf{e}_{uv}$), the linear transformation $\mathbf{J}_\Phi$ scales both the numerator and the denominator identically.

Consequently, the Jacobian terms effectively cancel out in terms of relative coverage. The ratio $R$ remains constant across the entire domain $\Omega$, independent of the local distortion $\mathbf{J}_\Phi(\mathbf{u})$. Therefore, a scalar noise amplitude that is sufficient to mask banding at the "pole" of the Octahedral map (where distortion is minimal) is analytically guaranteed to be sufficient at the "diagonals" (where distortion is maximal).

## The Anisotropy Match
A critical consideration is the shape of the noise. Octahedral projections are non-conformal; they do not preserve angles. A square pixel in $\Omega$ may map to an elongated rhombus on $S^2$.

While one might attempt to employ Anisotropic Jacobian-Weighted Dithering to force the projected noise to remain isotropic (circular) on the sphere surface, this approach is theoretically suboptimal for masking quantization.

The quantization artifact itself is subject to the anisotropy of the projection; the "bands" effectively become "streaks" aligned with the major axis of the local Jacobian. To maximally disrupt this structured artifact with minimal energy, the dithering noise must possess the same anisotropic footprint.

* **Case A (Uniform Dithering):** The noise is stretched by $\mathbf{J}_\Phi$ into an elongated shape that perfectly overlays the elongated quantization cell. Coverage is complete with no excess noise.
* **Case B (Isotropic Corrected Dithering):** The noise is counter-scaled to appear circular.
    * Along the major axis (stretch direction), the circular noise is now smaller than the quantization gap, leading to **exposed banding**.
    * Along the minor axis (compress direction), the circular noise is larger than the quantization gap, leading to **excessive granular noise** that degrades the signal-to-noise ratio (SNR) without providing additional masking utility.

## Conclusion
We conclude that for any differentiable surface parameterization, uniform dithering in the parameter space is the theoretically optimal strategy for masking quantization error. The geometric distortion inherent to the projection acts as an automatic spatial modulator, scaling the projected noise variance in exact proportion to the projected quantization error. Attempts to analytically "correct" the noise distribution via Jacobian weighting result in a mismatch between the artifact shape and the noise shape, reducing the effective bit-depth of the container.