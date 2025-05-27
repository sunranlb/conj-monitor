#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const HOME_DIR = '/Users/sr/Downloads/sdcard2/MIJIA_RECORD_VIDEO';

/**
 * Get all subdirectories in a given directory
 */
function getSubdirectories(dirPath) {
    try {
        return fs.readdirSync(dirPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
    } catch (error) {
        console.error(`Error reading directory ${dirPath}:`, error.message);
        return [];
    }
}

/**
 * Check if files have compatible codecs for stream copying
 */
function checkCodecCompatibility(mp4Files) {
    console.log('Checking codec compatibility...');
    
    for (const file of mp4Files) {
        try {
            const probeCommand = `ffprobe -v quiet -print_format json -show_streams "${file}"`;
            const result = execSync(probeCommand, { encoding: 'utf8' });
            const streams = JSON.parse(result).streams;
            
            const audioStream = streams.find(s => s.codec_type === 'audio');
            if (audioStream && audioStream.codec_name === 'pcm_alaw') {
                console.log(`⚠️  File ${path.basename(file)} contains incompatible audio codec: ${audioStream.codec_name}`);
                return false;
            }
        } catch (error) {
            console.log(`Warning: Could not probe ${path.basename(file)}, will attempt concatenation anyway`);
        }
    }
    
    return true;
}

/**
 * Find all MP4 files in a directory
 */
function findMp4Files(dirPath) {
    try {
        return fs.readdirSync(dirPath)
            .filter(file => path.extname(file).toLowerCase() === '.mp4')
            .map(file => path.join(dirPath, file))
            .sort(); // Sort files to ensure consistent order
    } catch (error) {
        console.error(`Error reading MP4 files from ${dirPath}:`, error.message);
        return [];
    }
}

/**
 * Create a file list for ffmpeg concat demuxer
 */
function createFileList(mp4Files, tempListPath) {
    const fileListContent = mp4Files
        .map(file => `file '${file.replace(/'/g, "'\"'\"'")}'`) // Escape single quotes
        .join('\n');
    
    fs.writeFileSync(tempListPath, fileListContent);
}

/**
 * Concatenate MP4 files using ffmpeg
 */
function concatenateFiles(mp4Files, outputPath) {
    if (mp4Files.length === 0) {
        console.log('No MP4 files found to concatenate.');
        return false;
    }

    if (mp4Files.length === 1) {
        console.log('Only one MP4 file found, copying it as final result...');
        try {
            // Try to copy first, if it fails due to codec issues, re-encode
            try {
                fs.copyFileSync(mp4Files[0], outputPath);
                return true;
            } catch (copyError) {
                console.log('Direct copy failed, will re-encode the single file...');
                return reencodeFile(mp4Files[0], outputPath);
            }
        } catch (error) {
            console.error(`Error processing single file: ${error.message}`);
            return false;
        }
    }

    const tempListPath = path.join(path.dirname(outputPath), 'temp_file_list.txt');
    
    try {
        // Create file list for ffmpeg
        createFileList(mp4Files, tempListPath);
        
        console.log(`Concatenating ${mp4Files.length} MP4 files...`);
        console.log('Files to concatenate:');
        mp4Files.forEach((file, index) => {
            console.log(`  ${index + 1}. ${path.basename(file)}`);
        });

        // Check codec compatibility first
        const isCompatible = checkCodecCompatibility(mp4Files);
        
        if (isCompatible) {
            // Try stream copy first (fastest)
            let ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${tempListPath}" -c copy "${outputPath}"`;
            console.log(`Trying stream copy: ${ffmpegCommand}`);
            
            try {
                execSync(ffmpegCommand, { stdio: 'inherit' });
                
                // Clean up temp file
                fs.unlinkSync(tempListPath);
                
                console.log(`✅ Successfully created: ${outputPath}`);
                return true;
            } catch (streamCopyError) {
                console.log('Stream copy failed, will re-encode...');
                
                // Remove partial output file if it exists
                if (fs.existsSync(outputPath)) {
                    fs.unlinkSync(outputPath);
                }
            }
        } else {
            console.log('Incompatible codecs detected, will re-encode directly...');
        }
        
        // Re-encode (slower but more compatible)
        const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${tempListPath}" -c:v libx264 -c:a aac -strict experimental "${outputPath}"`;
        console.log(`Re-encoding with: ${ffmpegCommand}`);
        
        execSync(ffmpegCommand, { stdio: 'inherit' });
        
        // Clean up temp file
        fs.unlinkSync(tempListPath);
        
        console.log(`✅ Successfully created (re-encoded): ${outputPath}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Error during concatenation: ${error.message}`);
        
        // Clean up temp file if it exists
        if (fs.existsSync(tempListPath)) {
            fs.unlinkSync(tempListPath);
        }
        
        // Clean up partial output file if it exists
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }
        
        return false;
    }
}

/**
 * Re-encode a single file to ensure compatibility
 */
function reencodeFile(inputPath, outputPath) {
    try {
        const ffmpegCommand = `ffmpeg -i "${inputPath}" -c:v libx264 -c:a aac -strict experimental "${outputPath}"`;
        console.log(`Re-encoding single file: ${ffmpegCommand}`);
        
        execSync(ffmpegCommand, { stdio: 'inherit' });
        
        console.log(`✅ Successfully re-encoded: ${outputPath}`);
        return true;
    } catch (error) {
        console.error(`❌ Error re-encoding file: ${error.message}`);
        return false;
    }
}

/**
 * Beep loudly and repeatedly to alert user of failure
 */
function beepLoudly(times = 10, interval = 500) {
    console.log('\n🚨 FAILURE DETECTED - BEEPING LOUDLY! 🚨\n');
    
    for (let i = 0; i < times; i++) {
        // Terminal bell character
        process.stdout.write('\x07');
        
        // Also try system beep command for macOS
        try {
            execSync('afplay /System/Library/Sounds/Sosumi.aiff', { stdio: 'ignore' });
        } catch (error) {
            // Fallback to simpler beep if afplay fails
            try {
                execSync('say "Error! Processing failed!"', { stdio: 'ignore' });
            } catch (sayError) {
                // If both fail, just use terminal bell
                console.log('🔔 BEEP!');
            }
        }
        
        // Wait between beeps
        if (i < times - 1) {
            execSync(`sleep ${interval / 1000}`, { stdio: 'ignore' });
        }
    }
    
    console.log('\n🚨 BEEPING COMPLETE - CHECK FOR ERRORS ABOVE! 🚨\n');
}

/**
 * Process a single directory
 */
function processDirectory(dirPath) {
    console.log(`\n📁 Processing directory: ${dirPath}`);
    
    const mp4Files = findMp4Files(dirPath);
    
    if (mp4Files.length === 0) {
        console.log('  No MP4 files found in this directory.');
        return true; // Not an error, just no files to process
    }
    
    const outputPath = path.join(dirPath, 'final_result.mp4');
    
    // Check if final_result.mp4 already exists
    if (fs.existsSync(outputPath)) {
        execSync(`rm -f "${outputPath}"`); // Remove existing file to avoid confusion
        console.log('  Removed existing final_result.mp4, will recreate it.');
    }
    
    const success = concatenateFiles(mp4Files, outputPath);
    
    if (success) {
        // Get file size for confirmation
        const stats = fs.statSync(outputPath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`  📊 Output file size: ${fileSizeMB} MB`);
        return true;
    } else {
        console.error(`  ❌ Failed to process directory: ${dirPath}`);
        return false;
    }
}

/**
 * Main function
 */
function main() {
    console.log('🎬 MP4 Concatenation Script Starting...');
    console.log(`📂 Base directory: ${HOME_DIR}`);
    
    // Check if base directory exists
    if (!fs.existsSync(HOME_DIR)) {
        console.error(`❌ Error: Directory ${HOME_DIR} does not exist!`);
        process.exit(1);
    }
    
    // Check if ffmpeg is available
    try {
        execSync('ffmpeg -version', { stdio: 'ignore' });
        console.log('✅ ffmpeg is available');
    } catch (error) {
        console.error('❌ Error: ffmpeg is not available in PATH!');
        process.exit(1);
    }
    
    // Get all subdirectories
    const subdirectories = getSubdirectories(HOME_DIR);
    
    if (subdirectories.length === 0) {
        console.log('No subdirectories found.');
        return;
    }
    
    console.log(`Found ${subdirectories.length} subdirectories to process:`);
    subdirectories.forEach((dir, index) => {
        console.log(`  ${index + 1}. ${dir}`);
    });
    
    // Process each subdirectory sequentially (one by one)
    let processedCount = 0;
    let successCount = 0;
    let hasFailures = false;
    
    for (const subdir of subdirectories) {
        const fullPath = path.join(HOME_DIR, subdir);
        processedCount++;
        
        console.log(`\n🔄 Processing ${processedCount}/${subdirectories.length}: ${subdir}`);
        
        try {
            const success = processDirectory(fullPath);
            
            if (success) {
                // Check if final_result.mp4 was actually created (for directories with MP4 files)
                const outputPath = path.join(fullPath, 'final_result.mp4');
                if (fs.existsSync(outputPath)) {
                    successCount++;
                    console.log(`✅ Successfully processed: ${subdir}`);
                } else {
                    // Directory was processed but no output file (probably no MP4 files)
                    console.log(`ℹ️  Processed (no MP4 files): ${subdir}`);
                }
            } else {
                console.error(`❌ FAILED to process: ${subdir}`);
                hasFailures = true;
                
                // Beep loudly on failure
                beepLoudly();
                
                // Ask user if they want to continue
                console.log('\n⚠️  A directory failed to process!');
                console.log('Press Ctrl+C to stop, or any key to continue with the next directory...');
                
                try {
                    // Wait for user input (or timeout after 10 seconds)
                    execSync('read -t 10 -n 1', { stdio: 'inherit' });
                } catch (timeoutError) {
                    console.log('\nContinuing automatically after timeout...');
                }
            }
        } catch (error) {
            console.error(`❌ CRITICAL ERROR processing ${subdir}: ${error.message}`);
            hasFailures = true;
            
            // Beep loudly on critical error
            beepLoudly();
            
            console.log('\n⚠️  Critical error occurred!');
            console.log('Press Ctrl+C to stop, or any key to continue with the next directory...');
            
            try {
                // Wait for user input (or timeout after 10 seconds)
                execSync('read -t 10 -n 1', { stdio: 'inherit' });
            } catch (timeoutError) {
                console.log('\nContinuing automatically after timeout...');
            }
        }
        
        // Small pause between directories to avoid overwhelming the system
        if (processedCount < subdirectories.length) {
            console.log('\n⏱️  Pausing 2 seconds before next directory...');
            execSync('sleep 2', { stdio: 'ignore' });
        }
    }
    
    console.log(`\n🎉 Processing complete!`);
    console.log(`📊 Summary: ${successCount}/${processedCount} directories processed successfully`);
    
    if (hasFailures) {
        console.log('\n🚨 WARNING: Some directories failed to process! 🚨');
        beepLoudly(5); // Final warning beeps
    } else {
        console.log('\n🎊 All directories processed successfully!');
    }
}

// Run the script
if (require.main === module) {
    main();
}