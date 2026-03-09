// ==UserScript==
// @name          护眼脚本
// @namespace     https://github.com/chaowushang/eye-protection
// @version        2.1
// @author         wushang
// @description   修改网页背景色，优化性能。
// @match         *://*/*
// @grant          GM_registerMenuCommand
// @grant          GM_setValue
// @grant          GM_getValue
// @grant          GM_addStyle
// @run-at         document-start
// @downloadURL    https://fastly.jsdelivr.net/gh/chaowushang/eye-protection@main/huyan.user.js
// @updateURL      https://fastly.jsdelivr.net/gh/chaowushang/eye-protection@main/huyan.user.js
// ==/UserScript==

(() => {
    'use strict';

    const COLORS = {
        yellow: { name: "乡土黄", val: "#F6F4EC" },
        green:  { name: "豆沙绿", val: "#CCE8CF" },
        grey:   { name: "浅色灰", val: "#F2F2F2" },
        olive:  { name: "淡橄榄", val: "#E1E6D7" }
    };

    const currentSite = window.location.hostname;
    // 获取禁用列表，确保实时性
    const getDisabledSites = () => GM_getValue("disabledSites", []);
    const isDisabled = getDisabledSites().includes(currentSite);

    const currentColor = GM_getValue("colorValue", "green");
    const bgVal = COLORS[currentColor]?.val || COLORS.green.val;

    // --- 核心更新 1: 简化菜单逻辑，解决重复出现问题 ---
    const setupMenu = () => {
        // 注册颜色选择菜单
        Object.keys(COLORS).forEach(key => {
            const icon = currentColor === key ? "● " : "○ ";
            GM_registerMenuCommand(`${icon}${COLORS[key].name}`, () => {
                GM_setValue("colorValue", key);
                location.reload();
            });
        });

        // 注册启用/禁用菜单（二选一）
        if (isDisabled) {
            GM_registerMenuCommand("✅ 启用", () => {
                const sites = getDisabledSites().filter(s => s !== currentSite);
                GM_setValue("disabledSites", sites);
                location.reload();
            });
        } else {
            GM_registerMenuCommand("❌ 禁用", () => {
                const sites = getDisabledSites();
                sites.push(currentSite);
                GM_setValue("disabledSites", [...new Set(sites)]); // 去重保存
                location.reload();
            });
        }
    };

    // --- 逻辑 1: 注入 CSS 核心样式 ---
    const injectStyles = () => {
        GM_addStyle(`
            .huyan-block {
                background-color: ${bgVal} !important;
                background-image: none !important;
                box-shadow: none !important;
            }
            .huyan-block div, 
            .huyan-block section, 
            .huyan-block article, 
            .huyan-block td, 
            .huyan-block .cell,
            .huyan-block .inner {
                background-color: transparent !important;
                background-image: none !important;
            }
            .huyan-block [class*="cell"], .huyan-block [class*="inner"] {
                background-color: transparent !important;
            }
        `);
    };

    // --- 逻辑 2: 判定函数 (优化性能：减少正则解析次数) ---
    const rgbRegex = /\d+/g;
    const processElement = (el) => {
        if (el.nodeType !== 1 || el.classList.contains('huyan-block')) return;
        
        const tagName = el.tagName;
        if (tagName === 'HTML' || tagName === 'BODY') return;

        const rect = el.getBoundingClientRect();
        if (rect.width < 50 || rect.height < 20) return;

        const winW = window.innerWidth;
        if (winW > 800 && rect.width > winW * 0.95) return;

        const style = window.getComputedStyle(el);
        const bg = style.backgroundColor;
        const rgb = bg.match(rgbRegex);

        if (rgb && rgb.length >= 3) {
            const r = Number(rgb[0]), g = Number(rgb[1]), b = Number(rgb[2]);
            // 判定为“白色系”：R,G,B均大于240且色差较小
            if (r > 240 && g > 240 && b > 240) {
                el.classList.add('huyan-block');
            }
        }
    };

    // --- 逻辑 3: 观察者模式 ---
    const startObserving = () => {
        const targetTags = ['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'TABLE', 'ASIDE'];
        
        // 初始扫描 (优化：只扫描容器类标签)
        document.querySelectorAll('div, section, article, main, table, aside').forEach(processElement);

        const observer = new MutationObserver((mutations) => {
            for (let i = 0; i < mutations.length; i++) {
                const addedNodes = mutations[i].addedNodes;
                for (let j = 0; j < addedNodes.length; j++) {
                    const node = addedNodes[j];
                    if (node.nodeType === 1) {
                        processElement(node);
                        // 局部查找，避免全局全标签扫描
                        const children = node.querySelectorAll('div, section, article');
                        for (let k = 0; k < children.length; k++) {
                            processElement(children[k]);
                        }
                    }
                }
            }
        });
        
        observer.observe(document.documentElement, { childList: true, subtree: true });
    };

    // --- 执行流程 ---
    setupMenu();

    // 核心更新 2: 严格校验禁用状态，防止意外启动
    if (!isDisabled) {
        injectStyles();
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startObserving);
        } else {
            startObserving();
        }

        window.addEventListener('load', () => {
            // 页面完全加载后最后补刷一次
            document.querySelectorAll('div, section, article').forEach(processElement);
        });
    }
})();
