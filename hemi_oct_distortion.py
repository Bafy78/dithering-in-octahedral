import numpy as np
import matplotlib.pyplot as plt

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
