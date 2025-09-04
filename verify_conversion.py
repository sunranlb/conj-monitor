#!/usr/bin/env python3
"""
验证MKV到MP4转换结果的脚本
"""

import subprocess
import json

def get_stream_info(file_path):
    """获取文件的流信息"""
    cmd = [
        'ffprobe', 
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        file_path
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        return json.loads(result.stdout)
    return None

def main():
    print("🔍 验证MKV到MP4转换结果\n")
    
    mkv_file = "mkv/1.mkv"
    mp4_file = "mp4/1.mp4"
    
    # 获取流信息
    mkv_info = get_stream_info(mkv_file)
    mp4_info = get_stream_info(mp4_file)
    
    if not mkv_info or not mp4_info:
        print("❌ 无法获取文件信息")
        return
    
    mkv_streams = mkv_info['streams']
    mp4_streams = mp4_info['streams']
    
    print(f"📹 原始MKV文件: {mkv_file}")
    print(f"   总共 {len(mkv_streams)} 个流")
    
    # 统计MKV流类型
    mkv_video = [s for s in mkv_streams if s['codec_type'] == 'video']
    mkv_audio = [s for s in mkv_streams if s['codec_type'] == 'audio']
    mkv_subtitle = [s for s in mkv_streams if s['codec_type'] == 'subtitle']
    
    print(f"   - 视频流: {len(mkv_video)}")
    print(f"   - 音频流: {len(mkv_audio)}")
    print(f"   - 字幕流: {len(mkv_subtitle)}")
    
    for i, sub in enumerate(mkv_subtitle):
        lang = sub.get('tags', {}).get('language', 'unknown')
        title = sub.get('tags', {}).get('title', 'No title')
        codec = sub.get('codec_name', 'unknown')
        print(f"     字幕 {i+1}: {title} ({lang}) - {codec}")
    
    print(f"\n🎬 转换后MP4文件: {mp4_file}")
    print(f"   总共 {len(mp4_streams)} 个流")
    
    # 统计MP4流类型
    mp4_video = [s for s in mp4_streams if s['codec_type'] == 'video']
    mp4_audio = [s for s in mp4_streams if s['codec_type'] == 'audio']
    mp4_subtitle = [s for s in mp4_streams if s['codec_type'] == 'subtitle']
    
    print(f"   - 视频流: {len(mp4_video)}")
    print(f"   - 音频流: {len(mp4_audio)}")
    print(f"   - 字幕流: {len(mp4_subtitle)}")
    
    for i, sub in enumerate(mp4_subtitle):
        lang = sub.get('tags', {}).get('language', 'unknown')
        codec = sub.get('codec_name', 'unknown')
        print(f"     字幕 {i+1}: ({lang}) - {codec}")
    
    # 验证结果
    print(f"\n📊 转换验证:")
    if len(mkv_subtitle) == len(mp4_subtitle):
        print(f"✅ 字幕流数量匹配: {len(mkv_subtitle)} -> {len(mp4_subtitle)}")
    else:
        print(f"❌ 字幕流数量不匹配: {len(mkv_subtitle)} -> {len(mp4_subtitle)}")
    
    if len(mkv_audio) == len(mp4_audio):
        print(f"✅ 音频流数量匹配: {len(mkv_audio)} -> {len(mp4_audio)}")
    else:
        print(f"❌ 音频流数量不匹配: {len(mkv_audio)} -> {len(mp4_audio)}")
    
    if len(mkv_video) == len(mp4_video):
        print(f"✅ 视频流数量匹配: {len(mkv_video)} -> {len(mp4_video)}")
    else:
        print(f"❌ 视频流数量不匹配: {len(mkv_video)} -> {len(mp4_video)}")

if __name__ == "__main__":
    main()
