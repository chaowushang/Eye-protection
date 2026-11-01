const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../eye-protection/huyan.user.js'), 'utf8');

test('legacy install entry stays identical to the maintained script', () => {
    assert.equal(fs.readFileSync(path.join(__dirname, '../huyan.user.js'), 'utf8'), source);
});

function fixture(settings = {}) {
    const nodes = [];
    const menu = new Map();
    const frames = new Map();
    const events = {};
    const storage = { ...settings };
    let id = 0;
    let mutation;
    let observing = false;
    function element(options = {}) {
        const attrs = new Map();
        const el = {
            nodeType: 1, isConnected: true, bg: 'rgb(255, 255, 255)', image: 'none',
            width: 500, height: 100, excluded: false, ...options,
            matches() { return this.container !== false; },
            closest() { return this.excluded ? this : null; },
            hasAttribute(key) { return attrs.has(key); },
            setAttribute(key, value) { attrs.set(key, value); },
            removeAttribute(key) { attrs.delete(key); },
            getBoundingClientRect() { return { width: this.width, height: this.height }; },
            querySelectorAll() { return []; }
        };
        nodes.push(el);
        return el;
    }
    const root = element({ container: false });
    root.querySelectorAll = () => nodes.filter(el => el !== root);
    const styles = [];
    const document = {
        readyState: 'complete', documentElement: root,
        head: { appendChild(el) { styles.push(el); } },
        createElement() { return { textContent: '' }; },
        querySelectorAll() { return nodes.filter(el => el.hasAttribute('data-huyan-theme')); }
    };
    vm.runInNewContext(source, {
        document, location: { hostname: 'example.com' }, innerWidth: 1200,
        window: { addEventListener(type, fn) { events[type] = fn; } },
        getComputedStyle(el) { return { backgroundColor: el.bg, backgroundImage: el.image }; },
        GM_getValue(key, fallback) { return storage[key] ?? fallback; },
        GM_setValue(key, value) { storage[key] = value; },
        GM_registerMenuCommand(label, fn) { const key = ++id; menu.set(key, { label, fn }); return key; },
        GM_unregisterMenuCommand(key) { menu.delete(key); },
        requestAnimationFrame(fn) { const key = ++id; frames.set(key, fn); return key; },
        cancelAnimationFrame(key) { frames.delete(key); },
        MutationObserver: class {
            constructor(fn) { mutation = fn; }
            observe() { observing = true; }
            disconnect() { observing = false; }
        }
    });
    function drain() {
        let guard = 0;
        while (frames.size) {
            if (++guard > 50) throw Error('Frame queue did not settle');
            const current = [...frames.values()]; frames.clear(); current.forEach(fn => fn());
        }
    }
    function scan() { events.resize(); drain(); }
    function click(text) {
        const entry = [...menu.values()].find(item => item.label.includes(text));
        assert.ok(entry, text); entry.fn(); drain();
    }
    return { element, scan, click, storage, styles, menu, drain,
        marked: el => el.hasAttribute('data-huyan-theme'),
        mutate(el) { mutation([{ type: 'attributes', target: el }]); drain(); },
        observing: () => observing };
}

test('four themes and legacy preferences remain available without reload', () => {
    const f = fixture({ colorValue: 'yellow' });
    assert.match(f.styles[0].textContent, /#F6F4EC/);
    for (const [name, key, hex] of [['豆沙绿','green','#CCE8CF'],['浅色灰','grey','#F2F2F2'],['淡橄榄','olive','#E1E6D7'],['乡土黄','yellow','#F6F4EC']]) {
        f.click(name); assert.equal(f.storage.colorValue, key); assert.ok(f.styles[0].textContent.includes(hex));
        assert.equal(f.menu.size, 5);
    }
});
test('only opaque light containers are marked; images, dark and editable areas survive', () => {
    const f = fixture();
    const cases = [
        [{},true], [{bg:'rgba(255, 255, 255, 0)'},false],
        [{bg:'rgba(255, 255, 255, 0.1)'},false], [{bg:'rgb(30, 30, 30)'},false],
        [{image:'url(example.png)'},false], [{image:'linear-gradient(white, black)'},false],
        [{excluded:true},false], [{width:30},false], [{width:1190},false]
    ];
    const elements = cases.map(([options]) => f.element(options)); f.scan();
    cases.forEach(([,expected], i) => assert.equal(f.marked(elements[i]), expected));
    assert.doesNotMatch(f.styles[0].textContent, /background-image|box-shadow|transparent/);
});
test('existing marked nodes are restored when the website changes to dark', () => {
    const f = fixture(); const el = f.element(); f.scan(); assert.ok(f.marked(el));
    el.bg = 'rgb(20, 20, 20)'; f.mutate(el); assert.equal(f.marked(el), false);
    el.bg = 'rgb(250, 250, 250)'; f.mutate(el); assert.ok(f.marked(el));
});
test('site toggle restores markers immediately and resumes observation', () => {
    const f = fixture(); const el = f.element(); f.scan();
    f.click('禁用'); assert.equal(f.marked(el), false); assert.equal(f.observing(), false);
    assert.ok(f.storage.disabledSites.includes('example.com'));
    f.click('启用'); assert.ok(f.marked(el)); assert.equal(f.observing(), true);
});
test('disabled sites are not scanned and malformed saved values recover', () => {
    const f = fixture({ disabledSites:['example.com'] }); const el = f.element(); f.scan();
    assert.equal(f.marked(el), false); assert.equal(f.observing(), false);
    const recovered = fixture({ disabledSites: {}, colorValue:'invalid' });
    assert.ok(recovered.styles[0].textContent.includes('#CCE8CF'));
});
test('large batches finish across frames and disconnected nodes are ignored', () => {
    const f = fixture(); const elements = Array.from({length:350}, () => f.element());
    const removed = f.element({isConnected:false}); f.scan();
    assert.ok(elements.every(f.marked)); assert.equal(f.marked(removed), false);
});
