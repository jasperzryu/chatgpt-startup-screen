// Auditable changes to the pinned MIT-licensed upstream animation engine.
// Keep its stages, controls, audio assets, effects and public settings API.
export function adaptRuntime(source, wordmark) {
  let text = source.replaceAll('\r\n', '\n');
  function change(before, after) {
    if (!text.includes(before)) throw new Error('Upstream adaptation anchor missing: ' + before.slice(0, 90));
    text = text.replace(before, after);
  }
  function block(start, end, replacement) {
    const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
    if (a < 0 || b < 0) throw new Error('Upstream block changed: ' + start);
    text = text.slice(0, a) + replacement + text.slice(b);
  }

  const wordmarkPath = wordmark.match(/d="([^"]+)"/)[1];
  change("  var ui = {}", `  function svgWordmark() {
    var ns = 'http://www.w3.org/2000/svg'
    var svg = document.createElementNS(ns, 'svg'), path = document.createElementNS(ns, 'path')
    svg.setAttribute('viewBox', '0 0 292 78')
    svg.setAttribute('aria-hidden', 'true')
    path.setAttribute('d', ${JSON.stringify(wordmarkPath)})
    path.setAttribute('fill', 'currentColor')
    svg.appendChild(path)
    return svg
  }
  var ui = {}`);
  change("    '<div class=\"dsu-stepcount\">", `    '<div class="oa-document"><span>PRIVATE SESSION</span><b>CG / 006</b><small>LOCAL WORKSPACE</small></div>' +
    '<div class="oa-ledger"><span>SESSION PROTOCOL</span><b>ACCESS CONTROL</b><i></i><small>PERSONAL / WINDOWS</small></div>' +
    '<div class="dsu-stepcount">`);
  change("    '<div class=\"dsu-center\">' +", `    '<div class="dsu-center">' +
      '<div class="oa-stage-label"></div>' +`);
  change("  ui.plate = q('.dsu-plate')", "  ui.stageLabel = q('.oa-stage-label')\n  ui.plate = q('.dsu-plate')");
  change("  ui.brand1.textContent = C.brand1", `  ui.brand1.textContent = C.brand1
  if (String(C.brand1).toLowerCase() === 'openai') {
    ui.brand1.textContent = ''
    ui.brand1.appendChild(svgWordmark())
    ui.brand1.setAttribute('aria-label', 'OpenAI')
  }`);
  change("    inner.appendChild(en)", `    if (String(C.orgEn).toLowerCase() === 'openai') { en.textContent = ''; en.appendChild(svgWordmark()) }
    inner.appendChild(en)`);
  change("    ui.w3.appendChild(el('span', 'dsu-w3label', 'O P E N A I  ·  C H A T G P T'))", "    ui.w3.appendChild(el('span', 'dsu-w3label', 'SESSION READY'))");
  change("    ui.meta1.textContent = 'REV 1.1.0 · WINDOWS'", "    ui.meta1.textContent = 'LOCAL / 1.1.0'");
  change("da.setAttribute('r', '7')", "da.setAttribute('r', '3.2')");
  change("db.setAttribute('r', '4')", "db.setAttribute('r', '2')");
  change("c.setAttribute('r', '2.8')", "c.setAttribute('r', '1.5')");
  change("  function ms(base) { return Math.round(base / C.speed) }", `  function ms(base) { return Math.round(base / C.speed) }
  function waitReal(duration) { return wait(duration * C.speed) }
  function audioEvent(kind, name, extra) {
    try { window.dispatchEvent(new CustomEvent('chatgpt-startup:audio', { detail: Object.assign({
      kind: kind, name: name, stage: root.dataset.stage || '0', time: performance.now()
    }, extra || {}) })) } catch (e) { /* telemetry must not affect playback */ }
  }`);
  change("      if (!C.sound && !force) return null", "      if (finished || (!C.sound && !force)) return null");
  change("        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume()", "        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume().catch(function () {})");
  change("    var buffers = {}", "    var activeVoice = []\n    var buffers = {}");
  change(".then(function (ab) { return ab ? ac().decodeAudioData(ab) : null })", ".then(function (ab) { var c = ac(); return ab && c ? c.decodeAudioData(ab) : null })");
  change(".then(function (ab) { if (!ab) return null; return ac(true).decodeAudioData(ab) })", ".then(function (ab) { var c = ac(true); return ab && c ? c.decodeAudioData(ab) : null })");
  block('    function playAssetAndWait(name, gain) {', '\n    function playAsset(name, gain)', `    function playAssetAndWait(name, gain, onStart, onEnd) {
      return new Promise(function (resolve) {
        var c = ac(true), buf = buffers[name]
        if (!c || !buf || finished) { resolve(0); return }
        var src, g, watchdog, settled = false, began = false
        function settle(cancelled) {
          if (settled) return
          settled = true
          clearTimeout(watchdog)
          var index = activeVoice.indexOf(cancel)
          if (index >= 0) activeVoice.splice(index, 1)
          if (onEnd) onEnd()
          if (began) audioEvent(cancelled ? 'cancel' : 'end', name)
          try { src.disconnect(); g.disconnect() } catch (e) {}
          resolve(cancelled ? 0 : Math.round(buf.duration * 1000))
        }
        function cancel() { try { src.stop() } catch (e) {}; settle(true) }
        try {
          src = c.createBufferSource(); src.buffer = buf
          g = c.createGain()
          g.gain.value = clamp01(gain == null ? 0.85 : gain, 0, 1) * clamp01(C.voiceVolume, 0, 1)
          src.connect(g); g.connect(c.destination)
          src.onended = function () { settle(false) }
          activeVoice.push(cancel)
          src.start()
          began = true
          if (onStart) onStart()
          audioEvent('start', name, { duration: Math.round(buf.duration * 1000), volume: g.gain.value, contextState: c.state })
          watchdog = setTimeout(function () { settle(true) }, Math.round(buf.duration * 1000) + 2000)
        } catch (e) { settle(true) }
      })
    }
`);
  change("      resume: function () { ac(); loadAsset('sfx-tick'); loadAsset('sfx-ticks-run') },", `      resume: function () { ac(true); loadAsset('sfx-tick'); loadAsset('sfx-ticks-run') },
      stop: function () {
        activeVoice.slice().forEach(function (cancel) { cancel() })
        if (ctx) { try { ctx.close().catch(function () {}) } catch (e) {}; ctx = null }
      },`);
  // Upstream declares confirm twice; the second declaration overrides its asset path.
  change("      confirm: function () { tone(660, 0.09, 'triangle', 0.07); tone(990, 0.17, 'triangle', 0.055, 0.085) },\n", '');
  block("          return audio.ensureAsset(asset).then(function (ok) {", "\n        }\n        return ttsLine(en, zh)", `          return audio.ensureAsset(asset).then(function (ok) {
            if (!ok || finished) return 0
            var startedAt = Date.now()
            if (C.voiceCue !== false) audio.cue()
            audioEvent('cue', asset, { lead: clamp01(C.voiceLead, 0, 1200) })
            return waitReal(clamp01(C.voiceLead, 0, 1200)).then(function () {
              if (finished) return 0
              return audio.playAssetAndWait(asset, 0.85,
                function () { saidOnce = true; setMeter(true) },
                function () { setMeter(false) })
            }).then(function (duration) { return duration > 0 ? Date.now() - startedAt : 0 })
          }).then(function (duration) {
            if (duration > 0 || finished) return duration
            return ttsLine(en, zh)
          })`);
  change("      stop: function () { try { if (supported) window.speechSynthesis.cancel() } catch (e) {} setMeter(false) }", "      stop: function () { audio.stop(); try { if (supported) window.speechSynthesis.cancel() } catch (e) {} setMeter(false) }");
  change("            if (i === last) {\n              u.onstart = function () { setMeter(true) }", "            u.onstart = function () { setMeter(true) }\n            if (i === last) {");
  change("        var n = i + 1", `        var n = i + 1
        root.dataset.stage = String(n)
        ui.stageLabel.textContent = ('0' + n).slice(-2) + ' / ' + step.badge
        try { window.dispatchEvent(new CustomEvent('chatgpt-startup:stage', { detail: { stage: n, time: performance.now() } })) } catch (e) {}`);
  change("typeIn(ui.statusZh, step.zh, 46)", "typeIn(ui.statusZh, step.zh, ms(24))");
  change("typeIn(ui.subEn, step.en, 13)", "typeIn(ui.subEn, step.en, ms(8))");
  change("typeIn(ui.subEn, step.en, ms(8))", "typeIn(ui.subEn, n === 5 ? 'READ COMPLETE / SESSION VERIFIED' : 'SESSION / ' + step.badge, ms(8))");
  change("    ui.btnEn.textContent = step.btnEn", "    ui.btnEn.textContent = 'ENTER'");
  change("        return wait(430)", "        return waitReal(Math.max(ms(430), C.sound ? 900 : 0))");
  change("return wait(Math.max(0, target - (spoken || 0)))", "return waitReal(Math.max(0, target - (spoken || 0)))");
  block("          return wait(520).then(function () { return waitAction() }).then(function () {", "\n        }\n        if (step.hex)", `          var acted = waitAction().then(function () {
            hideAction()
            audio.confirm()
            ui.caret.classList.remove('dsu-on')
          })
          return Promise.all([spoke, acted, wait(520)]).then(function () { return wait(320) })`);
  // Scale the tracing stroke to the official 267-unit geometry, rather than the old 50-unit whale.
  change("path.style.strokeWidth = '1.1'", "path.style.strokeWidth = '2.4'");
  change("{ duration: ms(1400), easing:", "{ duration: Math.max(ms(1400), 1050), easing:");
  change("}, ms(1450))", "}, Math.max(ms(1450), 1100))");
  change("    setStepCount(6, 'WELCOME')", `    root.dataset.stage = '6'
    try { window.dispatchEvent(new CustomEvent('chatgpt-startup:stage', { detail: { stage: 6, time: performance.now() } })) } catch (e) {}
    setStepCount(6, 'WELCOME')`);
  change("    audio.chime()", "    /* The original chime is tied to the final light sweep below. */");
  change("    var welcome = voice.line(null, null, 'line-6')", "    var welcome = Promise.resolve(0)");
  change("        ui.welcome.classList.add('dsu-in')\n        ui.idline.classList.remove('dsu-in')\n        return wait(420)", `        ui.welcome.classList.add('dsu-in')
        ui.idline.classList.remove('dsu-in')
        welcome = voice.line(null, null, 'line-6')
        return Promise.all([welcome, wait(720)])`);
  // Preserve RGB glitch on supporting text; leave official branding geometrically clean.
  change("var targets = [ui.w1, ui.w2, ui.w4]", "var targets = [ui.w1, ui.w4]");
  change("        root.classList.add('dsu-peak')", "        audio.chime()\n        root.classList.add('dsu-peak')");
  return text;
}
