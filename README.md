# ohms.js

ohms.js is a Javascript-based viewer for [Oral History Metadata Synchronizer (OHMS)](https://www.oralhistoryonline.org)
XML files.

## Usage

`ohms.html` is the viewer, and it takes the URL of the OHMS XML file to display as the `cachefile` query string parameter,
so `ohms.html?cachefile=example.xml` where `example.xml` is the XML file's URL. Relative and absolute URLs are both accepted.

### Customization

Additional query string parameters can be used to customize the viewer interface.

- `link_color`: sets the color used for links; pass a six-character hex color code without the leading `#`
- `metadata`: pass `none` to disable displaying the title and repository on the top of the viewer

## Timed transcript navigation

For WebVTT transcripts played through native audio or video (`Other` media host),
the viewer highlights the passage at the current playback time and follows it
inside the transcript pane. Following starts enabled.

- Click passage text or press **Enter** on a focused passage to seek there. Paused
  playback stays paused; playing media continues. Timestamp links retain their
  existing seek-and-play behavior, including fractional cue times.
- Press **Space** on a focused passage to play or pause. Links and player controls
  keep their own keyboard behavior.
- Scroll, use reading-navigation keys, or hold/select text to browse independently.
  Playback continues. Following resumes four seconds after the last interaction,
  once any held pointer or text selection is released.
- **Follow playback** turns automatic following on or off. **Return to playback**
  enables following and locates the current passage; it does not start paused media.
- Automatic movement stays within the transcript pane, preserves keyboard focus,
  and respects reduced-motion preferences. Silence between cues has no active row.

The new controls require valid WebVTT start/end times and a native media player.
Legacy OHMS sync transcripts and hosted player integrations retain existing
navigation. Speaker labeling and transcript editing are outside this feature.

## Development checks

With Node.js installed:

```sh
npm install
npx playwright install chromium firefox webkit
npm test
```

The browser tests use generated tones and text plus a small synthetic video, and
block remote requests. To try the audio example locally, run `npm run demo` and
open the printed localhost URL. The example contains no recorded speech. See
[fixture provenance](tests/fixtures/README.md).

## Cross-origin files and CORS

Loading OHMS XML files for display is subject to the same-origin policy. This isn't an issue if your files are on the
same domain as the ohms.js viewer, but if they're on a different domain, you'll need to make sure CORS headers
(i.e., `Access-Control-Allow-Origin`) are set by the server that hosts the XML files.
