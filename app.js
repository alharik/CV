// ============================================
// mp3towav.online — App Logic
// Client-side MP3→WAV via Sonic Converter (Rust/WASM)
// Zero dependencies. Nothing leaves your device.
// Powered by symphonia (pure Rust MP3 decoder)
// ============================================

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

// --- State ---
let lastBlobUrl = null;
let lastFileName = null;
let isProcessing = false;
let wasmReady = false;
let wasmModule = null;
let selectedBitDepth = 16;

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
        if (dropLimit) dropLimit.textContent = 'MP3 files up to 100 MB';
        wasmInitResolve();
    })();
});

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

// --- Bit Depth Selector ---
bitDepthSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.bit-depth-btn');
    if (!btn) return;
    bitDepthSelector.querySelectorAll('.bit-depth-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedBitDepth = parseInt(btn.dataset.depth, 10);
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
        const mp3Bytes = new Uint8Array(arrayBuffer);

        progressFill.style.width = '30%';
        progressText.textContent = 'Decoding MP3...';

        let wavBuffer;

        // Wait for WASM if it's still loading
        await wasmInit;

        if (wasmReady) {
            // Primary path: Sonic Converter (Rust/WASM)
            progressText.textContent = 'Converting (Sonic Engine)...';
            progressFill.style.width = '50%';

            const wavBytes = wasmModule.convertMp3ToWavWithDepth(mp3Bytes, selectedBitDepth);
            wavBuffer = wavBytes.buffer;

            progressFill.style.width = '90%';
            progressText.textContent = 'Finalizing...';
        } else {
            // Fallback: Web Audio API
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

        const outputName = file.name.replace(/\.mp3$/i, '.wav');
        const blob = new Blob([wavBuffer], { type: 'audio/wav' });

        // Store for re-download
        if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
        lastBlobUrl = URL.createObjectURL(blob);
        lastFileName = outputName;

        progressFill.style.width = '100%';
        progressText.textContent = '100%';

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
                <span class="file-size">${formatSize(blob.size)} · ${actualBitDepth}-bit</span>
            </div>
        `;

        if (actualBitDepth !== selectedBitDepth) {
            fileComparison.innerHTML += '<p class="fallback-note">Note: ' + selectedBitDepth + '-bit requires the Sonic engine. Converted at 16-bit.</p>';
        }

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

// --- Cleanup blob URL on page unload ---
window.addEventListener('beforeunload', () => {
    if (lastBlobUrl) {
        URL.revokeObjectURL(lastBlobUrl);
        lastBlobUrl = null;
    }
});
