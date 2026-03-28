// ============================================
// mp3towav.online — App Logic v1.2
// Client-side audio conversion via Sonic Converter (Rust/WASM)
// Supports: MP3, WAV, FLAC, OGG, AAC → WAV | WAV → FLAC
// Zero dependencies. Nothing leaves your device.
// Powered by symphonia + rubato (pure Rust)
// ============================================

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const SUPPORTED_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a'];
const SUPPORTED_MIMES = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/ogg', 'audio/aac', 'audio/mp4', 'audio/x-m4a'];

// --- State ---
let lastBlobUrl = null;
let lastFileName = null;
let isProcessing = false;
let wasmReady = false;
let wasmModule = null;
let selectedBitDepth = 24;
let selectedSampleRate = 0; // 0 = keep original
let conversionMode = 'to-wav'; // 'to-wav' or 'from-wav'
let batchResults = []; // { file, blobUrl, outputName, size, error }
let batchAudio = null; // currently playing audio in batch mode
let previewAudio = null;

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
const bitDepthSelector = document.getElementById('bitDepthSelector');
const dzBatch = document.getElementById('dzBatch');
const batchCount = document.getElementById('batchCount');
const batchQueue = document.getElementById('batchQueue');
const batchActions = document.getElementById('batchActions');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const batchResetBtn = document.getElementById('batchResetBtn');
const audioPlayer = document.getElementById('audioPlayer');
const apPlayBtn = document.getElementById('apPlayBtn');
const apTrack = document.getElementById('apTrack');
const apFilled = document.getElementById('apFilled');
const apThumb = document.getElementById('apThumb');
const apTime = document.getElementById('apTime');
const conversionCounter = document.getElementById('conversionCounter');
const historySection = document.getElementById('historySection');
const historyToggle = document.getElementById('historyToggle');
const historyList = document.getElementById('historyList');
const sampleRateSelector = document.getElementById('sampleRateSelector');
const themeToggle = document.getElementById('themeToggle');

// --- File Support Check ---
function isSupportedAudio(file) {
    const name = file.name.toLowerCase();
    return SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext)) || SUPPORTED_MIMES.includes(file.type);
}

// Output format helpers — determined by active card + conversion direction
function getActiveFormat() {
    const card = document.querySelector('.tool-card.active');
    return card ? card.dataset.format : 'mp3';
}

function getOutputName(fileName) {
    if (conversionMode === 'from-wav') {
        return fileName.replace(/\.(mp3|flac|ogg|aac|m4a|wav)$/i, '.' + getActiveFormat());
    }
    return fileName.replace(/\.(mp3|flac|ogg|aac|m4a|wav)$/i, '.wav');
}

const MIME_MAP = { wav: 'audio/wav', flac: 'audio/flac', mp3: 'audio/mpeg', ogg: 'audio/ogg', aac: 'audio/aac' };

// Dispatcher for WAV → target format conversion
function convertFromWav(wasm, audioBytes, fmt, bitDepth, sampleRate) {
    switch (fmt) {
        case 'flac': return wasm.convertWavToFlac(audioBytes, bitDepth, sampleRate);
        case 'ogg':  return wasm.convertWavToOgg(audioBytes, bitDepth, sampleRate);
        default: throw new Error('WAV \u2192 ' + fmt.toUpperCase() + ' encoder not available yet. Try FLAC or OGG.');
    }
}

function getOutputMimeType() {
    if (conversionMode === 'from-wav') {
        return MIME_MAP[getActiveFormat()] || 'audio/wav';
    }
    return 'audio/wav';
}

// --- Initialize WASM after page load (doesn't block tab spinner) ---
let wasmInitResolve;
const wasmInit = new Promise(r => { wasmInitResolve = r; });

window.addEventListener('load', () => {
    const dropLimit = document.querySelector('.drop-limit');
    if (dropLimit) dropLimit.textContent = 'Loading audio engine...';

    (async () => {
        try {
            const mod = await import('./sonic_converter.js');
            await mod.default();
            wasmModule = mod;
            wasmReady = true;
            console.log(`Sonic Converter v${mod.getVersion()} loaded`);
        } catch (err) {
            console.warn('WASM init failed, will use Web Audio API fallback:', err.message);
        }
        if (dropLimit) dropLimit.textContent = 'Audio files up to 100 MB';
        refreshUI();
        wasmInitResolve();
    })();
});

// --- Panel Switching ---
function showPanel(panel) {
    [dzIdle, dzLoading, dzConverting, dzDone, dzError, dzBatch].forEach(p => {
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

dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (isProcessing) return;

    // Check for folder drops (webkitGetAsEntry API)
    const items = e.dataTransfer.items;
    let files = [];

    if (items && items.length > 0 && items[0].webkitGetAsEntry) {
        const entries = [];
        for (let i = 0; i < items.length; i++) {
            const entry = items[i].webkitGetAsEntry();
            if (entry) entries.push(entry);
        }

        const hasDirectory = entries.some(e => e.isDirectory);
        if (hasDirectory) {
            // Read directory recursively
            const allFiles = await readEntriesRecursive(entries);
            files = allFiles.filter(f => isSupportedAudio(f));
            if (files.length === 0) {
                showError('No supported audio files found in the folder. Supported: MP3, WAV, FLAC, OGG, AAC.');
                return;
            }
        }
    }

    // Fallback to regular file list if no folder was detected
    if (files.length === 0) {
        const allFiles = Array.from(e.dataTransfer.files);
        files = allFiles.filter(f => isSupportedAudio(f));
        if (files.length === 0) {
            const rejected = allFiles[0];
            const ext = rejected ? rejected.name.split('.').pop().toLowerCase() : 'unknown';
            showError('Unsupported format (.' + ext + '). Supported: MP3, WAV, FLAC, OGG, AAC.');
            trackEvent('FileRejected', { extension: ext });
            return;
        }
    }

    if (files.length === 1) {
        handleFile(files[0]);
    } else {
        handleBatch(files);
    }
});

// --- Folder Reading (recursive) ---
async function readEntriesRecursive(entries) {
    const files = [];
    for (const entry of entries) {
        if (entry.isFile) {
            const file = await new Promise(resolve => entry.file(resolve));
            files.push(file);
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            const childEntries = await new Promise(resolve => {
                const results = [];
                const readBatch = () => {
                    reader.readEntries(batch => {
                        if (batch.length === 0) {
                            resolve(results);
                        } else {
                            results.push(...batch);
                            readBatch();
                        }
                    });
                };
                readBatch();
            });
            const childFiles = await readEntriesRecursive(childEntries);
            files.push(...childFiles);
        }
    }
    return files;
}

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
    const allFiles = Array.from(fileInput.files);
    const files = allFiles.filter(f => isSupportedAudio(f));
    if (files.length === 0 && allFiles.length > 0) {
        const ext = allFiles[0].name.split('.').pop().toLowerCase();
        showError('Unsupported format (.' + ext + '). Supported: MP3, WAV, FLAC, OGG, AAC.');
        trackEvent('FileRejected', { extension: ext });
        fileInput.value = '';
        return;
    }
    if (files.length === 1) {
        handleFile(files[0]);
    } else if (files.length > 1) {
        handleBatch(files);
    }
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
        trackEvent('Download', { type: 'wav' });
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

// --- Bit Depth Selector ---
bitDepthSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.bit-depth-btn');
    if (!btn) return;
    bitDepthSelector.querySelectorAll('.bit-depth-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedBitDepth = parseInt(btn.dataset.depth, 10);
});

// --- Tool Cards + Conversion Header ---
const toolCards = document.getElementById('toolCards');
const swapDirection = document.getElementById('swapDirection');
const convSource = document.getElementById('convSource');
const convTarget = document.getElementById('convTarget');


function updateConversionHeader() {
    if (!convSource || !convTarget) return;
    const fmt = getActiveFormat().toUpperCase();
    if (conversionMode === 'from-wav') {
        convSource.textContent = 'WAV';
        convTarget.textContent = fmt;
    } else {
        convSource.textContent = fmt;
        convTarget.textContent = 'WAV';
    }
}

function updateFileAccept() {
    if (conversionMode === 'from-wav') {
        fileInput.setAttribute('accept', '.wav,audio/wav');
    } else {
        const card = document.querySelector('.tool-card.active');
        if (card) fileInput.setAttribute('accept', card.dataset.accept);
    }
}

function updateDropText() {
    const dropText = document.querySelector('.drop-text');
    if (!dropText) return;
    if (conversionMode === 'from-wav') {
        dropText.textContent = 'Drop your WAV files here';
    } else {
        dropText.textContent = 'Drop your ' + getActiveFormat().toUpperCase() + ' files here';
    }
}

function refreshUI() {
    updateConversionHeader();
    updateFileAccept();
    updateDropText();
}

// Card click handler (delegated)
if (toolCards) {
    toolCards.addEventListener('click', (e) => {
        const card = e.target.closest('.tool-card');
        if (!card) return;
        toolCards.querySelectorAll('.tool-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        updateConversionHeader();
        updateFileAccept();
        updateDropText();
    });
}

// Swap direction
if (swapDirection) {
    swapDirection.addEventListener('click', () => {
        conversionMode = conversionMode === 'to-wav' ? 'from-wav' : 'to-wav';
        refreshUI();
    });
}

// --- Sample Rate Selector ---
if (sampleRateSelector) {
    sampleRateSelector.addEventListener('click', (e) => {
        const btn = e.target.closest('.sample-rate-btn');
        if (!btn) return;
        sampleRateSelector.querySelectorAll('.sample-rate-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedSampleRate = parseInt(btn.dataset.rate, 10);
    });
}

// --- Theme Toggle ---
(function initTheme() {
    const saved = localStorage.getItem('mp3towav_theme');
    if (saved) {
        document.documentElement.dataset.theme = saved;
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
        document.documentElement.dataset.theme = 'light';
    }
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.dataset.theme || 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            localStorage.setItem('mp3towav_theme', next);
            updateThemeIcon(next);
        });
        updateThemeIcon(document.documentElement.dataset.theme || 'dark');
    }
})();

function updateThemeIcon(theme) {
    if (!themeToggle) return;
    const sunIcon = themeToggle.querySelector('.theme-icon-sun');
    const moonIcon = themeToggle.querySelector('.theme-icon-moon');
    if (sunIcon && moonIcon) {
        if (theme === 'light') {
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        } else {
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        }
    }
}

// --- Batch Buttons ---
downloadAllBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const successResults = batchResults.filter(r => !r.error);
    if (successResults.length === 0) return;

    if (successResults.length === 1) {
        triggerDownload(successResults[0].blobUrl, successResults[0].outputName);
        trackEvent('Download', { type: 'wav' });
        return;
    }

    // ZIP download
    downloadAllBtn.textContent = 'Creating ZIP...';
    downloadAllBtn.disabled = true;

    try {
        if (typeof JSZip === 'undefined') {
            throw new Error('ZIP library not loaded');
        }
        const zip = new JSZip();
        for (const result of successResults) {
            const response = await fetch(result.blobUrl);
            const blob = await response.blob();
            zip.file(result.outputName, blob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipUrl = URL.createObjectURL(zipBlob);
        triggerDownload(zipUrl, 'mp3towav-converted.zip');
        URL.revokeObjectURL(zipUrl);
        trackEvent('Download', { type: 'zip' });
        downloadAllBtn.textContent = 'Download All as ZIP';
        downloadAllBtn.disabled = false;
    } catch (err) {
        console.error('ZIP creation failed:', err);
        downloadAllBtn.disabled = false;
        downloadAllBtn.textContent = 'ZIP failed — try again';
        setTimeout(() => {
            downloadAllBtn.textContent = 'Download All as ZIP';
        }, 3000);
    }
});

batchResetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (batchAudio) {
        batchAudio.pause();
        batchAudio = null;
    }
    reset();
});

// --- Audio Player ---
function fmtTime(s) {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
}

function apSetPosition(pct) {
    const p = Math.max(0, Math.min(100, pct));
    apFilled.style.width = p + '%';
    apThumb.style.left = p + '%';
}

function apUpdateTime() {
    if (!previewAudio) return;
    const cur = previewAudio.currentTime;
    const dur = previewAudio.duration || 0;
    apTime.textContent = fmtTime(cur) + ' / ' + fmtTime(dur);
    if (dur > 0 && !apSeeking) apSetPosition((cur / dur) * 100);
}

function apShowPlay() {
    apPlayBtn.querySelector('.ap-icon-play').classList.remove('hidden');
    apPlayBtn.querySelector('.ap-icon-pause').classList.add('hidden');
    audioPlayer.classList.remove('playing');
    apPlayBtn.setAttribute('aria-label', 'Play');
}

function apShowPause() {
    apPlayBtn.querySelector('.ap-icon-play').classList.add('hidden');
    apPlayBtn.querySelector('.ap-icon-pause').classList.remove('hidden');
    audioPlayer.classList.add('playing');
    apPlayBtn.setAttribute('aria-label', 'Pause');
}

let apSeeking = false;
let apRaf = null;

function apTick() {
    apUpdateTime();
    apRaf = requestAnimationFrame(apTick);
}

function apStopTick() {
    if (apRaf) { cancelAnimationFrame(apRaf); apRaf = null; }
}

// Play / Pause
apPlayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!previewAudio) {
        if (!lastBlobUrl) return;
        previewAudio = new Audio(lastBlobUrl);
        previewAudio.addEventListener('loadedmetadata', apUpdateTime);
        previewAudio.addEventListener('ended', () => {
            apShowPlay();
            apStopTick();
            apSetPosition(0);
            apUpdateTime();
        });
    }
    if (previewAudio.paused) {
        previewAudio.play().catch(() => { apShowPlay(); apStopTick(); });
        apShowPause();
        apTick();
    } else {
        previewAudio.pause();
        apShowPlay();
        apStopTick();
    }
});

// Seek via click / drag on track
function apSeekFromEvent(e) {
    const rect = apTrack.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    apSetPosition(pct);
    if (previewAudio && previewAudio.duration) {
        previewAudio.currentTime = (pct / 100) * previewAudio.duration;
    }
    apUpdateTime();
}

apTrack.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    apSeeking = true;
    audioPlayer.classList.add('seeking');
    apSeekFromEvent(e);

    function onMove(ev) { apSeekFromEvent(ev); }
    function onUp() {
        apSeeking = false;
        audioPlayer.classList.remove('seeking');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
});

// Touch support
apTrack.addEventListener('touchstart', (e) => {
    e.stopPropagation();
    apSeeking = true;
    audioPlayer.classList.add('seeking');
    apSeekFromEvent(e.touches[0]);
}, { passive: true });
apTrack.addEventListener('touchmove', (e) => {
    if (apSeeking) apSeekFromEvent(e.touches[0]);
}, { passive: true });
apTrack.addEventListener('touchend', () => {
    apSeeking = false;
    audioPlayer.classList.remove('seeking');
});

// --- File Validation ---
function handleFile(file) {
    if (!isSupportedAudio(file)) {
        const ext = file.name.split('.').pop().toLowerCase();
        showError('Unsupported format (.' + ext + '). Supported: MP3, WAV, FLAC, OGG, AAC.');
        return;
    }
    if (file.size > MAX_FILE_SIZE) {
        showError(`File is too large (${formatSize(file.size)}). Maximum size is 100 MB.`);
        return;
    }
    convertFile(file);
}

// --- WAV Encoder Fallback (PCM 16-bit) — used if WASM fails ---
function encodeWAV(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const numFrames = audioBuffer.length;
    const dataSize = numFrames * blockAlign;
    const bufferSize = 44 + dataSize;

    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    function writeString(offset, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
        channels.push(audioBuffer.getChannelData(ch));
    }

    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            let sample = channels[ch][i];
            sample = Math.max(-1, Math.min(1, sample));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
    }

    return buffer;
}

// --- Conversion: Sonic Converter (WASM) with Web Audio API fallback ---
async function convertFile(file) {
    isProcessing = true;
    dropZone.classList.remove('done', 'error');

    try {
        let actualBitDepth = selectedBitDepth;

        showPanel(dzConverting);
        convertingFile.textContent = file.name;
        progressFill.style.width = '10%';
        progressText.textContent = 'Reading file...';

        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        const audioBytes = new Uint8Array(arrayBuffer);

        progressFill.style.width = '30%';
        progressText.textContent = 'Decoding audio...';

        let wavBuffer;

        // Wait for WASM if it's still loading
        await wasmInit;

        if (wasmReady) {
            // Primary path: Sonic Converter (Rust/WASM) — multi-format
            progressText.textContent = 'Converting (Sonic Engine)...';
            progressFill.style.width = '50%';

            let resultBytes;
            if (conversionMode === 'from-wav') {
                const fmt = getActiveFormat();
                resultBytes = convertFromWav(wasmModule, audioBytes, fmt, selectedBitDepth, selectedSampleRate);
            } else {
                resultBytes = wasmModule.convertAudioToWav(audioBytes, selectedBitDepth, selectedSampleRate);
            }
            wavBuffer = resultBytes.buffer;

            progressFill.style.width = '90%';
            progressText.textContent = 'Finalizing...';
        } else {
            if (conversionMode === 'from-wav') {
                throw new Error('Reverse conversion requires WASM engine. Please reload the page.');
            }
            // Fallback: Web Audio API (MP3 only, 16-bit)
            actualBitDepth = 16;
            if (selectedBitDepth !== 16) {
                console.warn('Web Audio fallback only supports 16-bit. Using 16-bit output.');
            }
            progressText.textContent = 'Converting (Web Audio)...';
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
            await audioCtx.close();

            progressFill.style.width = '60%';
            progressText.textContent = 'Encoding WAV...';

            wavBuffer = encodeWAV(audioBuffer);

            progressFill.style.width = '90%';
            progressText.textContent = 'Finalizing...';
        }

        const outputName = getOutputName(file.name);
        const blob = new Blob([wavBuffer], { type: getOutputMimeType() });

        // Store for re-download
        if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
        lastBlobUrl = URL.createObjectURL(blob);
        lastFileName = outputName;

        progressFill.style.width = '100%';
        progressText.textContent = '100%';

        // Show result
        dropZone.classList.add('done');
        showPanel(dzDone);
        trackEvent('Conversion', { type: 'single', bitDepth: String(actualBitDepth), fileCount: '1' });
        updateConversionCounter(1);
        addToHistory({ input: file.name, output: outputName, size: blob.size, bitDepth: actualBitDepth, date: new Date().toISOString() });

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
                <span class="file-size">${formatSize(blob.size)} · ${actualBitDepth}-bit</span>
            </div>
        `;

        if (actualBitDepth !== selectedBitDepth) {
            fileComparison.innerHTML += '<p class="fallback-note">Note: ' + selectedBitDepth + '-bit requires the Sonic engine. Converted at 16-bit.</p>';
        }

    } catch (err) {
        console.error('Conversion failed:', err);
        showError('Conversion failed. The file may be corrupted or unsupported. Please try again.');
    } finally {
        isProcessing = false;
    }
}

// --- Batch Conversion ---
async function handleBatch(files) {
    if (files.length > 50) {
        showError(`Too many files (${files.length}). Maximum is 50 files at once.`);
        return;
    }

    // Validate all files
    const oversized = files.filter(f => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
        showError(`${oversized.length} file(s) exceed the 100 MB limit.`);
        return;
    }

    isProcessing = true;
    batchResults = [];
    dropZone.classList.remove('done', 'error');
    showPanel(dzBatch);
    batchCount.textContent = files.length;
    batchActions.classList.add('hidden');

    // Build queue UI
    batchQueue.innerHTML = files.map((f, i) => `
        <div class="batch-item" data-index="${i}">
            <span class="batch-item-status waiting">&#9679;</span>
            <span class="batch-item-name">${escapeHtml(f.name)}</span>
            <span class="batch-item-info">${formatSize(f.size)}</span>
        </div>
    `).join('');

    // Process sequentially
    await wasmInit;

    for (let i = 0; i < files.length; i++) {
        const item = batchQueue.querySelector(`[data-index="${i}"]`);
        const statusEl = item.querySelector('.batch-item-status');
        const infoEl = item.querySelector('.batch-item-info');

        // Mark converting
        statusEl.className = 'batch-item-status converting';
        statusEl.innerHTML = '';

        try {
            const arrayBuffer = await files[i].arrayBuffer();
            const audioBytes = new Uint8Array(arrayBuffer);
            let wavBuffer;
            let actualBitDepth = selectedBitDepth;

            if (wasmReady) {
                let resultBytes;
                if (conversionMode === 'from-wav') {
                    const fmt = getActiveFormat();
                    resultBytes = convertFromWav(wasmModule, audioBytes, fmt, selectedBitDepth, selectedSampleRate);
                } else {
                    resultBytes = wasmModule.convertAudioToWav(audioBytes, selectedBitDepth, selectedSampleRate);
                }
                wavBuffer = resultBytes.buffer;
            } else {
                actualBitDepth = 16;
                if (selectedBitDepth !== 16) {
                    console.warn('Web Audio fallback only supports 16-bit.');
                }
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
                await audioCtx.close();
                wavBuffer = encodeWAV(audioBuffer);
            }

            const outputName = getOutputName(files[i].name);
            const blob = new Blob([wavBuffer], { type: getOutputMimeType() });
            const blobUrl = URL.createObjectURL(blob);

            batchResults.push({ file: files[i], blobUrl, outputName, size: blob.size, error: null });

            // Mark done
            statusEl.className = 'batch-item-status done';
            statusEl.innerHTML = '&#10003;';
            infoEl.textContent = `${formatSize(blob.size)} · ${actualBitDepth}-bit`;

            // Add play + download buttons
            const playBtn = document.createElement('button');
            playBtn.type = 'button';
            playBtn.className = 'batch-item-play';
            playBtn.innerHTML = '&#9654;';
            playBtn.title = 'Preview';
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleBatchAudio(blobUrl, playBtn);
            });
            item.appendChild(playBtn);

        } catch (err) {
            console.error(`Batch conversion failed for ${files[i].name}:`, err);
            batchResults.push({ file: files[i], blobUrl: null, outputName: null, size: 0, error: err.message });
            statusEl.className = 'batch-item-status error';
            statusEl.innerHTML = '&#10007;';
            infoEl.textContent = 'Failed';
        }
    }

    // Show batch actions
    const successCount = batchResults.filter(r => !r.error).length;
    if (successCount === 0) {
        dropZone.classList.add('error');
        downloadAllBtn.classList.add('hidden');
    } else {
        dropZone.classList.add('done');
        downloadAllBtn.classList.remove('hidden');
    }
    batchActions.classList.remove('hidden');
    batchCount.textContent = `${successCount}/${files.length}`;
    isProcessing = false;
    if (successCount > 0) {
        trackEvent('Conversion', { type: 'batch', bitDepth: String(wasmReady ? selectedBitDepth : 16), fileCount: String(successCount) });
        updateConversionCounter(successCount);
        var histEntries = batchResults.filter(function(r) { return !r.error; }).map(function(r) {
            return { input: r.file.name, output: r.outputName, size: r.size, bitDepth: wasmReady ? selectedBitDepth : 16, date: new Date().toISOString() };
        });
        if (histEntries.length > 0) {
            try {
                var history = JSON.parse(localStorage.getItem('mp3towav_history') || '[]');
                if (!Array.isArray(history)) history = [];
                history = histEntries.concat(history).slice(0, 10);
                localStorage.setItem('mp3towav_history', JSON.stringify(history));
            } catch (e) {}
            renderHistory();
        }
    }
}

function toggleBatchAudio(blobUrl, btn) {
    // Reset all play buttons
    batchQueue.querySelectorAll('.batch-item-play').forEach(b => { b.innerHTML = '&#9654;'; });

    if (batchAudio) {
        batchAudio.pause();
        batchAudio.currentTime = 0;
        const wasSame = batchAudio._blobUrl === blobUrl;
        batchAudio = null;
        if (wasSame) return; // toggle off
    }

    batchAudio = new Audio(blobUrl);
    batchAudio._blobUrl = blobUrl;
    batchAudio.play().catch(() => {
        btn.innerHTML = '&#9654;';
        batchAudio = null;
    });
    btn.innerHTML = '&#9646;&#9646;';
    batchAudio.addEventListener('ended', () => {
        btn.innerHTML = '&#9654;';
        batchAudio = null;
    });
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
    batchResults.forEach(r => {
        if (r.blobUrl) URL.revokeObjectURL(r.blobUrl);
    });
    batchResults = [];
    if (batchAudio) {
        batchAudio.pause();
        batchAudio = null;
    }
    if (previewAudio) {
        previewAudio.pause();
        previewAudio = null;
    }
    apStopTick();
    apShowPlay();
    apSetPosition(0);
    apTime.textContent = '0:00 / 0:00';
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

function trackEvent(name, props) {
    if (typeof plausible !== 'undefined') {
        plausible(name, { props });
    }
}

function updateConversionCounter(count) {
    let total = count;
    try {
        let stored = parseInt(localStorage.getItem('mp3towav_conversions') || '0', 10);
        if (isNaN(stored) || stored < 0) stored = 0;
        total = stored + count;
        localStorage.setItem('mp3towav_conversions', String(total));
    } catch (e) {
        // localStorage unavailable; show session-only count
    }
    conversionCounter.textContent = '\u2713 ' + total.toLocaleString() + ' file' + (total === 1 ? '' : 's') + ' converted on this device';
    conversionCounter.classList.remove('hidden');
}

// --- Conversion History ---
function addToHistory(entry) {
    try {
        var history = JSON.parse(localStorage.getItem('mp3towav_history') || '[]');
        if (!Array.isArray(history)) history = [];
        history.unshift(entry);
        if (history.length > 10) history = history.slice(0, 10);
        localStorage.setItem('mp3towav_history', JSON.stringify(history));
    } catch (e) {
        // localStorage unavailable
    }
    renderHistory();
}

function renderHistory() {
    var history = [];
    try {
        history = JSON.parse(localStorage.getItem('mp3towav_history') || '[]');
        if (!Array.isArray(history)) history = [];
    } catch (e) {
        return;
    }
    if (history.length === 0) {
        historySection.classList.add('hidden');
        return;
    }
    historySection.classList.remove('hidden');
    historyList.innerHTML = history.map(function(h) {
        return '<div class="history-item">' +
            '<span class="history-item-name">' + escapeHtml(h.input) + '</span>' +
            '<span class="history-item-meta">' + formatSize(h.size) + ' \u00b7 ' + Number(h.bitDepth) + '-bit \u00b7 ' + timeAgo(h.date) + '</span>' +
            '</div>';
    }).join('') + '<button class="history-clear" id="historyClear">Clear history</button>';

    var clearBtn = document.getElementById('historyClear');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            try { localStorage.removeItem('mp3towav_history'); } catch (e) {}
            historyList.innerHTML = '';
            historySection.classList.add('hidden');
            historyToggle.setAttribute('aria-expanded', 'false');
        });
    }
}

function timeAgo(dateStr) {
    try {
        var now = Date.now();
        var then = new Date(dateStr).getTime();
        var diff = Math.floor((now - then) / 1000);
        if (isNaN(diff) || diff < 0) return '';
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 172800) return 'yesterday';
        return new Date(dateStr).toLocaleDateString();
    } catch (e) {
        return '';
    }
}

historyToggle.addEventListener('click', function() {
    var expanded = historyToggle.getAttribute('aria-expanded') === 'true';
    historyToggle.setAttribute('aria-expanded', String(!expanded));
    historyList.classList.toggle('hidden');
});

// --- Cleanup blob URL on page unload ---
window.addEventListener('beforeunload', () => {
    if (lastBlobUrl) {
        URL.revokeObjectURL(lastBlobUrl);
        lastBlobUrl = null;
    }
    batchResults.forEach(r => {
        if (r.blobUrl) URL.revokeObjectURL(r.blobUrl);
    });
});

// --- Initialize conversion counter display ---
(function() {
    try {
        const stored = parseInt(localStorage.getItem('mp3towav_conversions') || '0', 10);
        if (!isNaN(stored) && stored > 0) {
            updateConversionCounter(0);
        }
    } catch (e) {
        // localStorage unavailable
    }
})();

// --- Initialize conversion history display ---
renderHistory();
