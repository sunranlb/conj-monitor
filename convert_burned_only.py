#!/usr/bin/env python3
"""
Script to re-convert burned subtitle versions only
"""

import os
import subprocess
import sys
from pathlib import Path

def convert_mkv_to_mp4_burned(mkv_path, mp4_path):
    """
    Convert a single MKV file to MP4 with burned Chinese subtitles
    """
    try:
        cmd = [
            'ffmpeg',
            '-i', mkv_path,
            '-c:v', 'libx264',     # Re-encode video to burn subtitles
            '-c:a', 'copy',        # Copy audio without re-encoding
            '-vf', f'subtitles={mkv_path}:si=7:force_style=\'FontSize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=2,BackColour=&H80000000\'',  # Burn Chinese Simplified subtitle
            '-movflags', '+faststart',
            mp4_path,
            '-y'  # Overwrite output file if it exists
        ]
        
        print(f"🔥 Converting with burned Chinese subtitles: {os.path.basename(mkv_path)}")
        
        # Run the conversion
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"✅ Successfully converted {os.path.basename(mkv_path)} with burned subtitles")
            return True
        else:
            print(f"❌ Error converting {os.path.basename(mkv_path)}: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"❌ Exception occurred while converting {os.path.basename(mkv_path)}: {str(e)}")
        return False

def main():
    """Main function to process all MKV files for burned subtitle conversion"""
    
    # Set up paths
    script_dir = Path(__file__).parent
    mkv_dir = script_dir / "mkv"
    mp4_burned_dir = script_dir / "mp4_burned"
    
    # Create output directory if it doesn't exist
    mp4_burned_dir.mkdir(exist_ok=True)
    print(f"📁 Burned subtitle MP4 output directory: {mp4_burned_dir}")
    
    # Find all MKV files
    mkv_files = list(mkv_dir.glob("*.mkv"))
    
    if not mkv_files:
        print("❌ No MKV files found in the mkv directory")
        return
    
    print(f"🎬 Found {len(mkv_files)} MKV file(s) to convert with burned subtitles")
    
    # Convert each MKV file to burned subtitle version
    successful_conversions = 0
    failed_conversions = 0
    
    for mkv_file in mkv_files:
        mp4_burned_file = mp4_burned_dir / f"{mkv_file.stem}_burned.mp4"
        
        # Skip if already exists and is recent
        if mp4_burned_file.exists():
            print(f"⏭️  Skipping {mkv_file.name} - burned version already exists")
            continue
            
        if convert_mkv_to_mp4_burned(str(mkv_file), str(mp4_burned_file)):
            successful_conversions += 1
        else:
            failed_conversions += 1
    
    # Print summary
    print(f"\n📊 Burned Subtitle Conversion Summary:")
    print(f"✅ Successful: {successful_conversions}")
    print(f"❌ Failed: {failed_conversions}")
    print(f"📁 Burned subtitle MP4 files saved to: {mp4_burned_dir}")

if __name__ == "__main__":
    main()
