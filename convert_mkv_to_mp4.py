#!/usr/bin/env python3
"""
MKV to MP4 converter script
Converts all MKV files in the mkv/ directory to MP4 format
"""

import os
import subprocess
import sys
from pathlib import Path

def convert_mkv_to_mp4(mkv_path, mp4_path, burn_subtitles=False):
    """
    Convert a single MKV file to MP4 using ffmpeg
    
    Args:
        mkv_path (str): Path to the input MKV file
        mp4_path (str): Path to the output MP4 file
        burn_subtitles (bool): Whether to burn subtitles into video
    
    Returns:
        bool: True if conversion successful, False otherwise
    """
    try:
        if burn_subtitles:
            # Burn subtitles into video with larger font
            # Use Chinese Simplified subtitles (si=7) instead of Forced subtitles (si=0)
            cmd = [
                'ffmpeg',
                '-i', mkv_path,
                '-c:v', 'libx264',     # Re-encode video to burn subtitles
                '-c:a', 'copy',        # Copy audio without re-encoding
                '-vf', f'subtitles={mkv_path}:si=7:force_style=\'FontSize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=2,BackColour=&H80000000\'',  # Burn Chinese Simplified subtitle with larger font and background
                '-movflags', '+faststart',
                mp4_path,
                '-y'  # Overwrite output file if it exists
            ]
        else:
            # Use ffmpeg to convert MKV to MP4
            # -i: input file
            # -c:v copy: copy video stream without re-encoding
            # -c:a copy: copy audio stream without re-encoding  
            # -c:s copy: copy subtitle stream without re-encoding
            # -map 0: map all streams from input
            # -movflags +faststart: optimize for web streaming
            cmd = [
                'ffmpeg',
                '-i', mkv_path,
                '-map', '0',           # Map all streams from input
                '-c:v', 'copy',        # Copy video without re-encoding
                '-c:a', 'copy',        # Copy audio without re-encoding
                '-c:s', 'mov_text',    # Convert subtitles to MP4 compatible format
                '-movflags', '+faststart',
                mp4_path,
                '-y'  # Overwrite output file if it exists
            ]
        
        print(f"Converting {os.path.basename(mkv_path)} to {os.path.basename(mp4_path)}...")
        
        # Run the conversion
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"✅ Successfully converted {os.path.basename(mkv_path)}")
            return True
        else:
            print(f"❌ Error converting {os.path.basename(mkv_path)}: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"❌ Exception occurred while converting {os.path.basename(mkv_path)}: {str(e)}")
        return False

def main():
    """Main function to process all MKV files"""
    
    # Set up paths
    script_dir = Path(__file__).parent
    mkv_dir = script_dir / "mkv"
    mp4_dir = script_dir / "mp4"
    mp4_burned_dir = script_dir / "mp4_burned"
    
    # Check if mkv directory exists
    if not mkv_dir.exists():
        print(f"❌ MKV directory not found: {mkv_dir}")
        return
    
    # Create output directories if they don't exist
    mp4_dir.mkdir(exist_ok=True)
    mp4_burned_dir.mkdir(exist_ok=True)
    print(f"📁 Regular MP4 output directory: {mp4_dir}")
    print(f"📁 Burned subtitle MP4 output directory: {mp4_burned_dir}")
    
    # Find all MKV files
    mkv_files = list(mkv_dir.glob("*.mkv"))
    
    if not mkv_files:
        print("❌ No MKV files found in the mkv directory")
        return
    
    print(f"🎬 Found {len(mkv_files)} MKV file(s) to convert")
    
    # Convert each MKV file - both regular and burned subtitle versions
    successful_conversions = 0
    failed_conversions = 0
    
    for mkv_file in mkv_files:
        # Generate output filenames
        mp4_file = mp4_dir / f"{mkv_file.stem}.mp4"
        mp4_burned_file = mp4_burned_dir / f"{mkv_file.stem}_burned.mp4"
        
        # Convert regular version
        print(f"\n🔄 Converting regular version...")
        if convert_mkv_to_mp4(str(mkv_file), str(mp4_file), burn_subtitles=False):
            successful_conversions += 1
        else:
            failed_conversions += 1
        
        # Convert burned subtitle version
        print(f"🔥 Converting burned subtitle version...")
        if convert_mkv_to_mp4(str(mkv_file), str(mp4_burned_file), burn_subtitles=True):
            successful_conversions += 1
        else:
            failed_conversions += 1
    
    # Print summary
    print(f"\n📊 Conversion Summary:")
    print(f"✅ Successful: {successful_conversions}")
    print(f"❌ Failed: {failed_conversions}")
    print(f"📁 Regular MP4 files saved to: {mp4_dir}")
    print(f"📁 Burned subtitle MP4 files saved to: {mp4_burned_dir}")
    print(f"\n💡 Tips:")
    print(f"   - Regular MP4: Contains separate subtitle tracks (small font)")
    print(f"   - Burned MP4: Subtitles burned into video (large font, always visible)")

if __name__ == "__main__":
    main()
