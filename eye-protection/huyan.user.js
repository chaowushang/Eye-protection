// ==UserScript==
// @name         护眼脚本
// @namespace    https://github.com/chaowushang/eye-protection
// @version      2.2.1
// @author       wushang
// @description  四种护眼配色、站点开关与动态内容适配，保留图片及原有深色区域。
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @license      Apache-2.0
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/chaowushang/Eye-protection/main/eye-protection/huyan.user.js
// @updateURL    https://raw.githubusercontent.com/chaowushang/Eye-protection/main/eye-protection/huyan.user.js
// ==/UserScript==

(() => {
    'use strict';
    const COLORS = {
        yellow: { name: '乡土黄', val: '#F6F4EC' },
        green: { name: '豆沙绿', val: '#CCE8CF' },
        grey: { name: '浅色灰', val: '#F2F2F2' },
        olive: { name: '淡橄榄', val: '#E1E6D7' }
    };
    const MARK = 'data-huyan-theme';
    const SELECTOR = 'div,section,article,main,table,aside,td,th,li,p';
    const EXCLUDE = 'input,textarea,select,button,video,audio,canvas,svg,img,iframe,pre,code,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="button"],[role="slider"],[role="switch"],.monaco-editor,.CodeMirror,.cm-editor';
    const site = location.hostname;
    const disabledSites = () => {
        const value = GM_getValue('disabledSites', []);
        return Array.isArray(value) ? value.filter(x => typeof x === 'string') : [];
    };
    let enabled = !disabledSites().includes(site);
    let color = GM_getValue('colorValue', 'green');
    if (!Object.hasOwn(COLORS, color)) color = 'green';
    let observer;
    let frame = 0;
    let styleElement;
    let ready = false;
    const pending = new Set();
    let menus = [];

    function updateStyle() {
        const css = `[${MARK}] { background-color: ${COLORS[color].val} !important; }`;
        if (styleElement) styleElement.textContent = css;
        else {
            styleElement = document.createElement('style');
            styleElement.textContent = css;
            (document.head || document.documentElement).appendChild(styleElement);
        }
    }

    function isLightBackground(value) {
        const match = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
        if (!match) return false;
        const rgb = match.slice(1, 4).map(Number);
        const alpha = match[4] === undefined ? 1 : Number(match[4]);
        return alpha >= 0.98 && alpha <= 1 && rgb.every(n => n > 240 && n <= 255);
    }

    function processElement(el) {
        // Remove only our marker before reading the website's actual background.
        el.removeAttribute(MARK);
        if (!el.isConnected || !el.matches(SELECTOR) || el.closest(EXCLUDE)) return;
        const rect = el.getBoundingClientRect();
        if (rect.width < 50 || rect.height < 20) return;
        if (innerWidth > 800 && rect.width > innerWidth * 0.95) return;
        const style = getComputedStyle(el);
        if (style.backgroundImage !== 'none' || !isLightBackground(style.backgroundColor)) return;
        el.setAttribute(MARK, '');
    }

    function flush() {
        frame = 0;
        if (!enabled) return;
        let count = 0;
        for (const el of pending) {
            pending.delete(el);
            processElement(el);
            if (++count >= 120) break;
        }
        if (pending.size) frame = requestAnimationFrame(flush);
    }

    function enqueue(root) {
        if (!enabled || root.nodeType !== 1 || root === styleElement) return;
        if (root.matches(SELECTOR) || root.hasAttribute(MARK)) pending.add(root);
        root.querySelectorAll(`${SELECTOR},[${MARK}]`).forEach(el => pending.add(el));
        if (!frame && pending.size) frame = requestAnimationFrame(flush);
    }

    function start() {
        if (!ready || !enabled || observer) return;
        updateStyle();
        observer = new MutationObserver(records => {
            for (const record of records) {
                if (record.type === 'attributes') enqueue(record.target);
                else record.addedNodes.forEach(enqueue);
            }
        });
        observer.observe(document.documentElement, {
            childList: true, subtree: true, attributes: true,
            attributeFilter: ['class', 'style', 'hidden', 'data-theme', 'data-color-mode']
        });
        enqueue(document.documentElement);
    }

    function stop() {
        observer?.disconnect();
        observer = undefined;
        cancelAnimationFrame(frame);
        frame = 0;
        pending.clear();
        document.querySelectorAll(`[${MARK}]`).forEach(el => el.removeAttribute(MARK));
    }

    function setupMenu() {
        // Older managers without unregister support keep stable labels and callbacks.
        const dynamic = typeof GM_unregisterMenuCommand === 'function';
        if (menus.length && !dynamic) return;
        if (dynamic) menus.forEach(id => GM_unregisterMenuCommand(id));
        menus = Object.entries(COLORS).map(([key, value]) => GM_registerMenuCommand(
            `${dynamic && color === key ? '● ' : ''}${value.name}`, () => {
                color = key;
                GM_setValue('colorValue', key);
                if (ready) updateStyle();
                setupMenu();
            }
        ));
        menus.push(GM_registerMenuCommand(dynamic ? (enabled ? '❌ 在此站禁用' : '✅ 在此站启用') : '切换此站启用/禁用', () => {
            enabled = !enabled;
            const sites = disabledSites().filter(value => value !== site);
            if (!enabled) sites.push(site);
            GM_setValue('disabledSites', [...new Set(sites)]);
            if (enabled) start(); else stop();
            setupMenu();
        }));
    }

    setupMenu();
    const init = () => { ready = true; start(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
    window.addEventListener('load', () => enqueue(document.documentElement), { once: true });
    window.addEventListener('resize', () => enqueue(document.documentElement));
    if (typeof matchMedia === 'function') {
        matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => enqueue(document.documentElement));
    }
})();
