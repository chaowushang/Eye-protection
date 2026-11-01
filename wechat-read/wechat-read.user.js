// ==UserScript==
// @name         微信读书网页版空格与滚轮翻页
// @namespace    https://github.com/chaowushang/wechat-read-space-flip
// @version      1.2.2
// @author       wushang
// @description  阅读区空格下一页、滚轮上下翻页，避让输入框、弹窗与缩放手势。
// @match        *://weread.qq.com/*
// @grant        none
// @run-at       document-start
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/chaowushang/Eye-protection/main/wechat-read/wechat-read.user.js
// @updateURL    https://raw.githubusercontent.com/chaowushang/Eye-protection/main/wechat-read/wechat-read.user.js
// ==/UserScript==

(() => {
    'use strict';
    const READER = '.readerChapterContent,.readerChapterContent_container,.readerContent,.app_content,.wr_horizontalReader,.wr_horizontalReader_app_content';
    const UI = '.readerCatalog,.readerNotePanel,.wr_white_dialog,.menu_container,[role="dialog"],[aria-modal="true"]';
    const EDITABLE = 'input,textarea,select,button,a[href],[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="button"],[role="slider"]';
    // Leading-edge throttle: ignore excess events, never queue delayed page turns.
    const WHEEL_COOLDOWN_MS = 400;
    let lastWheelFlip = -Infinity;
    let lastPath = '';

    function isReading() {
        // Reading layouts change; do not make keyboard or wheel support depend on a CSS class.
        return /^\/web\/reader\/[^/]+/.test(location.pathname);
    }

    function eventElement(e) {
        const target = e.composedPath?.()[0] || e.target;
        return target instanceof Element ? target : target?.parentElement;
    }

    function blocked(target) {
        return target?.closest(`${EDITABLE},${UI}`) ||
            document.activeElement?.closest(`${EDITABLE},${UI}`) ||
            [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(el => {
                const style = getComputedStyle(el);
                return el.getClientRects().length && style.visibility !== 'hidden' && style.display !== 'none';
            });
    }

    function dispatchArrow(forward) {
        const key = forward ? 'ArrowRight' : 'ArrowLeft';
        // Start at body so body, document and window listeners all receive one event.
        (document.body || document.documentElement || document).dispatchEvent(new KeyboardEvent('keydown', {
            key, code: key, keyCode: forward ? 39 : 37, which: forward ? 39 : 37,
            bubbles: true, cancelable: true
        }));
    }

    function hasModifier(e) {
        return e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
    }

    window.addEventListener('keydown', e => {
        if (e.defaultPrevented || (e.key !== ' ' && e.code !== 'Space')) return;
        if (hasModifier(e) || e.isComposing || !isReading() || blocked(eventElement(e))) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) dispatchArrow(true);
    }, true);

    window.addEventListener('wheel', e => {
        if (e.defaultPrevented || hasModifier(e) || !e.deltaY || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
        const target = eventElement(e);
        if (!isReading() || !target || blocked(target)) return;
        // Include reading-page margins, but preserve independently scrollable panels.
        for (let el = target; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
            if (el.matches(READER)) break;
            const style = getComputedStyle(el);
            if (/(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) return;
        }
        const now = performance.now();
        if (location.pathname !== lastPath) {
            lastWheelFlip = -Infinity;
        }
        lastPath = location.pathname;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (now - lastWheelFlip < WHEEL_COOLDOWN_MS) return;
        lastWheelFlip = now;
        dispatchArrow(e.deltaY > 0);
    }, { capture: true, passive: false });
})();
