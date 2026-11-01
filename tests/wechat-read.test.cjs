const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../wechat-read/wechat-read.user.js'), 'utf8');

function fixture() {
    const handlers = {};
    const arrows = [];
    const received = {body:0,document:0,window:0};
    let now = 0;
    let dialogs = [];
    class Element {
        constructor(parent = null) { this.parentElement = parent; this.blocked = false; this.scrollHeight = 100; this.clientHeight = 100; }
        closest() { return this.blocked ? this : this.parentElement?.closest() || null; }
        matches() { return !!this.readerRoot; }
        getClientRects() { return [1]; }
        contains(target) { for (let el = target; el; el = el.parentElement) if (el === this) return true; return false; }
        dispatchEvent(e) { received.body++; document.dispatchEvent(e); }
    }
    const body = new Element();
    const content = new Element(body);
    content.readerRoot = true;
    const target = new Element(content);
    const location = {pathname:'/web/reader/123'};
    const document = {
        activeElement: body, body, documentElement: new Element(),
        querySelector() { throw Error('Reader layout must not gate page turns'); }, querySelectorAll() { return dialogs; },
        dispatchEvent(e) { received.document++; arrows.push(e.key); if(e.bubbles) received.window++; }
    };
    vm.runInNewContext(source, {
        Element, document, location, innerHeight:800,
        performance:{now:() => now},
        getComputedStyle(el) { return { overflowY:el.overflow || 'visible', visibility:el.visibility || 'visible', display:el.display || 'block' }; },
        window:{addEventListener(type, fn) { handlers[type] = fn; }},
        KeyboardEvent:class { constructor(type, options) { Object.assign(this, options); } }
    });
    function send(type, options = {}) {
        const e = {target, key:' ', code:'Space', deltaY:100, deltaX:0, deltaMode:0,
            preventDefault(){this.prevented=true},stopImmediatePropagation(){}, ...options};
        handlers[type](e); return e;
    }
    return { send, arrows, received, body, content, target, document, location, Element,
        advance(ms) { now += ms; }, dialog(el) { dialogs = [el]; } };
}

test('Space dispatches exactly one ArrowRight and ignores key repeats', () => {
    const f = fixture(); assert.equal(f.send('keydown').prevented,true);
    f.send('keydown',{repeat:true}); assert.deepEqual(f.arrows,['ArrowRight']);
    assert.deepEqual(f.received,{body:1,document:1,window:1});
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
test('fast wheel events are discarded and continuous scrolling resumes at the cooldown', () => {
    const f = fixture(); f.send('wheel');
    for(let i=0;i<7;i++){f.advance(50);assert.equal(f.send('wheel').prevented,true);}
    assert.deepEqual(f.arrows,['ArrowRight']);
    f.advance(50); f.send('wheel',{deltaY:-100});
    assert.deepEqual(f.arrows,['ArrowRight','ArrowLeft']);
    f.advance(400);f.send('wheel');assert.equal(f.arrows.length,3);
});
test('small mouse-wheel notches and all delta modes work without a distance threshold', () => {
    const f = fixture(); f.send('wheel',{deltaY:1});assert.equal(f.arrows.length,1);
    f.advance(400);f.send('wheel',{deltaY:-1,deltaMode:1});assert.equal(f.arrows[1],'ArrowLeft');
    f.advance(400);f.send('wheel',{deltaY:1,deltaMode:2});assert.equal(f.arrows[2],'ArrowRight');
});
test('zoom, horizontal scrolling, side panels and visible dialogs keep native events', () => {
    const f = fixture();
    assert.equal(f.send('wheel',{ctrlKey:true}).prevented,undefined);
    assert.equal(f.send('wheel',{deltaX:200}).prevented,undefined);
    assert.equal(f.send('wheel',{target:f.body}).prevented,true);
    f.target.overflow='auto';f.target.scrollHeight=500;
    assert.equal(f.send('wheel').prevented,undefined);
    f.target.overflow='visible';f.dialog(new f.Element());
    assert.equal(f.send('wheel').prevented,undefined);
    assert.equal(f.send('keydown').prevented,undefined);
    assert.equal(f.arrows.length,1);
});
test('SPA reader navigation resets gesture state', () => {
    const f = fixture(); f.send('wheel'); f.location.pathname='/web/reader/456'; f.send('wheel');
    assert.equal(f.arrows.length,2);
});
test('scrollable reader layouts and page margins do not disable wheel flipping', () => {
    const f = fixture(); f.content.overflow='auto'; f.content.scrollHeight=500;
    assert.equal(f.send('wheel').prevented,true);
    f.advance(400);
    assert.equal(f.send('wheel',{target:new f.Element(f.body)}).prevented,true);
    assert.equal(f.arrows.length,2);
});
test('hidden semantic dialogs do not block Space or wheel', () => {
    const f = fixture(); const dialog=new f.Element(); dialog.visibility='hidden';f.dialog(dialog);
    assert.equal(f.send('keydown').prevented,true);
    assert.equal(f.send('wheel').prevented,true);assert.equal(f.arrows.length,2);
});
test('rapid wheel events never build a delayed queue and never block a new Space press', () => {
    const f = fixture();f.send('wheel');
    for(let i=0;i<100;i++)f.send('wheel');
    assert.equal(f.arrows.length,1);
    f.advance(2000);assert.equal(f.arrows.length,1);
    f.send('keydown');assert.equal(f.arrows.length,2);
    f.send('wheel');assert.equal(f.arrows.length,3);
});
