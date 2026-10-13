/* Synthetic browser fixtures only; no interview or collection data. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function tone() {
    const rate = 48000, samples = rate * 60, out = Buffer.alloc(44 + samples * 2);
    out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8);
    out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
    out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28);
    out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36);
    out.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++) out.writeInt16LE(Math.round(500 * Math.sin(2 * Math.PI * 220 * i / rate)), 44 + i * 2);
    return out;
}
const audio = tone();
const timestamp = n => `00:00:${Math.floor(n).toString().padStart(2, '0')}.${Math.round(n % 1 * 1000).toString().padStart(3, '0')}`;
const cues = prefix => Array.from({length:18}, (_, i) => `${timestamp(i * 3 + .125)} --> ${timestamp(i * 3 + 2.375)}\n${prefix} ${i + 1}. This generated passage demonstrates transcript navigation. Scroll to another passage while playback continues, then stop reading to return to the current passage. All words and media in this fixture are synthetic.`).join('\n\n');
function xml(url, kind) {
    const legacy = kind === 'legacy';
    return `<?xml version="1.0" encoding="UTF-8"?><ROOT><record>
    <title>Generated transcript navigation example</title><repository>Viewer test fixture</repository>
    <media_url>${url}/${kind === 'video' ? 'tests/fixtures/synthetic.webm' : 'tests/tone.wav'}</media_url>
    <mediafile><host>Other</host><clip_format>${kind === 'video' ? 'video' : 'audio'}</clip_format></mediafile>
    <language>English</language><transcript_alt_lang>Alternate</transcript_alt_lang><translate>1</translate>
    <transcript><![CDATA[${legacy ? 'FIRST: This is a generated legacy transcript.\nA second un-timed line stays unchanged.' : ''}]]></transcript>
    <sync>1:1|2</sync><vtt_transcript><![CDATA[${legacy ? '' : 'WEBVTT\n\n' + cues('Passage')}]]></vtt_transcript>
    <vtt_transcript_alt><![CDATA[${legacy ? '' : 'WEBVTT\n\n' + cues('Alternate passage')}]]></vtt_transcript_alt>
    <index><point><time>0</time><title>Generated example</title><synopsis>For local viewer testing.</synopsis></point></index>
    </record></ROOT>`;
}
async function startServer(port = 0) {
    const server = http.createServer((req, res) => {
        const name = new URL(req.url, 'http://localhost').pathname;
        let data, type;
        if (name === '/tests/fixture.xml') {
            data = Buffer.from(xml(`http://127.0.0.1:${server.address().port}`, new URL(req.url, 'http://localhost').searchParams.get('kind')));
            type = 'application/xml';
        } else if (name === '/tests/tone.wav') { data = audio; type = 'audio/wav'; }
        else {
            const allowed = ['/ohms.html', '/ohms.js', '/ohms.css', '/transcript-follow.js', '/tests/fixtures/synthetic.webm'];
            if (!allowed.includes(name) && !/^\/fonts\/[^/.][^/]*$/.test(name)) { res.writeHead(404).end(); return; }
            const file = path.resolve(root, '.' + name);
            if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile() || name.includes('/.git/')) { res.writeHead(404).end(); return; }
            data = fs.readFileSync(file);
            type = ({'.js':'application/javascript','.css':'text/css','.html':'text/html','.webm':'video/webm','.woff2':'font/woff2'})[path.extname(file)] || 'application/octet-stream';
        }
        let start = 0, end = data.length - 1;
        const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        if (range) { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), end); }
        if (start > end) { res.writeHead(416, {'Content-Range':`bytes */${data.length}`}).end(); return; }
        res.writeHead(range ? 206 : 200, {'Content-Type':type,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store',...(range ? {'Content-Range':`bytes ${start}-${end}/${data.length}`} : {})});
        res.end(req.method === 'HEAD' ? undefined : data.subarray(start, end + 1));
    });
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
    return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
module.exports = {startServer};
if (require.main === module) startServer(9010).then(({url}) => console.log(`${url}/ohms.html?cachefile=/tests/fixture.xml\nGenerated tones only. Control-C stops the demo.`));
