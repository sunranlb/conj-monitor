#!/usr/bin/env python3
"""
监控MKV到MP4转换进度的脚本
"""

import os
import time
from pathlib import Path

def get_file_size_mb(file_path):
    """获取文件大小（MB）"""
    try:
        size_bytes = os.path.getsize(file_path)
        return size_bytes / (1024 * 1024)
    except:
        return 0

def monitor_conversion():
    """监控转换进度"""
    script_dir = Path(__file__).parent
    mkv_dir = script_dir / "mkv"
    mp4_dir = script_dir / "mp4"
    mp4_burned_dir = script_dir / "mp4_burned"
    
    # 获取所有MKV文件
    mkv_files = list(mkv_dir.glob("*.mkv"))
    mkv_files.sort()  # 按名称排序
    
    total_files = len(mkv_files)
    print(f"🎬 总共需要转换 {total_files} 个MKV文件")
    print(f"📁 每个文件将生成2个版本：常规版本 + 烧录字幕版本")
    print(f"📊 总共需要生成 {total_files * 2} 个MP4文件\n")
    
    while True:
        print("\n" + "="*80)
        print(f"📊 转换进度监控 - {time.strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*80)
        
        regular_completed = 0
        burned_completed = 0
        
        for i, mkv_file in enumerate(mkv_files, 1):
            mkv_name = mkv_file.stem
            
            # 检查常规版本
            regular_mp4 = mp4_dir / f"{mkv_name}.mp4"
            burned_mp4 = mp4_burned_dir / f"{mkv_name}_burned.mp4"
            
            regular_status = "✅" if regular_mp4.exists() else "⏳"
            burned_status = "✅" if burned_mp4.exists() else "⏳"
            
            if regular_mp4.exists():
                regular_completed += 1
                regular_size = get_file_size_mb(regular_mp4)
                regular_info = f"{regular_size:.1f}MB"
            else:
                regular_info = "等待中..."
            
            if burned_mp4.exists():
                burned_completed += 1
                burned_size = get_file_size_mb(burned_mp4)
                burned_info = f"{burned_size:.1f}MB"
            else:
                burned_info = "等待中..."
            
            print(f"{i:2d}. {mkv_name}")
            print(f"    常规版本: {regular_status} {regular_info}")
            print(f"    烧录版本: {burned_status} {burned_info}")
        
        # 总体进度
        total_completed = regular_completed + burned_completed
        total_expected = total_files * 2
        progress_percent = (total_completed / total_expected) * 100
        
        print(f"\n📈 总体进度: {total_completed}/{total_expected} ({progress_percent:.1f}%)")
        print(f"🎥 常规版本: {regular_completed}/{total_files}")
        print(f"🔥 烧录版本: {burned_completed}/{total_files}")
        
        if total_completed == total_expected:
            print("\n🎉 所有文件转换完成！")
            break
        
        print(f"\n⏰ 等待30秒后刷新...")
        time.sleep(30)

if __name__ == "__main__":
    try:
        monitor_conversion()
    except KeyboardInterrupt:
        print("\n\n👋 监控已停止")
