#!/usr/bin/env python3
"""
Test script to verify subtitle burning functionality
Creates a short test clip with burned subtitles
"""

import subprocess
import sys
from pathlib import Path

def test_subtitle_burn():
    """Test subtitle burning with a short clip"""
    
    # Set up paths
    script_dir = Path(__file__).parent
    mkv_dir = script_dir / "mkv"
    test_dir = script_dir / "test_output"
    
    # Create test directory
    test_dir.mkdir(exist_ok=True)
    
    # Find first MKV file for testing
    mkv_files = list(mkv_dir.glob("*.mkv"))
    if not mkv_files:
        print("❌ No MKV files found for testing")
        return
    
    mkv_file = mkv_files[0]
    test_output = test_dir / f"test_burned_{mkv_file.stem}.mp4"
    
    print(f"🧪 Testing subtitle burn with: {mkv_file.name}")
    print(f"📁 Output: {test_output}")
    
    # Create a short test clip (first 30 seconds) with burned subtitles
    cmd = [
        'ffmpeg',
        '-i', str(mkv_file),
        '-t', '30',  # Only first 30 seconds for testing
        '-c:v', 'libx264',
        '-c:a', 'copy',
        '-vf', f'subtitles={mkv_file}:si=7:force_style=\'FontSize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=2,BackColour=&H80000000\'',
        '-movflags', '+faststart',
        str(test_output),
        '-y'
    ]
    
    try:
        print("🔄 Running test conversion...")
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✅ Test conversion successful!")
            print(f"📁 Test file created: {test_output}")
            
            # Check file size
            file_size = test_output.stat().st_size / (1024 * 1024)  # MB
            print(f"📊 File size: {file_size:.1f} MB")
            
        else:
            print("❌ Test conversion failed:")
            print(f"Error: {result.stderr}")
            
    except Exception as e:
        print(f"❌ Exception occurred: {str(e)}")

if __name__ == "__main__":
    test_subtitle_burn()
