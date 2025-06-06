const ffmpeg = require('fluent-ffmpeg');
const Jimp = require('jimp');
const fs = require('fs-extra');
const path = require('path');

class VideoAdDetector {
    constructor() {
        this.videoPath = './01.mp4';
        this.adFramesDir = './ad_frame';
        this.tempDir = './temp_frames';
        this.intervalSeconds = 10;
        this.adFrames = [];
        this.similarityThreshold = 0.85; // 相似度阈值，可调整
    }

    async init() {
        console.log('🚀 初始化视频广告检测器...');
        
        // 创建临时目录
        await fs.ensureDir(this.tempDir);
        
        // 加载广告帧
        await this.loadAdFrames();
        
        console.log(`✅ 已加载 ${this.adFrames.length} 个广告帧用于对比`);
    }

    async loadAdFrames() {
        console.log('📂 加载广告帧图片...');
        const files = await fs.readdir(this.adFramesDir);
        const imageFiles = files.filter(file => file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.png'));
        
        for (const file of imageFiles) {
            try {
                const imagePath = path.join(this.adFramesDir, file);
                const image = await Jimp.read(imagePath);
                this.adFrames.push({
                    name: file,
                    image: image
                });
            } catch (error) {
                console.warn(`⚠️  无法加载广告帧: ${file}`, error.message);
            }
        }
    }

    async getVideoDuration() {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(this.videoPath, (err, metadata) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(metadata.format.duration);
                }
            });
        });
    }

    async extractFrameAtTime(timeInSeconds) {
        const outputPath = path.join(this.tempDir, `frame_${timeInSeconds}.jpg`);
        
        return new Promise((resolve, reject) => {
            ffmpeg(this.videoPath)
                .seekInput(timeInSeconds)
                .frames(1)
                .output(outputPath)
                .on('end', () => resolve(outputPath))
                .on('error', reject)
                .run();
        });
    }

    async compareImages(image1, image2) {
        try {
            // 调整图片大小以提高比较速度
            const size = 64;
            const img1 = image1.clone().resize(size, size);
            const img2 = image2.clone().resize(size, size);
            
            // 计算图像相似度（使用像素差异）
            const diff = Jimp.diff(img1, img2);
            const similarity = 1 - diff.percent;
            
            return similarity;
        } catch (error) {
            console.warn('图像比较错误:', error.message);
            return 0;
        }
    }

    async findMatchingAdFrame(extractedFrame) {
        let bestMatch = null;
        let bestSimilarity = 0;

        for (const adFrame of this.adFrames) {
            const similarity = await this.compareImages(extractedFrame, adFrame.image);
            
            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = adFrame;
            }
        }

        return {
            match: bestMatch,
            similarity: bestSimilarity,
            isMatch: bestSimilarity >= this.similarityThreshold
        };
    }

    async processVideo() {
        console.log('🎬 开始处理视频...');
        
        const duration = await this.getVideoDuration();
        console.log(`📹 视频总时长: ${duration.toFixed(2)} 秒`);
        
        const totalFrames = Math.floor(duration / this.intervalSeconds);
        console.log(`🎯 将抽取 ${totalFrames} 个帧进行检测 (每${this.intervalSeconds}秒一帧)\n`);
        
        const results = [];
        
        for (let i = 0; i < totalFrames; i++) {
            const timeInSeconds = i * this.intervalSeconds;
            console.log(`⏰ 处理第 ${i + 1}/${totalFrames} 帧 (时间: ${timeInSeconds}秒)`);
            
            try {
                // 提取帧
                const framePath = await this.extractFrameAtTime(timeInSeconds);
                const extractedFrame = await Jimp.read(framePath);
                
                // 与广告帧对比
                const matchResult = await this.findMatchingAdFrame(extractedFrame);
                
                const result = {
                    timeInSeconds,
                    frameNumber: i + 1,
                    ...matchResult
                };
                
                results.push(result);
                
                if (matchResult.isMatch) {
                    console.log(`✅ 检测到广告匹配! 相似度: ${(matchResult.similarity * 100).toFixed(2)}%, 匹配帧: ${matchResult.match.name}`);
                } else {
                    console.log(`❌ 未检测到广告匹配 (最高相似度: ${(matchResult.similarity * 100).toFixed(2)}%)`);
                }
                
                // 删除临时帧文件
                await fs.remove(framePath);
                
            } catch (error) {
                console.error(`❌ 处理第 ${i + 1} 帧时出错:`, error.message);
                results.push({
                    timeInSeconds,
                    frameNumber: i + 1,
                    error: error.message,
                    isMatch: false
                });
            }
            
            console.log(''); // 空行分隔
        }
        
        return results;
    }

    async cleanup() {
        console.log('🧹 清理临时文件...');
        await fs.remove(this.tempDir);
    }

    printSummary(results) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 检测结果汇总');
        console.log('='.repeat(60));
        
        const totalFrames = results.length;
        const matchedFrames = results.filter(r => r.isMatch).length;
        const errorFrames = results.filter(r => r.error).length;
        
        console.log(`总帧数: ${totalFrames}`);
        console.log(`匹配帧数: ${matchedFrames}`);
        console.log(`错误帧数: ${errorFrames}`);
        console.log(`匹配率: ${((matchedFrames / totalFrames) * 100).toFixed(2)}%`);
        
        if (matchedFrames > 0) {
            console.log('\n🎯 检测到的广告时间点:');
            results.filter(r => r.isMatch).forEach(result => {
                const minutes = Math.floor(result.timeInSeconds / 60);
                const seconds = result.timeInSeconds % 60;
                console.log(`  - ${minutes}:${seconds.toString().padStart(2, '0')} (相似度: ${(result.similarity * 100).toFixed(2)}%, 匹配: ${result.match.name})`);
            });
        }
        
        console.log('='.repeat(60));
    }

    async run() {
        const startTime = Date.now();
        
        try {
            await this.init();
            const results = await this.processVideo();
            await this.cleanup();
            
            this.printSummary(results);
            
            const endTime = Date.now();
            const totalTime = (endTime - startTime) / 1000;
            
            console.log(`\n⏱️  脚本总执行时间: ${totalTime.toFixed(2)} 秒`);
            
        } catch (error) {
            console.error('❌ 脚本执行失败:', error);
            await this.cleanup();
        }
    }
}

// 检查FFmpeg是否安装
function checkFFmpegInstallation() {
    return new Promise((resolve) => {
        ffmpeg.getAvailableFormats((err) => {
            if (err) {
                console.error('❌ FFmpeg 未安装或未在PATH中找到!');
                console.error('请安装FFmpeg: https://ffmpeg.org/download.html');
                console.error('macOS用户可以使用: brew install ffmpeg');
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
}

// 主函数
async function main() {
    console.log('🎥 视频广告检测器启动中...\n');
    
    // 检查FFmpeg
    const hasFFmpeg = await checkFFmpegInstallation();
    if (!hasFFmpeg) {
        process.exit(1);
    }
    
    // 检查文件是否存在
    if (!await fs.pathExists('./01.mp4')) {
        console.error('❌ 视频文件 01.mp4 不存在!');
        process.exit(1);
    }
    
    if (!await fs.pathExists('./ad_frame')) {
        console.error('❌ 广告帧目录 ad_frame 不存在!');
        process.exit(1);
    }
    
    // 运行检测器
    const detector = new VideoAdDetector();
    await detector.run();
}

// 启动程序
if (require.main === module) {
    main().catch(console.error);
}

module.exports = VideoAdDetector;
