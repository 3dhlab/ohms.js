/* Copyright (c) 2026 3DH Lab. Licensed under GPL-3.0. */
(function () {
    'use strict';
    class TranscriptFollow {
        constructor(media) {
            this.media = media;
            this.pane = document.querySelector('#transcript-window');
            this.text = document.querySelector('#transcript');
            this.enabled = true;
            this.delay = 4000;
            this.until = 0;
            this.pointers = new Set();
            this.selected = false;
            this.active = null;
            this.listeners = [];
            this.motion = matchMedia('(prefers-reduced-motion: reduce)');
            this.toolbar = document.createElement('div');
            this.toolbar.className = 'transcript-follow-controls';
            this.toolbar.setAttribute('role', 'group');
            this.toolbar.setAttribute('aria-label', 'Transcript following controls');
            this.toolbar.innerHTML = '<button type="button" class="transcript-follow-toggle" aria-pressed="true" aria-controls="transcript-window">Follow playback: On</button>' +
                '<button type="button" class="transcript-follow-return" aria-controls="transcript-window">Return to playback</button>' +
                '<span class="transcript-follow-status" role="status" aria-live="polite"></span>';
            document.querySelector('#controls').prepend(this.toolbar);
            this.toggle = this.toolbar.querySelector('.transcript-follow-toggle');
            this.returnButton = this.toolbar.querySelector('.transcript-follow-return');
            this.status = this.toolbar.querySelector('.transcript-follow-status');
            this.listen(this.toggle, 'click', () => {
                this.enabled = !this.enabled;
                this.until = 0;
                if (!this.enabled) this.cancelAnimation();
                this.sync(true);
            });
            this.listen(this.returnButton, 'click', () => {
                this.enabled = true;
                this.until = 0;
                this.sync(true);
                // The button can locate the paused passage without starting playback.
                if (this.media.paused && this.active) this.align();
            });
            this.listen(this.pane, 'click', e => {
                if (e.target.closest('a, button, input, select') || this.selected || !getSelection().isCollapsed) return;
                const row = e.target.closest('[data-cue-start][data-cue-end]');
                if (!row || (e.detail > 0 && this.pointerOrigin && Math.hypot(e.clientX - this.pointerOrigin.x, e.clientY - this.pointerOrigin.y) > 6)) return;
                this.seekPassage(row);
                row.focus({preventScroll: true});
            });
            this.listen(this.pane, 'keydown', e => {
                const row = e.target.closest('[data-cue-start][data-cue-end]');
                if (!row || e.target.closest('a, button, input, select') || e.ctrlKey || e.altKey || e.metaKey) return;
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.seekPassage(row);
                } else if (e.key === ' ') {
                    e.preventDefault();
                    if (e.repeat) return;
                    if (this.media.paused) this.media.play().catch(() => {});
                    else this.media.pause();
                }
            });
            this.listen(this.pane, 'wheel', () => this.interact(), {passive: true});
            this.listen(this.pane, 'pointerdown', e => {
                this.pointerOrigin = {x: e.clientX, y: e.clientY};
                this.pointers.add(e.pointerId);
                this.interact();
            });
            const release = e => {
                if (this.pointers.delete(e.pointerId)) this.interact();
            };
            this.listen(window, 'pointerup', release);
            this.listen(window, 'pointercancel', release);
            this.listen(window, 'blur', () => {
                this.pointers.clear();
                this.interact();
            });
            this.listen(this.pane, 'keydown', e => {
                if (!e.defaultPrevented && ['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(e.key)) this.interact();
            });
            this.listen(this.pane, 'focusin', () => this.interact());
            this.listen(this.pane, 'scroll', () => {
                if (this.programmatic) this.clearAnimationSoon();
                else this.interact(false);
            }, {passive: true});
            this.listen(document, 'selectionchange', () => {
                const selection = getSelection();
                const selected = !!selection && !selection.isCollapsed &&
                    (this.pane.contains(selection.anchorNode) || this.pane.contains(selection.focusNode));
                if (selected || selected !== this.selected) {
                    this.selected = selected;
                    this.interact();
                }
            });
            for (const event of ['timeupdate','play','pause','seeking','seeked','loadedmetadata','ended']) {
                this.listen(media, event, () => {
                    if (event === 'pause' || event === 'ended') this.cancelAnimation();
                    this.sync(event === 'play' || event === 'seeked');
                });
            }
            this.listen(window, 'pagehide', event => {
                if (!event.persisted) this.destroy();
                else { clearTimeout(this.timer); this.cancelAnimation(); }
            });
            this.listen(window, 'pageshow', event => { if (event.persisted) this.sync(true); });
            this.resize = new ResizeObserver(() => {
                this.text.style.setProperty('--transcript-follow-bottom-space', `${Math.max(0, this.pane.clientHeight - 100)}px`);
                this.sync(true);
            });
            this.resize.observe(this.pane);
            this.refresh();
        }
        listen(target, event, handler, options) {
            target.addEventListener(event, handler, options);
            this.listeners.push(() => target.removeEventListener(event, handler, options));
        }
        refresh() {
            this.active?.classList.remove('transcript-active-cue');
            this.active?.removeAttribute('aria-current');
            this.active = null;
            this.rows = [...this.text.querySelectorAll('[data-cue-start][data-cue-end]')].map(row => ({
                row, start: Number(row.dataset.cueStart), end: Number(row.dataset.cueEnd)
            })).filter(c => Number.isFinite(c.start) && Number.isFinite(c.end) && c.start >= 0 && c.end > c.start);
            this.rows.forEach(({row}) => {
                row.tabIndex = 0;
                row.title = 'Click or press Enter to seek here. Space plays or pauses.';
                row.setAttribute('aria-keyshortcuts', 'Enter Space');
            });
            this.text.classList.toggle('transcript-follow-ready', this.rows.length > 0);
            this.toolbar.hidden = this.rows.length === 0;
            this.pane.tabIndex = 0;
            this.pane.setAttribute('aria-label', 'Transcript. Scroll to browse while playback continues.');
            this.sync(true);
        }
        cancelAnimation() {
            if (this.programmatic) this.pane.scrollTo({top: this.pane.scrollTop, behavior: 'instant'});
            this.programmatic = false;
            clearTimeout(this.animationTimer);
        }
        clearAnimationSoon() {
            clearTimeout(this.animationTimer);
            this.animationTimer = setTimeout(() => { this.programmatic = false; }, 180);
        }
        interact(cancel = true) {
            if (cancel) this.cancelAnimation();
            this.until = performance.now() + this.delay;
            this.sync();
        }
        seekPassage(row) {
            const seconds = Number(row.dataset.cueStart);
            if (!Number.isFinite(seconds) || seconds < 0) return;
            // Preserve playback state: paused stays paused; playing continues.
            this.media.currentTime = seconds;
            this.explicitSeek();
        }
        explicitSeek() {
            this.until = 0;
            this.sync(true);
        }
        sync(force = false) {
            if (this.destroyed) return;
            clearTimeout(this.timer);
            const cue = this.media.ended ? null : this.rows?.find(c => c.start <= this.media.currentTime && this.media.currentTime < c.end);
            const row = cue?.row || null;
            const changed = row !== this.active;
            if (changed) {
                this.active?.classList.remove('transcript-active-cue');
                this.active?.removeAttribute('aria-current');
                this.active = row;
                row?.classList.add('transcript-active-cue');
                row?.setAttribute('aria-current', 'true');
            }
            const waiting = this.until > performance.now() || this.pointers.size > 0 || this.selected;
            const playing = !this.media.paused && !this.media.ended;
            if (this.enabled && playing && !waiting && this.active && (changed || force)) this.align();
            if (this.enabled && playing && !this.pointers.size && !this.selected && this.until > performance.now()) {
                this.timer = setTimeout(() => this.sync(true), Math.max(1, this.until - performance.now()));
            }
            this.toggle.textContent = `Follow playback: ${this.enabled ? 'On' : 'Off'}`;
            this.toggle.setAttribute('aria-pressed', String(this.enabled));
            this.returnButton.disabled = !this.active;
            const message = !this.rows?.length ? 'Timed following unavailable' :
                !this.enabled ? 'Free reading · following is off' : this.media.ended ? 'Recording finished' :
                !playing ? 'Paused · browse freely' : this.selected ? 'Reading selection · playback continues' :
                waiting ? `Browsing · returns after ${this.delay / 1000}s idle` :
                !this.active ? 'Following playback · between passages' : 'Following playback';
            if (this.status.textContent !== message) this.status.textContent = message;
        }
        align() {
            const top = this.pane.scrollTop + this.active.getBoundingClientRect().top -
                this.pane.getBoundingClientRect().top - this.pane.clientTop - 24;
            const bounded = Math.max(0, Math.min(top, this.pane.scrollHeight - this.pane.clientHeight));
            if (Math.abs(bounded - this.pane.scrollTop) < 2) return;
            this.programmatic = true;
            this.pane.scrollTo({top: bounded, behavior: this.motion.matches ? 'instant' : 'smooth'});
            this.clearAnimationSoon();
        }
        destroy() {
            this.destroyed = true;
            clearTimeout(this.timer);
            clearTimeout(this.animationTimer);
            this.resize.disconnect();
            this.listeners.forEach(remove => remove());
            this.toolbar.remove();
            this.text.classList.remove('transcript-follow-ready');
            this.text.style.removeProperty('--transcript-follow-bottom-space');
            this.active?.classList.remove('transcript-active-cue');
            this.active?.removeAttribute('aria-current');
        }
    }
    window.TranscriptFollow = TranscriptFollow;
})();
