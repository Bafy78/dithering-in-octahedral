import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import TwoSlopeNorm

def hemi_oct_decode(u, v):
    """
    Decodes Hemi-Oct coordinates (u, v in [-1, 1]) to Unit Vectors.
    Based on Cigolle et al. 2014, Listing 6.
    """
    # 1. Rotate and scale the unit square back to the center diamond
    temp_x = (u + v) * 0.5
    temp_y = (u - v) * 0.5
    
    # 2. Reconstruct the vector on the L1 sphere (octahedron)
    # The z component is implicit for the hemisphere
    z = 1.0 - np.abs(temp_x) - np.abs(temp_y)
    
    vec = np.dstack((temp_x, temp_y, z))
    
    # 4. Normalize to project onto the L2 sphere
    # Avoid division by zero at singular points (though unlikely in grid center)
    norm = np.linalg.norm(vec, axis=2, keepdims=True)
    return vec / norm

def compute_distortion():
    res = 1024
    
    # Create UV grid [-1, 1]
    # We use a slight epsilon to avoid the exact discontinuous edges for differentiation
    u = np.linspace(-1 + 1e-4, 1 - 1e-4, res)
    v = np.linspace(-1 + 1e-4, 1 - 1e-4, res)
    U, V = np.meshgrid(u, v)
    
    P = hemi_oct_decode(U, V)
    
    # Compute Partial Derivatives using Central Differences (np.gradient)
    # The step size is 2.0 / (res - 1) because our domain is size 2 [-1, 1]
    step = 2.0 / (res - 1)
    
    # dP/du (gradient along axis 1)
    dPx_du, dPx_dv = np.gradient(P[:,:,0], step)
    dPy_du, dPy_dv = np.gradient(P[:,:,1], step)
    dPz_du, dPz_dv = np.gradient(P[:,:,2], step)
    
    # Construct tangent vectors
    Tu = np.dstack((dPx_du, dPy_du, dPz_du))
    Tv = np.dstack((dPx_dv, dPy_dv, dPz_dv))
    
    # Compute Cross Product
    cross_prod = np.cross(Tu, Tv)
    
    # Distortion is the magnitude (length) of the cross product
    distortion = np.linalg.norm(cross_prod, axis=2)
    
    return U, V, distortion

def compute_anisotropy():
    res = 1024
    
    # 1. Setup Grid
    u = np.linspace(-1 + 1e-4, 1 - 1e-4, res)
    v = np.linspace(-1 + 1e-4, 1 - 1e-4, res)
    U, V = np.meshgrid(u, v)
    
    # 2. Decode to 3D Sphere
    P = hemi_oct_decode(U, V)
    
    # 3. Compute Gradients (Step size corrected for [-1,1] domain)
    step = 2.0 / (res - 1)
    
    dPx_du, dPx_dv = np.gradient(P[:,:,0], step)
    dPy_du, dPy_dv = np.gradient(P[:,:,1], step)
    dPz_du, dPz_dv = np.gradient(P[:,:,2], step)
    
    # 4. Construct Tangent Vectors
    Tu = np.dstack((dPx_du, dPy_du, dPz_du))
    Tv = np.dstack((dPx_dv, dPy_dv, dPz_dv))
    
    # 5. Compute "Stretch Factors" (Singular Values proxy)
    sigma_u = np.linalg.norm(Tu, axis=2)
    sigma_v = np.linalg.norm(Tv, axis=2)
    
    # 6. Compute Anisotropy Ratio
    anisotropy_ratio = sigma_u / (sigma_v + 1e-8)
    
    return U, V, anisotropy_ratio, sigma_u, sigma_v

# --- Execution ---
U, V, D = compute_distortion()

plt.figure(figsize=(10, 8))
plt.pcolormesh(U, V, D, shading='auto', cmap='inferno')
cbar = plt.colorbar()
cbar.set_label('Area Expansion Factor $\| \partial P/\partial u \\times \partial P/\partial v \|$')

plt.title("Hemi-Oct Jacobian Determinant (Area Distortion)")
plt.xlabel("U (Texture Coordinate)")
plt.ylabel("V (Texture Coordinate)")

plt.text(0, 0, 'Center\n(Normal Z=1)', color='white', ha='center', va='center', fontweight='bold')
plt.text(-0.9, 0.9, 'Corner\n(Horizon)', color='black', ha='center', va='center')

plt.show()

# --- Statistics for Hypothesis Verification ---
min_d = np.min(D)
max_d = np.max(D)
ratio = max_d / min_d
print(f"Minimum Distortion: {min_d:.5f}")
print(f"Maximum Distortion: {max_d:.5f}")
print(f"Distortion Ratio: {ratio:.5f} (1.0 = Perfectly Uniform)")


# --- Execution ---
U, V, Ratio, SigU, SigV = compute_anisotropy()

# --- Visualization ---
fig, ax = plt.subplots(1, 2, figsize=(16, 7))

# Plot 1: The Anisotropy Heatmap
# We use a Diverging Colormap centered at 1.0
norm = TwoSlopeNorm(vmin=np.min(Ratio), vcenter=1.0, vmax=np.max(Ratio))
im1 = ax[0].pcolormesh(U, V, Ratio, shading='auto', cmap='coolwarm', norm=norm)
cbar1 = plt.colorbar(im1, ax=ax[0])
cbar1.set_label('Anisotropy Ratio ($\sigma_u / \sigma_v$)')
ax[0].set_title("Anisotropy: Red = U-Stretch, Blue = V-Stretch")
ax[0].set_xlabel("U")
ax[0].set_ylabel("V")
ax[0].text(0, 0, 'Center', color='black', ha='center', va='center', fontweight='bold')

# Plot 2: Severity of Anisotropy (Deviation from 1.0)
# This shows "How bad is the worst axis?" regardless of direction
severity = np.maximum(Ratio, 1.0/Ratio)
im2 = ax[1].pcolormesh(U, V, severity, shading='auto', cmap='magma')
cbar2 = plt.colorbar(im2, ax=ax[1])
cbar2.set_label('Magnitude of Distortion (Factor)')
ax[1].set_title("Anisotropy Severity (1.0 = Ideal)")
ax[1].set_xlabel("U")
ax[1].set_ylabel("V")

plt.tight_layout()
plt.show()

# --- Quantitative Analysis ---
max_stretch = np.max(severity)
mean_stretch = np.mean(severity)
bad_pixels = np.sum(severity > 1.5) / severity.size * 100

print(f"--- Anisotropy Stats ---")
print(f"Max Anisotropy Factor: {max_stretch:.4f}x (A square pixel becomes a rectangle of this aspect ratio)")
print(f"Mean Anisotropy Factor: {mean_stretch:.4f}x")
print(f"Percent of map where aspect ratio > 1.5: {bad_pixels:.2f}%")

if max_stretch > 1.2:
    print("\n[CONCLUSION] The Scalar Assumption is RISKY.")
    print("Significant anisotropy detected. Scalar weighting will result in")
    print("elongated noise streaks in high-distortion areas.")
    print("Recommendation: Use Vector-Weighted Dithering (separate w_x, w_y).")
else:
    print("\n[CONCLUSION] The Scalar Assumption holds.")
    print("Anisotropy is negligible. Scalar weighting is sufficient.")