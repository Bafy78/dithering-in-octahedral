import pyiqa
import torch

# 'dists' or 'lpips' are standard for this. 
# 'dists' is often better at ignoring texture/grain differences than LPIPS.
device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
metric = pyiqa.create_metric('fsim', device=device)

# Lower score is better (0 = identical perception)
score = metric('images/ground_truth.png', 'images/8_bits_oct_blue_noise_1.png')
print(f"Perceptual Similarity: {score.item()}")