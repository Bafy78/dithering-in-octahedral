# Verification of the assumptions
## 1. Is Hemi-Oct area-preserving?

### Explanation
Check if the Jacobian determinant of the hemi oct is actually different from 1! If its variance is too low, the idea is useless.  This could happen as the oct mapping is designed to be area-preserving.

### Action
Generated `hemi_oct_distortion.py` to  numerically compute the Jacobian determinant (area distortion factor) of the Hemispherical Octahedral projection. The script maps a UV grid to spherical coordinates and calculates the magnitude of the cross product of partial derivatives ($\|\partial P/\partial u \times \partial P/\partial v\|$) to visualize where the mapping stretches or compresses relative to the texture space.

### Result
* **Assumption Verified:** The mapping is strictly **non-uniform**. The Jacobian determinant is significantly different from 1.0, ranging from $\approx 0.008$ to $\approx 2.55$. This confirms that standard uniform dithering is mathematically suboptimal.
* **Topology Discovery:** The distortion profile looks like this:
    * **Center (Pole):** $D \approx 0.6$. The mapping is *compressed* here, meaning the pole actually has higher resolution than a uniform mapping.
    * **Mid-Quadrants ("Cheeks"):** $D \approx 2.55$. These are the regions of highest expansion (lowest precision), roughly 45° from the view vector.
    * **Edges (Horizon):** $D < 0.01$. Collapse near the singularity.
* **Conclusion:** The variance is high enough to justify the research. The "Four-Peak" distribution proves that a simple radial heuristic (distance from center) would fail, validating the need for the Analytical Jacobian approach to target the specific mid-quadrant danger zones.

