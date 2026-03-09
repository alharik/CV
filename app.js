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
const previewBtn = document.getElementById('previewBtn');

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

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (isProcessing) return;
    const files = Array.from(e.dataTransfer.files).filter(f =>
        f.name.toLowerCase().endsWith('.mp3') || f.type === 'audio/mpeg'
    );
    if (files.length === 0) {
        showError("No MP3 files found. Please drop valid .mp3 files.");
        return;
    }
    if (files.length === 1) {
        handleFile(files[0]);
    } else {
        handleBatch(files);
    }
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
    const files = Array.from(fileInput.files).filter(f =>
        f.name.toLowerCase().endsWith('.mp3') || f.type === 'audio/mpeg'
    );
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

// --- Batch Buttons ---
downloadAllBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const successResults = batchResults.filter(r => !r.error);
    if (successResults.length === 0) return;

    if (successResults.length === 1) {
        triggerDownload(successResults[0].blobUrl, successResults[0].outputName);
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

// --- Audio Preview ---
previewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (previewAudio && !previewAudio.paused) {
        previewAudio.pause();
        previewAudio.currentTime = 0;
        previewBtn.innerHTML = '&#9654; Preview';
        previewBtn.classList.remove('playing');
        previewAudio = null;
        return;
    }
    if (!lastBlobUrl) return;
    previewAudio = new Audio(lastBlobUrl);
    previewAudio.play().catch(() => {
        previewBtn.innerHTML = '&#9654; Preview';
        previewBtn.classList.remove('playing');
        previewAudio = null;
    });
    previewBtn.innerHTML = '&#9646;&#9646; Stop';
    previewBtn.classList.add('playing');
    previewAudio.addEventListener('ended', () => {
        previewBtn.innerHTML = '&#9654; Preview';
        previewBtn.classList.remove('playing');
        previewAudio = null;
    });
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
            const mp3Bytes = new Uint8Array(arrayBuffer);
            let wavBuffer;
            let actualBitDepth = selectedBitDepth;

            if (wasmReady) {
                wavBuffer = wasmModule.convertMp3ToWavWithDepth(mp3Bytes, selectedBitDepth).buffer;
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

            const outputName = files[i].name.replace(/\.mp3$/i, '.wav');
            const blob = new Blob([wavBuffer], { type: 'audio/wav' });
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
    batchResults.forEach(r => {
        if (r.blobUrl) URL.revokeObjectURL(r.blobUrl);
    });
});
