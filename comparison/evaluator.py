import sys
import os
import re
import argparse
import pyiqa
import torch

def process_image(input_path, metric):
    """
    Processes a single image: parses filename, finds GT, and calculates score.
    """
    directory, filename = os.path.split(input_path)

        # Parse the filename to get Roughness and Coordinates
    match = re.search(r'(R[\d\.]+).*_(Az\d+El\d+)\.png$', filename)

    if not match:
        print(f"[Skipping] Could not parse format for: {filename}")
        return

    roughness = match.group(1)   # e.g., "R0.150"
    coordinates = match.group(2) # e.g., "Az0El0"

    gt_filename = f"CROP_GroundTruth_{roughness}_{coordinates}.png"
    gt_path = os.path.join(directory, gt_filename)

    if not os.path.exists(gt_path):
        print(f"[Error] GT not found for {filename}\n   -> Looking for: {gt_filename}")
        return

    try:
        score = metric(gt_path, input_path)
        print(f"Image: {filename} | GT: {gt_filename} | Score: {score.item()}")
    except Exception as e:
        print(f"[Error] Failed to calculate metric for {filename}: {e}")

def main():
    parser = argparse.ArgumentParser(description="Calculate perceptual similarity against a Ground Truth.")
    parser.add_argument("path", type=str, help="Path to a single image OR a folder of images.")
    args = parser.parse_args()

    input_path = args.path
    
    if not os.path.exists(input_path):
        sys.exit(f"Error: The input path '{input_path}' does not exist.")

    print("Loading FSIM metric...")
    device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
    metric = pyiqa.create_metric('fsim', device=device)
    print("--------------------------------------------------")

    if os.path.isdir(input_path):
        print(f"Processing folder: {input_path}\n")
        
        files = sorted(os.listdir(input_path))
        
        count = 0
        for f in files:
            if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff')):
                full_path = os.path.join(input_path, f)
                process_image(full_path, metric)
                count += 1
        
        if count == 0:
            print("No image files found in the directory.")
            
    else:
        # Single file mode (Original behavior)
        process_image(input_path, metric)

if __name__ == "__main__":
    main()