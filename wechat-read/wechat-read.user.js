// ==UserScript==
// @name         微信读书网页版空格与滚轮翻页
// @namespace    https://github.com/chaowushang/wechat-read-space-flip
// @version      1.2.1
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
    const READER = '.readerChapterContent, .app_content';
    const UI = '.readerCatalog,.readerNotePanel,.wr_white_dialog,.menu_container,[role="dialog"],[aria-modal="true"]';
    const EDITABLE = 'input,textarea,select,button,a[href],[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="button"],[role="slider"]';
    const QUIET_MS = 250;
    const MIN_DELTA = 40;
    let lastWheel = -Infinity;
    let gestureHandled = false;
    let accumulated = 0;
    let direction = 0;
    let lastPath = '';

    function reader() {
        if (!/^\/web\/reader\//.test(location.pathname)) return null;
        const el = document.querySelector(READER);
        return el && el.getClientRects().length ? el : null;
    }

    function eventElement(e) {
        const target = e.composedPath?.()[0] || e.target;
        return target instanceof Element ? target : target?.parentElement;
    }

    function blocked(target) {
        return target?.closest(`${EDITABLE},${UI}`) ||
            document.activeElement?.closest(`${EDITABLE},${UI}`) ||
            [...document.querySelectorAll(UI)].some(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    }

    function dispatchArrow(forward) {
        const key = forward ? 'ArrowRight' : 'ArrowLeft';
        // One dispatch only; document's event bubbles to window naturally.
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key, code: key, keyCode: forward ? 39 : 37, which: forward ? 39 : 37,
            bubbles: true, cancelable: true
        }));
    }

    function hasModifier(e) {
        return e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
    }

    window.addEventListener('keydown', e => {
        if (e.defaultPrevented || (e.key !== ' ' && e.code !== 'Space')) return;
        if (hasModifier(e) || e.isComposing || !reader() || blocked(eventElement(e))) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) dispatchArrow(true);
    }, true);

    window.addEventListener('wheel', e => {
        if (e.defaultPrevented || hasModifier(e) || !e.deltaY || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
        const content = reader();
        const target = eventElement(e);
        if (!content || !target || !content.contains(target) || blocked(target)) return;
        // Preserve independently scrollable panels nested inside the reader.
        for (let el = target; el && el !== content; el = el.parentElement) {
            const style = getComputedStyle(el);
            if (/(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) return;
        }
        const now = performance.now();
        if (location.pathname !== lastPath || now - lastWheel > QUIET_MS) {
            accumulated = 0;
            direction = 0;
            gestureHandled = false;
        }
        lastPath = location.pathname;
        lastWheel = now;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (gestureHandled) return;
        const nextDirection = Math.sign(e.deltaY);
        if (direction !== nextDirection) accumulated = 0;
        direction = nextDirection;
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
        accumulated += Math.abs(e.deltaY) * unit;
        if (accumulated >= MIN_DELTA) {
            gestureHandled = true;
            dispatchArrow(direction > 0);
        }
    }, { capture: true, passive: false });
})();
