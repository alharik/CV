/**
 * Sonic Converter API Dashboard
 * Fetches usage from /v1/usage and displays account details.
 */

const API_BASE = 'https://api.mp3towav.online';
const STORAGE_KEY = 'sonic_api_key';

// Tier metadata for display
const TIER_INFO = {
    free:      { label: 'Free',      maxFile: '100 MB',  bitDepths: '16-bit',          rateLimit: '10 req/min',  webhooks: 'Not available', cssClass: 'tier-free' },
    pro:       { label: 'Pro',       maxFile: '500 MB',  bitDepths: '16 / 24-bit',     rateLimit: '50 req/min',  webhooks: 'Not available', cssClass: 'tier-pro' },
    business:  { label: 'Business',  maxFile: '2 GB',    bitDepths: '16 / 24 / 32-bit', rateLimit: '200 req/min', webhooks: 'Available',     cssClass: 'tier-business' },
    unlimited: { label: 'Unlimited', maxFile: '5 GB',    bitDepths: '16 / 24 / 32-bit', rateLimit: '500 req/min', webhooks: 'Available',     cssClass: 'tier-unlimited' },
};

// DOM elements
const authSection = document.getElementById('auth-section');
const dashSection = document.getElementById('dashboard-section');
const keyForm = document.getElementById('keyForm');
const keyInput = document.getElementById('apiKeyInput');
const loadBtn = document.getElementById('loadBtn');
const errorMsg = document.getElementById('error-msg');
const logoutBtn = document.getElementById('logoutBtn');

// ---- Init ----
(function init() {
    const savedKey = localStorage.getItem(STORAGE_KEY);
    if (savedKey) {
        keyInput.value = savedKey;
        fetchUsage(savedKey);
    }
})();

// ---- Events ----
keyForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = keyInput.value.trim();
    if (!key) return;
    fetchUsage(key);
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    authSection.hidden = false;
    dashSection.hidden = true;
    keyInput.value = '';
    errorMsg.hidden = true;
});

// ---- Fetch Usage ----
async function fetchUsage(apiKey) {
    setLoading(true);
    errorMsg.hidden = true;

    try {
        const res = await fetch(`${API_BASE}/v1/usage`, {
            headers: { 'x-api-key': apiKey },
        });

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.message || `API returned ${res.status}`);
        }

        const data = await res.json();
        localStorage.setItem(STORAGE_KEY, apiKey);
        renderDashboard(data);
    } catch (err) {
        errorMsg.textContent = err.message || 'Failed to connect to the API.';
        errorMsg.hidden = false;
        authSection.hidden = false;
        dashSection.hidden = true;
    } finally {
        setLoading(false);
    }
}

// ---- Render ----
function renderDashboard(data) {
    authSection.hidden = true;
    dashSection.hidden = false;

    const tier = (data.tier || 'free').toLowerCase();
    const info = TIER_INFO[tier] || TIER_INFO.free;
    const used = data.conversions?.used ?? 0;
    const limit = data.conversions?.limit ?? null;
    const isUnlimited = limit === null;

    // Month label
    document.getElementById('current-month').textContent = formatMonth(data.month);

    // Tier badge
    const badge = document.getElementById('tier-badge');
    badge.textContent = info.label;
    badge.className = `tier-badge ${info.cssClass}`;

    // Conversions
    document.getElementById('conv-used').textContent = used.toLocaleString();
    document.getElementById('conv-limit').textContent = isUnlimited ? '\u221e' : limit.toLocaleString();

    // Progress bar
    const progressEl = document.getElementById('conv-progress');
    if (isUnlimited) {
        progressEl.style.width = '5%';
        progressEl.className = 'progress-fill';
    } else {
        const pct = Math.min((used / limit) * 100, 100);
        progressEl.style.width = `${pct}%`;
        progressEl.className = 'progress-fill' +
            (pct >= 90 ? ' danger' : pct >= 70 ? ' warning' : '');
    }

    // Reset date
    document.getElementById('resets-at').textContent = formatDate(data.resets_at);

    // Info requests
    document.getElementById('info-count').textContent = (data.info_requests ?? 0).toLocaleString();

    // Data sizes
    document.getElementById('data-in').textContent = formatBytes(data.total_input_bytes ?? 0);
    document.getElementById('data-out').textContent = formatBytes(data.total_output_bytes ?? 0);

    // Limits
    document.getElementById('max-file-size').textContent = info.maxFile;
    document.getElementById('bit-depths').textContent = info.bitDepths;
    document.getElementById('rate-limit').textContent = info.rateLimit;
    document.getElementById('webhooks-available').textContent = info.webhooks;

    // Upgrade CTA (show for non-unlimited tiers)
    document.getElementById('upgrade-section').hidden = tier === 'unlimited';
}

// ---- Helpers ----
function setLoading(loading) {
    loadBtn.disabled = loading;
    loadBtn.querySelector('.btn-text').hidden = loading;
    loadBtn.querySelector('.btn-loading').hidden = !loading;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const val = (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0);
    return `${val} ${units[i]}`;
}

function formatMonth(monthStr) {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

function formatDate(isoStr) {
    if (!isoStr) return '';
    const date = new Date(isoStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
