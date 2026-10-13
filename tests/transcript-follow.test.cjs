const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const playwright = require('playwright');
const {startServer} = require('./server.cjs');
const engines = (process.env.PLAYWRIGHT_BROWSERS || 'chromium,firefox,webkit').split(',');
for (const name of engines) test(`${name}: native transcript interactions`, {timeout:120000,concurrency:true}, async t => {
    const server = await startServer();
    let browser;
    try { browser = await playwright[name].launch({timeout:20000}); }
    catch (error) { await server.close(); throw error; }
    const context = await browser.newContext({viewport:{width:1100,height:850},reducedMotion:'reduce'});
    // Tests need no remote fonts, scripts, analytics, or media.
    await context.route('**/*', route => route.request().url().startsWith(server.url) ? route.continue() : route.abort());
    context.setDefaultTimeout(10000);
    context.setDefaultNavigationTimeout(10000);
    const page = await context.newPage(), errors=[];
    page.on('pageerror', e => errors.push(e.message));
    const media = () => page.locator('#player audio, #player video');
    const snapshot = () => page.evaluate(() => {
        const m=document.querySelector('#player audio, #player video'),p=document.querySelector('#transcript-window'),r=document.querySelector('.transcript-active-cue');
        return {time:m.currentTime,paused:m.paused,top:p.scrollTop,active:r ? Number(r.dataset.cueStart):null,
            offset:r ? r.getBoundingClientRect().top-p.getBoundingClientRect().top:null,
            status:document.querySelector('.transcript-follow-status').textContent};
    });
    const load = async kind => {
        await page.goto(`${server.url}/ohms.html?cachefile=${encodeURIComponent('/tests/fixture.xml?kind='+kind)}`);
        await media().waitFor();
        await page.waitForFunction(() => document.querySelector('#player audio, #player video').readyState>=1);
        await page.evaluate(() => {document.querySelector('#player audio, #player video').muted=true;});
    };
    const playAt = async time => {
        await page.evaluate(time => {
            const m=document.querySelector('#player audio, #player video');
            m.currentTime=time;m.play().catch(() => {});
        },time);
        // Verify playback advancement rather than promise settlement after seeks.
        await page.waitForFunction(time => {
            const m=document.querySelector('#player audio, #player video');
            return !m.paused && m.currentTime>time && m.currentTime<time+1.5;
        },time);
        await page.locator('.transcript-follow-return').click();
        await page.waitForTimeout(200);
    };
    try {
        await load('audio');
        await t.test('fractional timestamps, invalid timings and silence gaps', async () => {
            assert.equal(await page.locator('[data-cue-start]').count(),18);
            assert.equal(await page.evaluate(()=>parseVttTimestamp('00:00:03.125')),3.125);
            assert.equal(await page.evaluate(()=>parseVttTimestamp('00:70:03.125')),null);
            assert.equal(await page.evaluate(()=>displayVttTranscript('WEBVTT\n\n00:00:03.000 --> 00:00:02.000\nInvalid interval\n',[]).querySelectorAll('[data-cue-start]').length),0);
            await page.evaluate(()=>{const m=document.querySelector('audio');m.currentTime=5.8;});
            await page.waitForTimeout(200); assert.equal((await snapshot()).active,null);
        });
        await t.test('passage clicks seek without autoplay; timestamp links seek and play', async () => {
            const row=page.locator('[data-cue-start]').nth(8);
            await row.click({position:{x:100,y:12}}); await page.waitForTimeout(150);
            let s=await snapshot();assert.equal(s.paused,true);assert.ok(Math.abs(s.time-24.125)<.01);
            await row.locator('a.timestamp-link').click();await page.waitForTimeout(200);
            s=await snapshot();assert.equal(s.paused,false);assert.ok(s.time>=24.125&&s.time<25);
            await page.locator('[data-cue-start]').nth(4).click({position:{x:100,y:12}});
            s=await snapshot();assert.equal(s.paused,false);assert.ok(s.time>=12.125&&s.time<13);
        });
        await t.test('Enter seeks; Space toggles playback only with passage focus', async () => {
            await page.evaluate(()=>document.querySelector('audio').pause());
            const row=page.locator('[data-cue-start]').nth(9);await row.focus();await page.keyboard.press('Enter');
            assert.equal((await snapshot()).paused,true);assert.ok(Math.abs((await snapshot()).time-27.125)<.01);
            await page.keyboard.press('Space');await page.waitForTimeout(150);assert.equal((await snapshot()).paused,false);
            await page.keyboard.down('Space');await page.keyboard.down('Space');await page.keyboard.up('Space');
            assert.equal((await snapshot()).paused,true);
            await page.locator('.transcript-follow-return').focus();await page.keyboard.press('Space');
            assert.equal((await snapshot()).paused,true);
        });
        await t.test('active cue follows playback and backward seeks without moving parent page', async () => {
            await playAt(27.5);const before=await snapshot();
            assert.ok(Math.abs(before.offset-24)<3);assert.equal(await page.evaluate(()=>scrollY),0);
            await page.waitForTimeout(800);assert.ok((await snapshot()).time>before.time+.5);
            await page.evaluate(()=>{const m=document.querySelector('audio');m.pause();m.currentTime=12.2;});
            await page.waitForTimeout(200);assert.equal((await snapshot()).active,12.125);
        });
        await t.test('manual scrolling resets the four-second return and never pauses/seeks audio', async () => {
            await playAt(27.5);await page.locator('#transcript-window').hover();await page.mouse.wheel(0,-450);
            await page.waitForTimeout(200);const before=await snapshot();assert.match(before.status,/Browsing/);
            await page.waitForTimeout(2000);await page.mouse.wheel(0,-100);await page.waitForTimeout(2500);
            let s=await snapshot();assert.match(s.status,/Browsing/);assert.equal(s.paused,false);assert.ok(s.time>before.time+3);
            await page.waitForTimeout(2000);
            // Playback may be in a deliberate silent gap when the timer expires.
            assert.match((await snapshot()).status,/^Following playback/);
            await page.waitForFunction(()=>document.querySelector('.transcript-active-cue'),null,{timeout:2000});
            s=await snapshot();assert.ok(Math.abs(s.offset-24)<3);
        });
        await t.test('pausing permits browsing; Return locates paused cue without playing', async () => {
            await page.evaluate(()=>{const m=document.querySelector('audio');m.pause();m.currentTime=27.5;});await page.waitForTimeout(100);await page.mouse.wheel(0,-300);await page.waitForTimeout(500);
            const before=await snapshot();await page.waitForTimeout(4200);assert.equal((await snapshot()).top,before.top);assert.equal((await snapshot()).time,before.time);
            await page.locator('.transcript-follow-return').click();assert.equal((await snapshot()).paused,true);assert.ok(Math.abs((await snapshot()).offset-24)<3);
        });
        await t.test('explicit following-off persists until re-enabled', async () => {
            await playAt(27.5);await page.locator('.transcript-follow-toggle').click();await page.mouse.wheel(0,-350);await page.waitForTimeout(500);
            const before=await snapshot();await page.waitForTimeout(4200);const s=await snapshot();assert.equal(s.top,before.top);assert.match(s.status,/following is off/);assert.ok(s.time>before.time+3);
            await page.locator('.transcript-follow-return').click();assert.match((await snapshot()).status,/^Following playback/);
        });
        await t.test('selection prevents seek and holds reading until cleared', async () => {
            await page.evaluate(()=>{const n=document.querySelector('#transcript p span').lastChild,r=document.createRange();r.selectNodeContents(n);getSelection().removeAllRanges();getSelection().addRange(r);});
            await page.waitForTimeout(100);const before=await snapshot();
            await page.evaluate(()=>document.querySelector('#transcript p').dispatchEvent(new MouseEvent('click',{bubbles:true})));
            assert.ok((await snapshot()).time-before.time<.5);await page.waitForTimeout(4200);assert.match((await snapshot()).status,/Reading selection/);
            await page.evaluate(()=>getSelection().removeAllRanges());await page.waitForTimeout(4400);assert.match((await snapshot()).status,/^Following playback/);
        });
        await t.test('held pointer prevents return; release restarts the idle delay', async () => {
            await playAt(27.5);await page.locator('#transcript-window').hover();await page.mouse.wheel(0,-250);await page.waitForTimeout(100);
            await page.mouse.down();await page.waitForTimeout(4200);assert.match((await snapshot()).status,/Browsing/);
            await page.mouse.up();await page.waitForTimeout(4400);assert.match((await snapshot()).status,/^Following playback/);
        });
        await t.test('keyboard browsing leaves playback running and resumes after idle', async () => {
            await playAt(27.5);await page.locator('#transcript-window').focus();await page.keyboard.press('PageUp');
            await page.waitForTimeout(100);const before=await snapshot();assert.match(before.status,/Browsing/);
            await page.waitForTimeout(4400);const after=await snapshot();assert.equal(after.paused,false);assert.ok(after.time>before.time+3);assert.match(after.status,/^Following playback/);
        });
        await t.test('language refresh keeps one control group and preserves following-off', async () => {
            await page.locator('.transcript-follow-toggle').click();await page.locator('#swap-language').click();
            assert.equal(await page.locator('.transcript-follow-controls').count(),1);assert.match(await page.locator('#transcript p').first().textContent(),/Alternate passage/);
            assert.equal(await page.locator('.transcript-follow-toggle').getAttribute('aria-pressed'),'false');
        });
        await t.test('legacy transcripts retain existing navigation with new controls hidden', async () => {
            await load('legacy');assert.equal(await page.locator('[data-cue-start]').count(),0);assert.equal(await page.locator('.transcript-follow-controls').isVisible(),false);
        });
        await t.test('native video uses the same timed seek and highlight behavior', async () => {
            await load('video');await page.locator('[data-cue-start]').nth(4).click({position:{x:100,y:12}});
            assert.equal((await snapshot()).paused,true);assert.ok(Math.abs((await snapshot()).time-12.125)<.01);
            await playAt(27.5);assert.equal((await snapshot()).paused,false);assert.equal((await snapshot()).active,27.125);
            await page.evaluate(()=>{const m=document.querySelector('video');m.pause();m.currentTime=m.duration;});
            await page.waitForTimeout(200);assert.equal((await snapshot()).active,null);
        });
        await t.test('narrow viewport, reduced motion and cleanup', async () => {
            await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
            await page.evaluate(()=>{transcriptFollower.destroy();});assert.equal(await page.locator('.transcript-follow-controls').count(),0);
            assert.equal(await page.locator('.transcript-active-cue').count(),0);assert.deepEqual(errors,[]);
        });
        fs.mkdirSync('test-results',{recursive:true});
        fs.writeFileSync(`test-results/${name}.json`,JSON.stringify({browser:await browser.version(),errors},null,2));
    } finally {await browser.close();await server.close();}
});
