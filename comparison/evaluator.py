import sys
import os
import re
import argparse
import pyiqa
import torch

def main():
    # 1. Setup argument parsing to get the image name/path
    parser = argparse.ArgumentParser(description="Calculate perceptual similarity against a Ground Truth.")
    parser.add_argument("image_path", type=str, help="Path to the input image (e.g., images/CROP_Hemi...)")
    args = parser.parse_args()

    input_path = args.image_path
    
    # Check if input exists
    if not os.path.exists(input_path):
        sys.exit(f"Error: The input file '{input_path}' does not exist.")

    # Split path to get directory and filename separately
    directory, filename = os.path.split(input_path)

    # 2. Parse the filename to get Roughness and Coordinates
    match = re.search(r'(R[\d\.]+).*_(Az\d+El\d+)\.png$', filename)

    if not match:
        sys.exit(f"Error: Could not parse Roughness (R) and Coordinates (Az/El) from filename: {filename}")

    roughness = match.group(1)   # e.g., "R0.150"
    coordinates = match.group(2) # e.g., "Az0El0"

    # 3. Construct the Ground Truth filename
    # Structure: CROP_GroundTruth_{Roughness}_{Coordinates}.png
    gt_filename = f"CROP_GroundTruth_{roughness}_{coordinates}.png"
    gt_path = os.path.join(directory, gt_filename)

    # 4. Throw an error if Ground Truth doesn't exist
    if not os.path.exists(gt_path):
        raise FileNotFoundError(
            f"Ground truth not found!\n"
            f"Looking for: {gt_path}\n"
            f"Required Roughness: {roughness}, Coordinates: {coordinates}"
        )

    print(f"Comparing:\nInput: {filename}\nGT:    {gt_filename}\n")

    # 5. Run the metric
    device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
    metric = pyiqa.create_metric('fsim', device=device)

    # Calculate score
    score = metric(gt_path, input_path)
    print(f"Perceptual Similarity: {score.item()}")

if __name__ == "__main__":
    main()