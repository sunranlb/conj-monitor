const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const originalMp4Dir = path.join(__dirname, 'original_mp4');
const adFrameDir = path.join(__dirname, 'ad_frame');
const outputDir = path.join(__dirname, 'extracted_frames');

// 确保输出目录存在
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// 获取视频时长（秒）
function getVideoDuration() {
  const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${videoPath}`;
  return parseFloat(execSync(cmd).toString());
}

// 提取视频帧
async function extractFrames(videoPath) {
  const frameTimes = [];
  
  // 提取5:59~6:00这一秒内的10帧
  const startSecond = 5 * 60 + 59; // 5:59
  for (let i = 0; i < 10; i++) {
    frameTimes.push(startSecond + i * 0.1); // 每0.1秒一帧
  }
  
  console.log(`开始从视频中提取${frameTimes.length}帧(5:59~6:00)...`);
  
  frameTimes.forEach((time, index) => {
    const outputPath = path.join(outputDir, `frame_${index}.jpg`);
    const cmd = `ffmpeg -ss ${time} -i ${videoPath} -frames:v 1 -q:v 2 ${outputPath} -y`;
    
    const minutes = Math.floor(time / 60);
    const seconds = (time % 60).toFixed(1);
    console.log(`正在提取第${index+1}帧，时间点: ${minutes}:${seconds}`);
    execSync(cmd);
  });
  
  console.log('所有帧提取完成！');
  return frameTimes.length;
}

async function compareImages(img1Path, img2Path) {
  try {
    // 使用sharp库计算感知哈希(pHash)
    const sharp = require('sharp');
    
    const [hash1, hash2] = await Promise.all([
      sharp(img1Path)
        .resize(32, 32) // 缩小图像尺寸
        .grayscale()    // 转换为灰度
        .raw()
        .toBuffer()
        .then(buffer => {
          // 计算平均亮度
          const avg = buffer.reduce((sum, val) => sum + val, 0) / buffer.length;
          // 生成哈希：大于平均值为1，否则为0
          return buffer.map(val => val > avg ? '1' : '0').join('');
        }),
      
      sharp(img2Path)
        .resize(32, 32)
        .grayscale()
        .raw()
        .toBuffer()
        .then(buffer => {
          const avg = buffer.reduce((sum, val) => sum + val, 0) / buffer.length;
          return buffer.map(val => val > avg ? '1' : '0').join('');
        })
    ]);
    
    // 计算汉明距离
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) distance++;
    }
    
    // 汉明距离小于10则认为相似
    return distance < 10;
  } catch (error) {
    console.error('Error comparing images:', error);
    return false;
  }
}

async function testSpecificFrames() {
  try {
    const result = await compareImages(
      path.join(__dirname, 'extracted_frames', 'frame_36.jpg'),
      path.join(__dirname, 'ad_frame', 'frame_0062.jpg')
    );
    console.log('对比结果:', result ? '匹配' : '不匹配');
    console.log('frame_36.jpg和frame_0062.jpg的对比完成');
  } catch (err) {
    console.error('测试特定帧对比时出错:', err);
  }
}

async function processVideo(videoPath) {
  const startTime = new Date();
  console.log(`\n开始处理视频: ${path.basename(videoPath)}`);
  
  // 1. 提取视频帧
  const frameCount = await extractFrames(videoPath);
  
  // 2. 获取广告帧列表
  const adFrames = fs.readdirSync(adFrameDir)
    .filter(file => file.endsWith('.jpg'))
    .map(file => path.join(adFrameDir, file));
  
  console.log(`开始对比${frameCount}个视频帧与${adFrames.length}个广告帧...`);
  
  let found = false;
  
  // 3. 逐个对比
  for (let i = 0; i < frameCount; i++) {
    const videoFramePath = path.join(outputDir, `frame_${i}.jpg`);
    
    for (const adFramePath of adFrames) {
      console.log(`正在对比视频帧${i}与广告帧${path.basename(adFramePath)}...`);
      
      const isMatch = await compareImages(videoFramePath, adFramePath);
      if (isMatch) {
        console.log(`匹配成功！视频帧${i}与广告帧${path.basename(adFramePath)}相同`);
        found = true;
        break;
      }
    }
    
    if (found) break;
  }
  
  if (found) {
    // 5. 如果发现广告帧，删除5:59开始的20秒广告片段
    console.log('检测到广告帧，正在删除广告片段...');
    
    const startCutTime = 5 * 60 + 59; // 5:59
    const endCutTime = startCutTime + 20; // 删除20秒
    const outputVideoPath = path.join(__dirname, `${path.basename(videoPath, '.mp4')}_no_ad.mp4`);
    
    // 使用ffmpeg删除指定时间段
    const cmd = `ffmpeg -i ${videoPath} -vf "select='not(between(t,${startCutTime},${endCutTime}))',setpts=N/FRAME_RATE/TB" -af "aselect='not(between(t,${startCutTime},${endCutTime}))',asetpts=N/SR/TB" ${outputVideoPath} -y`;
    
    console.log(`正在生成删除广告后的视频: ${outputVideoPath}`);
    execSync(cmd);
    console.log('视频处理完成！');
  } else {
    console.log('未找到匹配的广告帧');
  }
  
  // 4. 计算执行时间
  const endTime = new Date();
  const executionTime = (endTime - startTime) / 1000;
  console.log(`脚本执行完成，总耗时: ${executionTime}秒`);
}

async function main() {
  // 获取original_mp4目录中的所有MP4文件
  const videoFiles = fs.readdirSync(originalMp4Dir)
    .filter(file => file.endsWith('.mp4'))
    .map(file => path.join(originalMp4Dir, file));

  if (videoFiles.length === 0) {
    console.log('original_mp4目录中没有找到MP4文件');
    return;
  }

  // 逐个处理视频文件
  for (const videoPath of videoFiles) {
    await processVideo(videoPath);
  }
  
  // 2. 获取广告帧列表
  const adFrames = fs.readdirSync(adFrameDir)
    .filter(file => file.endsWith('.jpg'))
    .map(file => path.join(adFrameDir, file));
  
  console.log(`开始对比${frameCount}个视频帧与${adFrames.length}个广告帧...`);
  
  let found = false;
  
  // 3. 逐个对比
  for (let i = 0; i < frameCount; i++) {
    const videoFramePath = path.join(outputDir, `frame_${i}.jpg`);
    
    for (const adFramePath of adFrames) {
      console.log(`正在对比视频帧${i}与广告帧${path.basename(adFramePath)}...`);
      
      const isMatch = await compareImages(videoFramePath, adFramePath);
      if (isMatch) {
        console.log(`匹配成功！视频帧${i}与广告帧${path.basename(adFramePath)}相同`);
        found = true;
        break;
      }
    }
    
    if (found) break;
  }
  
  if (found) {
    // 5. 如果发现广告帧，删除5:59开始的20秒广告片段
    console.log('检测到广告帧，正在删除广告片段...');
    
    const startCutTime = 5 * 60 + 59; // 5:59
    const endCutTime = startCutTime + 20; // 删除20秒
    const outputVideoPath = path.join(__dirname, '01_no_ad.mp4');
    
    // 使用ffmpeg删除指定时间段
    const cmd = `ffmpeg -i ${videoPath} -vf "select='not(between(t,${startCutTime},${endCutTime}))',setpts=N/FRAME_RATE/TB" -af "aselect='not(between(t,${startCutTime},${endCutTime}))',asetpts=N/SR/TB" ${outputVideoPath} -y`;
    
    console.log(`正在生成删除广告后的视频: ${outputVideoPath}`);
    execSync(cmd);
    console.log('视频处理完成！');
  } else {
    console.log('未找到匹配的广告帧');
  }
  
  // 4. 计算执行时间
  const endTime = new Date();
  const executionTime = (endTime - startTime) / 1000;
  console.log(`脚本执行完成，总耗时: ${executionTime}秒`);
}

main();