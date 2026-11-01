const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../wechat-read/wechat-read.user.js'), 'utf8');

function fixture() {
    const handlers = {};
    const arrows = [];
    let now = 0;
    let dialogs = [];
    class Element {
        constructor(parent = null) { this.parentElement = parent; this.blocked = false; this.scrollHeight = 100; this.clientHeight = 100; }
        closest() { return this.blocked ? this : this.parentElement?.closest() || null; }
        getClientRects() { return [1]; }
        contains(target) { for (let el = target; el; el = el.parentElement) if (el === this) return true; return false; }
    }
    const content = new Element();
    const target = new Element(content);
    const location = {pathname:'/web/reader/123'};
    const document = {
        activeElement: new Element(),
        querySelector() { return content; }, querySelectorAll() { return dialogs; },
        dispatchEvent(e) { arrows.push(e.key); }
    };
    vm.runInNewContext(source, {
        Element, document, location, innerHeight:800,
        performance:{now:() => now},
        getComputedStyle(el) { return { overflowY:el.overflow || 'visible', visibility:'visible' }; },
        window:{addEventListener(type, fn) { handlers[type] = fn; }},
        KeyboardEvent:class { constructor(type, options) { Object.assign(this, options); } }
    });
    function send(type, options = {}) {
        const e = {target, key:' ', code:'Space', deltaY:100, deltaX:0, deltaMode:0,
            preventDefault(){this.prevented=true},stopImmediatePropagation(){}, ...options};
        handlers[type](e); return e;
    }
    return { send, arrows, content, target, document, location, Element,
        advance(ms) { now += ms; }, dialog(el) { dialogs = [el]; } };
}

test('Space dispatches exactly one ArrowRight and ignores key repeats', () => {
    const f = fixture(); assert.equal(f.send('keydown').prevented,true);
    f.send('keydown',{repeat:true}); assert.deepEqual(f.arrows,['ArrowRight']);
});
test('non-reader pages, inputs, buttons, modifiers and composition are not intercepted', () => {
    const f = fixture();
    for (const key of ['ctrlKey','shiftKey','metaKey','altKey','isComposing','defaultPrevented']) {
        assert.equal(f.send('keydown',{[key]:true}).prevented,undefined);
    }
    f.document.activeElement.blocked=true;
    assert.equal(f.send('keydown').prevented,undefined);
    f.document.activeElement.blocked=false; f.target.blocked=true;
    assert.equal(f.send('keydown').prevented,undefined);
    f.target.blocked=false; f.location.pathname='/web/shelf';
    assert.equal(f.send('keydown').prevented,undefined);
    assert.equal(f.send('wheel').prevented,undefined);
    assert.equal(f.arrows.length,0);
});
test('wheel direction and a fresh gesture work while inertia stays on one page', () => {
    const f = fixture(); f.send('wheel');
    for(let i=0;i<20;i++){f.advance(50);f.send('wheel');}
    assert.deepEqual(f.arrows,['ArrowRight']);
    f.advance(300); f.send('wheel',{deltaY:-100});
    assert.deepEqual(f.arrows,['ArrowRight','ArrowLeft']);
});
test('small deltas accumulate and line-mode deltas are normalized', () => {
    const f = fixture(); f.send('wheel',{deltaY:10}); f.send('wheel',{deltaY:10});
    assert.equal(f.arrows.length,0);
    f.send('wheel',{deltaY:20}); assert.equal(f.arrows.length,1);
    f.advance(300);f.send('wheel',{deltaY:-3,deltaMode:1});assert.equal(f.arrows[1],'ArrowLeft');
});
test('zoom, horizontal scrolling, side panels and visible dialogs keep native events', () => {
    const f = fixture();
    assert.equal(f.send('wheel',{ctrlKey:true}).prevented,undefined);
    assert.equal(f.send('wheel',{deltaX:200}).prevented,undefined);
    assert.equal(f.send('wheel',{target:new f.Element()}).prevented,undefined);
    f.target.overflow='auto';f.target.scrollHeight=500;
    assert.equal(f.send('wheel').prevented,undefined);
    f.target.overflow='visible';f.dialog(new f.Element());
    assert.equal(f.send('wheel').prevented,undefined);
    assert.equal(f.send('keydown').prevented,undefined);
    assert.equal(f.arrows.length,0);
});
test('SPA reader navigation resets gesture state', () => {
    const f = fixture(); f.send('wheel'); f.location.pathname='/web/reader/456'; f.send('wheel');
    assert.equal(f.arrows.length,2);
});
