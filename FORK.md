# 3DH Lab development fork

This public fork is maintained by the **3D Humanities Lab** to develop and test
focused improvements to the [upstream OHMS viewer](https://github.com/omeka/ohms.js).
Upstream authorship and the GPL-3.0 license are retained. New contribution code is
credited to 3DH Lab.

The first contribution adds timed transcript following and passage seeking for
native media. Its upstream proposal is
[omeka/ohms.js#1](https://github.com/omeka/ohms.js/pull/1). The `transcript-follow`
branch contains that focused proposal; `main` also carries these fork notes.

Future work may explore speaker presentation, correction of speaker names and
turns, and local audio analysis. Those features will be developed separately and
proposed upstream individually after validation. The current contribution does
not include an editor or automatic voice attribution.

## Maintaining the fork

- Keep `upstream` pointed at `https://github.com/omeka/ohms.js.git` and fetch its
  changes regularly. Preserve the relationship with the original project.
- Start upstream contribution branches from `upstream/main`; include only the
  selected feature and its documentation/tests. Keep fork-specific notes out of
  upstream PRs.
- Bring accepted changes into the development branch without rewriting published
  history. Use reviewed, versioned snapshots when packaging the viewer into an
  embedding application.
- Retain synthetic fixtures for tests and public examples. Research recordings,
  transcripts, catalog exports, credentials and institution-specific settings
  belong outside this public repository.

See the [README](README.md) for supported behavior, demo commands and browser
checks. The synthetic media's provenance is documented in
[tests/fixtures/README.md](tests/fixtures/README.md).
