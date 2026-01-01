### **[Cigolle et al. 2014] A Survey of Efficient Representations for Independent Unit Vectors**

**Relevance to Research Plan:** **High** (Foundational Algorithm & Comparative Baseline)
**Role:** Canonical implementation source for `oct` and `hemi-oct` math ; baseline error data for validating the "Precise" control group.

**Specific Utility:**

* **Implementation of Target A/B/C (Hemi-Oct):**
    * **Listing 6 (Section 5)** provides the exact GLSL implementation for the **Hemi-Oct** variant. This is critical because standard Octahedral wastes precision for G-Buffers that only require a hemisphere; this listing confirms the "rotate and scale" method to map the hemisphere to the full unit square $[0,1]^2$.
    * **Table 3** explicitly compares `HemiOct` against `XYOnly` (your "Baseline" RG8). Cigolle’s data shows `HemiOct16` has significantly lower Mean/Max error than `XYOnly16`. This provides the *a priori* mathematical justification for the "Efficiency Victory" hypothesis—proving that the signal capacity exists before applying dithering.

* **Implementation of Target P (Precise Encoding):**
    * **Section 3.2 (Listing 3)** details the `octP` (Precise) encoding algorithm. You need this to implement the "Target P" control group. Cigolle explains how `octP` minimizes angular error by checking floor/ceil combinations rather than simple rounding. You will use this to demonstrate that while `octP` lowers MSE, it fails to solve the perceptual banding that Dithering fixes.

* **Validation of the "Dithering" Hypothesis:**
    * **Section 5 (Conclusions)** contains a direct endorsement of the proposed method. The authors state: *"When perception of error... is more important than actual error, we suggest that adding a little noise... would help to break up the quantization artifacts"*.
    * They cite that this is an "open challenge" to do coherently. The research effectively answers this call to action by formalizing the "noise addition" via Jacobian weighting rather than the "uncontrolled fashion" observed in Crysis 2.



### **[Meyer et al. 2010] On Floating-Point Normal Vectors**

**Relevance to Research Plan:** **Medium-High** (Theoretical Proof of Quantization Failure)
**Role:** The mathematical origin of the "Precise" encoding method; provides the geometric proof for *why* standard UV quantization introduces angular error.

**Specific Utility (Distinct from Cigolle):**

* **The Geometric "Why" for Target P:**
    * While Cigolle provides the GLSL implementation for `octP` (Precise), Meyer (Section 5) explains the **Voronoi Cell Mismatch**.
    * **Crucial Insight:** Meyer demonstrates that the Voronoi cells in the 2D parameter domain (squares) do *not* map to the Voronoi cells of the vectors on the sphere. This mismatch is the root cause of the "wobbly" quantization artifacts that your Dithering algorithm aims to mask. You can cite this to explain *why* the "Heuristic" weight is needed: the mapping is not bijective regarding nearest neighbors.

* **Derivation of the Error/Distortion Relationship:**
    * **Equation 10:** Meyer derives the maximum angular error $\Delta_{ONV}^{max}$ as a function of sample spacing $\epsilon$.
    * **Relevance:** Your "Jacobian Weighting" strategy assumes that Noise Amplitude should be proportional to geometric distortion. Meyer provides the analytical proof that error scales linearly with $\epsilon$ (sample spacing) for Octahedral maps ($O(\epsilon)$), whereas it scales with $\sqrt{\epsilon}$ for Parallel/Paraboloid projections ($O(\sqrt{\epsilon})$). This confirms that your weighting function for Octahedral maps should be linear, not quadratic.

* **Benchmarking the "Control" (Float32):**
    * **Section 3:** Provides a rigorous analysis of the error inherent in standard 32-bit floats (FPNVs).
    * **Relevance:** When you calculate SSIM against your "Ground Truth" (32-bit Float), you must acknowledge that Float32 itself is non-uniform. Meyer provides the math to quantify the "noise floor" of your Ground Truth, ensuring you don't chase precision that doesn't exist in the source data.


### https://bartwronski.com/2016/10/30/dithering-part-three-real-world-2d-quantization-dithering/

### Banding in Games

### https://www.shadertoy.com/view/4t2SDh

### https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/

### FSIM