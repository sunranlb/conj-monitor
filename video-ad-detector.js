const ffmpeg = require('fluent-ffmpeg');
const Jimp = require('jimp');
const fs = require('fs-extra');
const path = require('path');

class VideoAdDetector {
    constructor() {
        this.videoPath = './01.mp4';
        this.adFramesDir = './ad_frame';
        this.tempDir = './temp_frames';
        this.intervalSeconds = 19;
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
                    
                    // 当检测到广告匹配时，对该时间段进行精确检测
                    console.log(`🔍 开始精确检测广告开始时间...`);
                    const preciseResults = await this.preciseDetection(timeInSeconds);
                    result.preciseResults = preciseResults;
                    
                    // 如果找到了确切的广告开始帧，立即停止执行
                    if (preciseResults.stopExecution) {
                        console.log(`\n🛑 已找到广告确切开始帧，停止脚本执行`);
                        return results;
                    }
                    
                } else {
                    console.log(`❌ 未检测到广告匹配 (最高相似度: ${(matchResult.similarity * 100).toFixed(2)}%)`);
                }
                
                // 删除临时帧文件
                // await fs.remove(framePath);
                
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

    async preciseDetection(matchedTime) {
        console.log(`  🎯 开始对 ${matchedTime}秒 周围区域进行精确检测...`);
        
        // 检测范围：匹配时间前后各10秒
        const rangeStart = Math.max(0, matchedTime - 10);
        const rangeEnd = matchedTime + 10;
        
        console.log(`  📍 检测范围: ${rangeStart}秒 到 ${rangeEnd}秒`);
        
        const preciseResults = [];
        
        // 对每一秒进行检测
        for (let sec = rangeStart; sec <= rangeEnd; sec++) {
            try {
                console.log(`    ⏱️  检测第 ${sec} 秒...`);
                
                const framePath = await this.extractFrameAtTime(sec);
                const extractedFrame = await Jimp.read(framePath);
                
                const matchResult = await this.findMatchingAdFrame(extractedFrame);
                
                const result = {
                    timeInSeconds: sec,
                    ...matchResult
                };
                
                preciseResults.push(result);
                
                if (matchResult.isMatch) {
                    console.log(`    ✅ ${sec}秒: 检测到广告! 相似度: ${(matchResult.similarity * 100).toFixed(2)}%, 匹配: ${matchResult.match.name}`);
                    
                    // 找到第一个匹配的时间点，立即进行逐帧检测
                    console.log(`  🎯 找到广告开始的大致时间，开始逐帧检测...`);
                    const exactResult = await this.findExactAdStartFrame(sec - 1);
                    
                    // 删除临时帧文件
                    // await fs.remove(framePath);
                    
                    if (exactResult && exactResult.found) {
                        console.log(`\n🎉 成功找到广告的确切开始帧！`);
                        console.log(`📍 广告开始帧号: ${exactResult.frameNumber}`);
                        console.log(`⏰ 广告开始时间: ${exactResult.exactTime.toFixed(3)} 秒`);
                        console.log(`📊 匹配相似度: ${(exactResult.similarity * 100).toFixed(2)}%`);
                        console.log(`🖼️  匹配的广告帧: ${exactResult.matchedAdFrame}`);
                        
                        // 找到广告开始后，继续查找广告结束
                        console.log(`\n🔍 开始查找广告结束帧...`);
                        const endResult = await this.findAdEndFrame(exactResult.exactTime);
                        
                        if (endResult && endResult.found) {
                            console.log(`\n🎉 成功找到广告的确切结束帧！`);
                            console.log(`📍 广告结束帧号: ${endResult.frameNumber}`);
                            console.log(`⏰ 广告结束时间: ${endResult.exactTime.toFixed(3)} 秒`);
                            console.log(`📊 匹配相似度: ${(endResult.similarity * 100).toFixed(2)}%`);
                            console.log(`🖼️  匹配的广告帧: ${endResult.matchedAdFrame}`);
                            
                            const adDuration = endResult.exactTime - exactResult.exactTime;
                            console.log(`\n📺 广告时长: ${adDuration.toFixed(3)} 秒`);
                            console.log(`🎯 广告范围: ${exactResult.exactTime.toFixed(3)}s - ${endResult.exactTime.toFixed(3)}s`);
                        }
                        
                        // 立即停止脚本并返回结果
                        return {
                            rangeStart,
                            rangeEnd,
                            results: preciseResults,
                            adStartTime: sec,
                            exactFrameResult: exactResult,
                            adEndResult: endResult,
                            stopExecution: true // 标记需要停止执行
                        };
                    }
                } else {
                    console.log(`    ❌ ${sec}秒: 未检测到广告 (相似度: ${(matchResult.similarity * 100).toFixed(2)}%)`);
                }
                
                // 删除临时帧文件
                // await fs.remove(framePath);
                
            } catch (error) {
                console.warn(`    ⚠️  检测第 ${sec} 秒时出错:`, error.message);
                preciseResults.push({
                    timeInSeconds: sec,
                    error: error.message,
                    isMatch: false
                });
            }
        }
        
        // 如果在整个范围内都没有找到匹配，分析结果
        const adStartTime = this.analyzeAdStartTime(preciseResults);
        if (adStartTime !== null) {
            console.log(`  🎯 推测广告开始时间: ${adStartTime} 秒`);
        }
        
        return {
            rangeStart,
            rangeEnd,
            results: preciseResults,
            adStartTime
        };
    }

    analyzeAdStartTime(preciseResults) {
        // 找到第一个匹配的时间点
        const firstMatch = preciseResults.find(result => result.isMatch);
        
        if (!firstMatch) {
            console.log(`  ❌ 在精确检测中未找到广告匹配`);
            return null;
        }
        
        return firstMatch.timeInSeconds;
    }

    async extractAllFramesInSecond(timeInSeconds) {
        console.log(`    🎞️  提取第 ${timeInSeconds} 秒内的所有帧...`);
        
        const frames = [];
        const tempFrameDir = path.join(this.tempDir, `second_${timeInSeconds}`);
        await fs.ensureDir(tempFrameDir);
        
        return new Promise((resolve, reject) => {
            ffmpeg(this.videoPath)
                .seekInput(timeInSeconds)
                .duration(1) // 只处理1秒
                .outputOptions([
                    '-vf', 'fps=30', // 提取30帧每秒
                    '-q:v', '2' // 高质量
                ])
                .output(path.join(tempFrameDir, 'frame_%04d.jpg'))
                .on('end', async () => {
                    try {
                        const files = await fs.readdir(tempFrameDir);
                        const frameFiles = files.filter(f => f.startsWith('frame_')).sort();
                        
                        for (const file of frameFiles) {
                            const framePath = path.join(tempFrameDir, file);
                            const frameNumber = parseInt(file.match(/frame_(\d+)\.jpg/)[1]);
                            const frameTime = timeInSeconds + (frameNumber - 1) / 30; // 假设30fps
                            
                            try {
                                const image = await Jimp.read(framePath);
                                frames.push({
                                    frameNumber,
                                    frameTime,
                                    imagePath: framePath,
                                    image
                                });
                            } catch (error) {
                                console.warn(`      ⚠️  无法读取帧 ${file}:`, error.message);
                            }
                        }
                        
                        console.log(`    ✅ 成功提取 ${frames.length} 帧`);
                        resolve(frames);
                    } catch (error) {
                        reject(error);
                    }
                })
                .on('error', reject)
                .run();
        });
    }

    async findExactAdStartFrame(timeInSeconds) {
        console.log(`  🔍 在第 ${timeInSeconds} 秒内寻找广告的确切开始帧...`);
        
        // 获取广告的第一帧作为参考
        if (this.adFrames.length === 0) {
            console.log(`  ❌ 没有广告帧可供比较`);
            return null;
        }
        
        // 假设广告帧是按顺序排列的，取第一个作为广告开始帧
        const firstAdFrame = this.adFrames[0];
        console.log(`  📋 使用广告参考帧: ${firstAdFrame.name}`);
        
        try {
            // 提取该秒内的所有帧
            const frames = await this.extractAllFramesInSecond(timeInSeconds);
            
            let bestMatch = null;
            let bestSimilarity = 0;
            
            console.log(`  🔍 开始逐帧比较...`);
            
            for (const frame of frames) {
                const similarity = await this.compareImages(frame.image, firstAdFrame.image);
                
                console.log(`    帧 ${frame.frameNumber} (时间: ${frame.frameTime.toFixed(3)}s): 相似度 ${(similarity * 100).toFixed(2)}%`);
                
                if (similarity > bestSimilarity) {
                    bestSimilarity = similarity;
                    bestMatch = frame;
                }
                
                // 如果相似度达到阈值，说明找到了广告开始帧
                if (similarity >= this.similarityThreshold) {
                    console.log(`  🎯 找到广告开始帧!`);
                    console.log(`  📍 帧号: ${frame.frameNumber}`);
                    console.log(`  ⏰ 精确时间: ${frame.frameTime.toFixed(3)} 秒`);
                    console.log(`  📊 相似度: ${(similarity * 100).toFixed(2)}%`);
                    console.log(`  🖼️  匹配的广告帧: ${firstAdFrame.name}`);
                    
                    // 清理临时文件
                    // await this.cleanupFrames(frames);
                    
                    return {
                        found: true,
                        frameNumber: frame.frameNumber,
                        exactTime: frame.frameTime,
                        similarity: similarity,
                        matchedAdFrame: firstAdFrame.name
                    };
                }
            }
            
            // 如果没有找到满足阈值的帧，返回最佳匹配
            console.log(`  ⚠️  未找到满足阈值的帧，最佳匹配:`);
            if (bestMatch) {
                console.log(`  📍 帧号: ${bestMatch.frameNumber}`);
                console.log(`  ⏰ 精确时间: ${bestMatch.frameTime.toFixed(3)} 秒`);
                console.log(`  📊 相似度: ${(bestSimilarity * 100).toFixed(2)}%`);
            }
            
            // 清理临时文件
            // await this.cleanupFrames(frames);
            
            return {
                found: false,
                bestMatch: bestMatch,
                bestSimilarity: bestSimilarity
            };
            
        } catch (error) {
            console.error(`  ❌ 提取帧时出错:`, error.message);
            return null;
        }
    }

    async findAdEndFrame(adStartTime) {
        console.log(`  🔍 开始查找广告结束帧，从广告开始时间 ${adStartTime.toFixed(3)} 秒开始...`);
        
        // 获取广告的最后一帧作为参考
        if (this.adFrames.length === 0) {
            console.log(`  ❌ 没有广告帧可供比较`);
            return null;
        }
        
        // 假设广告帧是按顺序排列的，取最后一个作为广告结束帧
        const lastAdFrame = this.adFrames[this.adFrames.length - 1];
        console.log(`  📋 使用广告结束参考帧: ${lastAdFrame.name}`);
        
        // 广告长度是20秒，从预期结束时间的后一秒开始检测
        const expectedEndTime = adStartTime + 20;
        const searchTime = expectedEndTime + 1; // 从预期结束时间的后一秒开始
        
        console.log(`  📍 预期广告结束时间: ${expectedEndTime.toFixed(3)} 秒`);
        console.log(`  📍 从 ${searchTime.toFixed(3)} 秒开始，在这一秒内从后往前逐帧检查`);
        
        // 直接进行精确的逐帧检测
        const exactResult = await this.findExactAdEndFrame(searchTime);
        
        if (exactResult && exactResult.found) {
            return exactResult;
        }
        
        console.log(`  ⚠️  在 ${searchTime.toFixed(3)} 秒内未找到匹配的广告结束帧`);
        
        // 如果在 searchTime 这一秒没有找到，再尝试在 searchTime - 1 这一秒内搜索
        const fallbackSearchTime = searchTime - 1;
        console.log(`  🔄 尝试在 ${fallbackSearchTime.toFixed(3)} 秒内搜索广告结束帧...`);
        
        const fallbackResult = await this.findExactAdEndFrame(fallbackSearchTime);
        
        if (fallbackResult && fallbackResult.found) {
            return fallbackResult;
        }
        
        console.log(`  ❌ 在 ${fallbackSearchTime.toFixed(3)} 秒内也未找到匹配的广告结束帧`);
        
        // 第二次回退策略：再尝试在 fallbackSearchTime - 1 秒内搜索
        const secondFallbackTime = fallbackSearchTime - 1;
        console.log(`  🔄 尝试第二次回退策略，在 ${secondFallbackTime.toFixed(3)} 秒内搜索...`);
        
        const secondFallbackResult = await this.findExactAdEndFrame(secondFallbackTime);
        
        if (secondFallbackResult && secondFallbackResult.found) {
            console.log(`  ✅ 第二次回退策略成功找到广告结束帧！`);
            return secondFallbackResult;
        }
        
        console.log(`  ❌ 第二次回退策略也未找到匹配的广告结束帧`);
        return null;
    }

    async findExactAdEndFrame(timeInSeconds) {
        console.log(`  🔍 在第 ${timeInSeconds} 秒内从后往前寻找广告的确切结束帧...`);
        
        // 获取广告的最后一帧作为参考
        if (this.adFrames.length === 0) {
            console.log(`  ❌ 没有广告帧可供比较`);
            return null;
        }
        
        const lastAdFrame = this.adFrames[this.adFrames.length - 1];
        console.log(`  📋 使用广告结束参考帧: ${lastAdFrame.name}`);
        
        try {
            // 提取该秒内的所有帧
            const frames = await this.extractAllFramesInSecond(timeInSeconds);
            
            console.log(`  🔍 开始从后往前逐帧比较，寻找第一个匹配的帧...`);
            
            // 从后往前遍历帧
            for (let i = frames.length - 1; i >= 0; i--) {
                const frame = frames[i];
                const similarity = await this.compareImages(frame.image, lastAdFrame.image);
                
                console.log(`    帧 ${frame.frameNumber} (时间: ${frame.frameTime.toFixed(3)}s): 相似度 ${(similarity * 100).toFixed(2)}%`);
                
                // 要求99%以上匹配
                if (similarity >= 0.99) {
                    console.log(`  🎯 找到广告结束帧!`);
                    console.log(`  📍 帧号: ${frame.frameNumber}`);
                    console.log(`  ⏰ 精确时间: ${frame.frameTime.toFixed(3)} 秒`);
                    console.log(`  📊 相似度: ${(similarity * 100).toFixed(2)}%`);
                    console.log(`  🖼️  匹配的广告帧: ${lastAdFrame.name}`);
                    
                    return {
                        found: true,
                        frameNumber: frame.frameNumber,
                        exactTime: frame.frameTime,
                        similarity: similarity,
                        matchedAdFrame: lastAdFrame.name
                    };
                }
            }
            
            // 如果没有找到99%以上匹配的帧，找最佳匹配（从后往前）
            console.log(`  ⚠️  未找到99%以上匹配的结束帧，寻找最佳匹配...`);
            
            let bestMatch = null;
            let bestSimilarity = 0;
            
            for (let i = frames.length - 1; i >= 0; i--) {
                const frame = frames[i];
                const similarity = await this.compareImages(frame.image, lastAdFrame.image);
                
                if (similarity > bestSimilarity) {
                    bestSimilarity = similarity;
                    bestMatch = frame;
                }
            }
            
            if (bestMatch) {
                console.log(`  📍 最佳匹配帧号: ${bestMatch.frameNumber}`);
                console.log(`  ⏰ 最佳匹配时间: ${bestMatch.frameTime.toFixed(3)} 秒`);
                console.log(`  📊 最佳匹配相似度: ${(bestSimilarity * 100).toFixed(2)}%`);
                
                // 如果最佳匹配的相似度也很高（95%以上），就接受它
                if (bestSimilarity >= 0.95) {
                    console.log(`  ✅ 最佳匹配相似度足够高，接受为广告结束帧`);
                    return {
                        found: true,
                        frameNumber: bestMatch.frameNumber,
                        exactTime: bestMatch.frameTime,
                        similarity: bestSimilarity,
                        matchedAdFrame: lastAdFrame.name
                    };
                }
            }
            
            return {
                found: false,
                bestMatch: bestMatch,
                bestSimilarity: bestSimilarity
            };
            
        } catch (error) {
            console.error(`  ❌ 提取帧时出错:`, error.message);
            return null;
        }
    }

    async cleanupFrames(frames) {
        for (const frame of frames) {
            try {
                await fs.remove(frame.imagePath);
            } catch (error) {
                // 忽略清理错误
            }
        }
        
        // 清理临时目录
        const tempFrameDir = path.dirname(frames[0]?.imagePath);
        if (tempFrameDir) {
            try {
                await fs.remove(tempFrameDir);
            } catch (error) {
                // 忽略清理错误
            }
        }
    }

    async cleanup() {
        console.log('🧹 清理临时文件...');
        await fs.remove(this.tempDir);
    }


    async run() {
        const startTime = Date.now();
        
        try {
            await this.init();
            const results = await this.processVideo();
            // await this.cleanup();
            
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
