var exec = require('child_process').exec;
const fs = require('fs');
const path = require('path');

async function execShell(cmd) {
    return new Promise((res, rej) => {
        exec(cmd, (e, o, oe) => {
            if (e) {
                console.log('execShell err:' + e);
                console.log('execShell stderr:' + oe);
                rej(e);
            } else {
                res(o);
            }
        })
    })
}

function stepLog(str) {
    console.log("=================== " + str + "=====================");
}

async function copyMp42Mkv(stdoutParts, tempFileDir) {
    let allPromise = [];
    let allMkvFiles = "";
    stdoutParts.sort()
    .forEach((v, i) => {
        let outMkvFile = "./" + tempFileDir + "/" + i + '.mkv';
        allMkvFiles += 'file \'' + outMkvFile + '\'\n';
        allPromise.push(execShell('~/Desktop/programme/ffmpeg -i ' + v + ' -vcodec copy ' + outMkvFile))
    });

    return new Promise((res, rej) => {
        Promise.all(allPromise).then(r => {
            res(allMkvFiles)
        }, err => {
            console.error('copy mkv error: ' + err)
            rej(err)
        })
    })
}

async function filterValidMp4() {
    let stdout = await execShell('find . -type f -name "*"')
    // let stdout = await execShell('find . -type f -name "*.mp4"')
    let stdoutParts = stdout.split('\n')
    stdoutParts = stdoutParts.filter(v => {
        let ok = true;
        // let ok = v.endsWith('.mp4') && v.indexOf('_') > 0;
        if (!ok) {
            console.error("not valid mp4 file: " + v)
        }
        return ok;
    })
    return stdoutParts;
}

async function main() {
    // make temp file dir
    let tempFileDir = Date.now();
    await execShell('mkdir ' + tempFileDir);
    
    // find all valid mp4 files
    let stdoutParts = await filterValidMp4();
    stepLog("found " + stdoutParts.length + " mp4 files");

    // copy mp4 2 mkv
    let allMkvFiles = await copyMp42Mkv(stdoutParts, tempFileDir);

    // write f.txt
    let ffile = path.resolve(__dirname, './f.txt');
    fs.writeFile(ffile, allMkvFiles, { encoding: 'utf8' }, err => {});

    stepLog("copy mkv don, concating...")
    let finalFile = tempFileDir + '-final.mp4';
    await execShell('~/Desktop/programme/ffmpeg -f concat -safe 0 -i f.txt -c copy ' + finalFile);

    // remove tmep file dir
    await execShell('rm -rf ' + tempFileDir);

    // open final file
    await execShell('open ' + finalFile);
}

main().then(x => {
    stepLog("END")
})