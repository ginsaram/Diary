/* 목소리: 말하기(TTS) · 듣기(STT) */
(function (global) {
  'use strict';

  var synth = global.speechSynthesis || null;
  var voices = [];
  var token = 0;

  function refreshVoices() {
    if (!synth) return [];
    try { voices = synth.getVoices() || []; } catch (e) { voices = []; }
    return voices;
  }

  function isKorean(v) {
    var lang = (v.lang || '').toLowerCase();
    var name = (v.name || '').toLowerCase();
    return lang.indexOf('ko') === 0 || name.indexOf('korean') >= 0 || name.indexOf('한국') >= 0;
  }

  function koreanVoices() {
    if (!voices.length) refreshVoices();
    return voices.filter(isKorean);
  }

  function pickVoice(uri) {
    var ko = koreanVoices();
    if (!ko.length) return null;
    if (uri) {
      for (var i = 0; i < ko.length; i++) {
        if (ko[i].voiceURI === uri || ko[i].name === uri) return ko[i];
      }
      for (var j = 0; j < voices.length; j++) {
        if (voices[j].voiceURI === uri) return voices[j];
      }
    }
    /* 기기에 들어 있는 목소리를 먼저 (인터넷 없이도 말이 나오도록) */
    for (var a = 0; a < ko.length; a++) {
      if (ko[a].localService) return ko[a];
    }
    return ko[0];
  }

  function splitText(text) {
    var clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    var parts = clean.match(/[^.!?。？！…]+[.!?。？！…]*/g) || [clean];
    var out = [];
    var buf = '';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      if ((buf + ' ' + p).length > 120 && buf) {
        out.push(buf);
        buf = p;
      } else {
        buf = buf ? buf + ' ' + p : p;
      }
    }
    if (buf) out.push(buf);
    return out;
  }

  function speak(text, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!synth) { resolve({ ok: false, reason: 'unsupported' }); return; }
      var chunks = splitText(text);
      if (!chunks.length) { resolve({ ok: false, reason: 'empty' }); return; }

      token++;
      var myToken = token;
      var voice = pickVoice(opts.voiceURI);
      var rate = typeof opts.rate === 'number' ? opts.rate : 0.85;
      var pitch = typeof opts.pitch === 'number' ? opts.pitch : 1.0;
      var finished = false;

      try { synth.cancel(); } catch (e) { /* 무시 */ }

      var activeUtterances = [];
      global.__activeUtterances = activeUtterances;

      function done(reason) {
        if (finished) return;
        finished = true;
        if (reason === 'end' && opts.onEnd) opts.onEnd(reason);
        resolve({ ok: reason === 'end', reason: reason });
      }

      function sayNext(idx) {
        if (myToken !== token) { done('cancelled'); return; }
        if (idx >= chunks.length) { done('end'); return; }
        var u = new SpeechSynthesisUtterance(chunks[idx]);
        u.lang = 'ko-KR';
        if (voice) u.voice = voice;
        u.rate = rate;
        u.pitch = pitch;
        u.volume = 1;
        u.onstart = function () {
          if (myToken !== token) return;
          if (opts.onStart) opts.onStart();
        };
        u.onend = function () {
          if (myToken !== token) return;
          sayNext(idx + 1);
        };
        u.onerror = function (ev) {
          if (myToken !== token) return;
          var err = (ev && ev.error) || 'error';
          if (err === 'interrupted' || err === 'canceled') { done('cancelled'); return; }
          /* 목소리 오류가 나도 다음 문장은 이어서 시도 */
          sayNext(idx + 1);
        };
        /* 크롬에서 긴 문장이 끊기는 문제 방지: 참조 유지 */
        activeUtterances.push(u);
        if (activeUtterances.length > 30) activeUtterances.shift();
        try {
          synth.speak(u);
        } catch (e) {
          sayNext(idx + 1);
        }
      }

      /* 크롬: 일시정지 상태로 남는 경우 풀어 주기 */
      try { if (synth.paused) synth.resume(); } catch (e) {}

      sayNext(0);

      /* 안전장치: 발화가 끝나지 않고 멈춘 경우 */
      var guard = 0;
      var guardTimer = setInterval(function () {
        guard++;
        if (finished) { clearInterval(guardTimer); return; }
        if (myToken !== token) { clearInterval(guardTimer); done('cancelled'); return; }
        if (guard === 4) { try { if (synth.paused) synth.resume(); } catch (e) {} }
        if (guard > 40) { clearInterval(guardTimer); done('timeout'); }
      }, 500);
    });
  }

  function stop() {
    token++;
    if (synth) { try { synth.cancel(); } catch (e) {} }
  }

  function isSpeaking() {
    if (!synth) return false;
    try { return synth.speaking; } catch (e) { return false; }
  }

  function ttsSupported() {
    return !!(synth && typeof global.SpeechSynthesisUtterance !== 'undefined');
  }

  function sttSupported() {
    return !!(global.SpeechRecognition || global.webkitSpeechRecognition);
  }

  function requestMic() {
    if (!global.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.resolve(false);
    }
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      try {
        stream.getTracks().forEach(function (t) { t.stop(); });
      } catch (e) {}
      return true;
    }).catch(function () { return false; });
  }

  /* 듣기 */
  function listen(opts) {
    opts = opts || {};
    var SR = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!SR) {
      if (opts.onError) opts.onError('unsupported');
      return null;
    }
    var rec = new SR();
    var finalText = '';
    var stopped = false;
    var silenceTimer = null;

    rec.lang = 'ko-KR';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    function cleanup() {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
    }

    rec.onstart = function () {
      if (opts.onStart) opts.onStart();
      silenceTimer = setTimeout(function () {
        /* 말이 없으면 조용히 마무리 */
        try { rec.stop(); } catch (e) {}
      }, 9000);
    };

    rec.onresult = function (ev) {
      var interim = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (opts.onPartial) opts.onPartial((finalText + ' ' + interim).trim());
    };

    rec.onerror = function (ev) {
      var err = (ev && ev.error) || 'error';
      if (err === 'aborted' || err === 'no-speech') {
        if (opts.onError) opts.onError(err);
        return;
      }
      if (opts.onError) opts.onError(err);
    };

    rec.onend = function () {
      cleanup();
      if (stopped) return;
      var text = finalText.trim();
      if (opts.onEnd) opts.onEnd(text);
    };

    try {
      rec.start();
    } catch (e) {
      if (opts.onError) opts.onError('start-failed');
      return null;
    }

    return {
      stop: function () {
        stopped = true;
        cleanup();
        try { rec.stop(); } catch (e) {}
      },
      abort: function () {
        stopped = true;
        cleanup();
        try { rec.abort(); } catch (e) {}
      },
      hasText: function () { return !!finalText.trim(); },
      text: function () { return finalText.trim(); }
    };
  }

  if (synth) {
    try {
      refreshVoices();
      if (typeof synth.onvoiceschanged !== 'undefined') {
        synth.onvoiceschanged = function () { refreshVoices(); };
      }
    } catch (e) {}
  }

  global.JSpeech = {
    speak: speak,
    stop: stop,
    isSpeaking: isSpeaking,
    listen: listen,
    koreanVoices: koreanVoices,
    refreshVoices: refreshVoices,
    ttsSupported: ttsSupported,
    sttSupported: sttSupported,
    requestMic: requestMic,
    splitText: splitText
  };
})(window);
