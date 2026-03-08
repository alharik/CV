// ============================================
// mp3towav.online — App Logic
// Client-side MP3→WAV via FFmpeg.wasm
// ============================================

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

// --- State ---
let ffmpeg = null;
let fetchFile = null;
let ffmpegLoaded = false;
let lastBlobUrl = null;
let lastFileName = null;
let isProcessing = false;

// --- DOM ---
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const dzIdle = document.getElementById('dzIdle');
const dzLoading = document.getElementById('dzLoading');
const dzConverting = document.getElementById('dzConverting');
const dzDone = document.getElementById('dzDone');
const dzError = document.getElementById('dzError');
const convertingFile = document.getElementById('convertingFile');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const fileComparison = document.getElementById('fileComparison');
const downloadBtn = document.getElementById('downloadBtn');
const convertAnotherBtn = document.getElementById('convertAnotherBtn');
const retryBtn = document.getElementById('retryBtn');
const errorText = document.getElementById('errorText');

// --- Panel Switching ---
function showPanel(panel) {
    [dzIdle, dzLoading, dzConverting, dzDone, dzError].forEach(p => {
        p.classList.add('hidden');
    });
    panel.classList.remove('hidden');
}

// --- Drag & Drop ---
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!isProcessing) dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (isProcessing) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
});

// --- Click / Browse ---
dropZone.addEventListener('click', (e) => {
    if (dzIdle.classList.contains('hidden')) return;
    if (e.target === browseBtn) return;
    fileInput.click();
});

browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!isProcessing) fileInput.click();
});

fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

// --- Keyboard accessibility ---
dropZone.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !dzIdle.classList.contains('hidden')) {
        e.preventDefault();
        fileInput.click();
    }
});

// --- Buttons ---
downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (lastBlobUrl && lastFileName) {
        triggerDownload(lastBlobUrl, lastFileName);
    }
});

convertAnotherBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    reset();
});

retryBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    reset();
});

// --- Prevent default drag on page ---
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// --- File Validation ---
function handleFile(file) {
    const isMP3 = file.name.toLowerCase().endsWith('.mp3') || file.type === 'audio/mpeg';
    if (!isMP3) {
        showError("That doesn't look like an MP3 file. Please select a valid .mp3 file.");
        return;
    }
    if (file.size > MAX_FILE_SIZE) {
        showError(`File is too large (${formatSize(file.size)}). Maximum size is 100 MB.`);
        return;
    }
    convertFile(file);
}

// --- FFmpeg Init (lazy) ---
async function initFFmpeg() {
    showPanel(dzLoading);

    const { FFmpeg } = await import(
        'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js'
    );
    const { fetchFile: ff, toBlobURL } = await import(
        'https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js'
    );

    fetchFile = ff;
    ffmpeg = new FFmpeg();

    ffmpeg.on('progress', ({ progress }) => {
        const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
        progressFill.style.width = pct + '%';
        progressText.textContent = pct + '%';
    });

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    ffmpegLoaded = true;
}

// --- Conversion ---
async function convertFile(file) {
    isProcessing = true;
    dropZone.classList.remove('done', 'error');

    try {
        if (!ffmpegLoaded) {
            await initFFmpeg();
        }

        // Switch to converting UI
        showPanel(dzConverting);
        convertingFile.textContent = file.name;
        progressFill.style.width = '0%';
        progressText.textContent = '0%';

        const outputName = file.name.replace(/\.mp3$/i, '.wav');

        // Write → Convert → Read
        await ffmpeg.writeFile('input.mp3', await fetchFile(file));
        await ffmpeg.exec(['-i', 'input.mp3', '-acodec', 'pcm_s16le', 'output.wav']);
        const data = await ffmpeg.readFile('output.wav');

        const blob = new Blob([data.buffer], { type: 'audio/wav' });

        // Store for re-download
        if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
        lastBlobUrl = URL.createObjectURL(blob);
        lastFileName = outputName;

        // Auto-download
        triggerDownload(lastBlobUrl, lastFileName);

        // Show result
        dropZone.classList.add('done');
        showPanel(dzDone);

        fileComparison.innerHTML = `
            <div class="file-info">
                <span class="file-label">Input</span>
                <span class="file-name">${escapeHtml(file.name)}</span>
                <span class="file-size">${formatSize(file.size)}</span>
            </div>
            <div class="file-arrow">&rarr;</div>
            <div class="file-info">
                <span class="file-label">Output</span>
                <span class="file-name">${escapeHtml(outputName)}</span>
                <span class="file-size">${formatSize(blob.size)}</span>
            </div>
        `;

        // Cleanup virtual FS
        try {
            await ffmpeg.deleteFile('input.mp3');
            await ffmpeg.deleteFile('output.wav');
        } catch (_) { /* ignore */ }

    } catch (err) {
        console.error('Conversion failed:', err);
        showError('Conversion failed. The file may be corrupted or not a valid MP3. Please try again.');
    } finally {
        isProcessing = false;
    }
}

// --- Download Helper ---
function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// --- Error ---
function showError(message) {
    dropZone.classList.add('error');
    errorText.textContent = message;
    showPanel(dzError);
    isProcessing = false;
}

// --- Reset ---
function reset() {
    if (lastBlobUrl) {
        URL.revokeObjectURL(lastBlobUrl);
        lastBlobUrl = null;
    }
    lastFileName = null;
    fileInput.value = '';
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
    dropZone.classList.remove('done', 'error', 'dragover');
    isProcessing = false;
    showPanel(dzIdle);
}

// --- Utilities ---
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
}
