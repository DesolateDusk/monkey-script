// ==UserScript==
// @name         媒體資料流攔截
// @namespace    http://github.io
// @version      1.0
// @description  攔截媒體資料流
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (window.vConsoleStreamCaptured) return;
    window.vConsoleStreamCaptured = true;

    // URL -> image / video
    const capturedMedia = new Map();

    const mediaExt = /\.(jpg|jpeg|gif|png|webp|avif|bmp|svg|mp4|webm|mov|m4v)(?:\?.*)?$/i;
    const videoExt = /\.(mp4|webm|mov|m4v)(?:\?.*)?$/i;

    // ============================================================
    // 媒體加入
    // ============================================================

    function addMedia(url, type) {
        if (!url || url.startsWith('data:') || capturedMedia.has(url)) return;

        // 沒有明確類型時依副檔名判斷
        if (!type) {
            if (!mediaExt.test(url)) return;
            type = videoExt.test(url) ? 'video' : 'image';
        }

        capturedMedia.set(url, type);
        appendMedia(url, type);

        const count = document.getElementById('vc-stream-count');
        if (count) count.textContent = capturedMedia.size;
    }

    // ============================================================
    // PerformanceObserver
    //
    // 保留原始版本的判斷方式。
    // img / css / media 由瀏覽器直接告知，不再要求一定有副檔名。
    // ============================================================

    try {
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                if (entry.initiatorType === 'img') {
                    addMedia(entry.name, 'image');

                } else if (entry.initiatorType === 'media') {
                    addMedia(entry.name, 'video');

                } else if (entry.initiatorType === 'css') {
                    addMedia(entry.name, 'image');

                } else if (mediaExt.test(entry.name)) {
                    addMedia(
                        entry.name,
                        videoExt.test(entry.name) ? 'video' : 'image'
                    );
                }
            }
        }).observe({ entryTypes: ['resource'] });

    } catch (e) {
        console.error('[Media Stream] PerformanceObserver 啟動失敗', e);
    }

    // ============================================================
    // API Response 掃描
    // ============================================================

    function scanTextForMedia(text) {
        if (!text || typeof text !== 'string') return;

        const regex =
            /(https?:\/\/[^\s"'><]+?\.(?:jpg|jpeg|gif|png|webp|avif|bmp|svg|mp4|webm|mov|m4v)(?:\?[^\s"'>]*)?)/gi;

        let match;

        while ((match = regex.exec(text)) !== null) {
            addMedia(match[1]);
        }
    }

    // ============================================================
    // XMLHttpRequest
    //
    // 不替換 XMLHttpRequest constructor，
    // 只 Hook prototype.send。
    // ============================================================

    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.send = function (...args) {
        this.addEventListener('load', function () {
            if (this.status < 200 || this.status >= 300) return;

            try {
                scanTextForMedia(this.responseText);
            } catch (_) {}
        }, { once: true });

        return originalSend.apply(this, args);
    };

    // ============================================================
    // Fetch
    // ============================================================

    const originalFetch = window.fetch;

    if (originalFetch) {
        window.fetch = async function (...args) {
            const response = await originalFetch.apply(this, args);

            try {
                response
                    .clone()
                    .text()
                    .then(scanTextForMedia)
                    .catch(() => {});
            } catch (_) {}

            return response;
        };
    }

    // ============================================================
    // UI Style
    // ============================================================

    const style = `
        #vc-custom-panel {
            position:fixed; left:0; right:0; bottom:0;
            width:100%; height:50vh;
            display:none; flex-direction:column;
            background:#fff; border-top:2px solid #07c160;
            box-shadow:0 -4px 18px rgba(0,0,0,.25);
            z-index:2147483647;
            font-family:Arial,"Microsoft JhengHei",sans-serif;
        }

        #vc-custom-panel * { box-sizing:border-box; }

        #vc-toolbar {
            height:48px; padding:0 12px;
            display:flex; align-items:center;
            flex-shrink:0;
            background:#f3f3f3;
            border-bottom:1px solid #ddd;
        }

        #vc-stream-title {
            flex:1;
            font-size:14px; font-weight:bold; color:#333;
        }

        #vc-toolbar button {
            border:0; border-radius:5px;
            padding:6px 12px;
            color:#fff;
            font-size:12px; font-weight:bold;
            cursor:pointer;
        }

        #vc-clear-btn { background:#ff9500; margin-right:8px; }
        #vc-close-btn { background:#ff3b30; }

        #vc-content-stream {
            flex:1;
            overflow:auto;
            padding:8px;
        }

        .vc-media-row {
            display:flex; align-items:center; gap:12px;
            min-height:64px;
            padding:8px; margin-bottom:6px;
            background:#f7f7f7;
            border:1px solid #e5e5e5;
            border-radius:6px;
            color:#333;
            text-decoration:none;
        }

        .vc-media-row:hover {
            background:#eefaf3;
            border-color:#07c160;
        }

        .vc-preview {
            width:90px; height:56px;
            flex-shrink:0;
            object-fit:cover;
            border-radius:4px;
            background:#ddd;
        }

        .vc-video {
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:22px;
        }

        .vc-media-info {
            min-width:0;
            flex:1;
        }

        .vc-media-type {
            margin-bottom:4px;
            color:#07c160;
            font-size:11px;
            font-weight:bold;
        }

        .vc-media-path {
            overflow:hidden;
            white-space:nowrap;
            text-overflow:ellipsis;
            font-size:13px;
        }

        #vc-custom-toggle-btn {
            position:fixed;
            right:20px; bottom:20px;
            z-index:2147483646;
            padding:11px 16px;
            border:0; border-radius:24px;
            background:#07c160; color:#fff;
            font-size:13px; font-weight:bold;
            cursor:grab;
            user-select:none;
            touch-action:none;
            box-shadow:0 4px 12px rgba(0,0,0,.35);
        }
    `;

    // ============================================================
    // UI
    // ============================================================

    function initUI() {
        if (!document.body || document.getElementById('vc-custom-panel')) return;

        const styleElement = document.createElement('style');
        styleElement.textContent = style;
        (document.head || document.documentElement).appendChild(styleElement);

        document.body.insertAdjacentHTML('beforeend', `
            <div id="vc-custom-panel">
                <div id="vc-toolbar">
                    <span id="vc-stream-title">
                        📟 媒體流觀測 (<span id="vc-stream-count">${capturedMedia.size}</span>)
                    </span>

                    <button id="vc-clear-btn">🧹 清空</button>
                    <button id="vc-close-btn">關閉</button>
                </div>

                <div id="vc-content-stream"></div>
            </div>
        `);

        const trigger = document.createElement('button');
        trigger.id = 'vc-custom-toggle-btn';
        trigger.textContent = '⚙️ Media Stream';

        document.body.appendChild(trigger);

        document.getElementById('vc-close-btn').onclick = () => {
            document.getElementById('vc-custom-panel').style.display = 'none';
        };

        document.getElementById('vc-clear-btn').onclick = () => {
            capturedMedia.clear();
            document.getElementById('vc-content-stream').innerHTML = '';
            document.getElementById('vc-stream-count').textContent = '0';
        };

        enableDrag(trigger);

        // UI 建立前已抓到的資料補上
        for (const [url, type] of capturedMedia) {
            appendMedia(url, type);
        }
    }

    // ============================================================
    // 媒體 Row
    // ============================================================

    function appendMedia(url, type) {
        const container = document.getElementById('vc-content-stream');
        if (!container) return;

        const row = document.createElement('a');
        row.className = 'vc-media-row';
        row.href = url;
        row.target = '_blank';
        row.rel = 'noopener noreferrer';
        row.title = url;

        let preview;

        if (type === 'video') {
            preview = document.createElement('div');
            preview.className = 'vc-preview vc-video';
            preview.textContent = '🎬';

        } else {
            preview = document.createElement('img');
            preview.className = 'vc-preview';
            preview.src = url;
            preview.loading = 'lazy';

            preview.onerror = () => {
                preview.style.visibility = 'hidden';
            };
        }

        const info = document.createElement('div');
        info.className = 'vc-media-info';

        const mediaType = document.createElement('div');
        mediaType.className = 'vc-media-type';
        mediaType.textContent = type === 'video' ? '🎬 Video' : '🖼 Image';

        const path = document.createElement('div');
        path.className = 'vc-media-path';

        try {
            const parsed = new URL(url);
            path.textContent = parsed.pathname + parsed.search;
        } catch {
            path.textContent = url;
        }

        info.append(mediaType, path);
        row.append(preview, info);
        container.appendChild(row);
    }

    // ============================================================
    // 可拖曳按鈕
    // ============================================================

    function enableDrag(button) {
        let startX, startY, startLeft, startTop;
        let dragging = false;
        let moved = false;

        button.onpointerdown = e => {
            if (e.button !== 0) return;

            const rect = button.getBoundingClientRect();

            startX = e.clientX;
            startY = e.clientY;
            startLeft = rect.left;
            startTop = rect.top;

            dragging = true;
            moved = false;

            button.style.left = `${rect.left}px`;
            button.style.top = `${rect.top}px`;
            button.style.right = 'auto';
            button.style.bottom = 'auto';

            button.setPointerCapture(e.pointerId);
        };

        button.onpointermove = e => {
            if (!dragging) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;

            const maxX = window.innerWidth - button.offsetWidth;
            const maxY = window.innerHeight - button.offsetHeight;

            button.style.left =
                `${Math.max(0, Math.min(startLeft + dx, maxX))}px`;

            button.style.top =
                `${Math.max(0, Math.min(startTop + dy, maxY))}px`;
        };

        button.onpointerup = e => {
            dragging = false;

            try {
                button.releasePointerCapture(e.pointerId);
            } catch (_) {}

            if (!moved) {
                const panel = document.getElementById('vc-custom-panel');

                panel.style.display =
                    panel.style.display === 'flex'
                        ? 'none'
                        : 'flex';
            }
        };
    }

    // ============================================================
    // 初始化
    // ============================================================

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initUI, { once: true });
    } else {
        initUI();
    }

})();
