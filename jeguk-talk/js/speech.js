/* 목소리: 말하기(TTS) · 듣기(STT)
   - 기본 목소리: 휴대폰에 깔린 기게음보다 인터넷(Google/Microsoft) 고품질 한국어 목소리를 먼저 고른다.
   - 인터넷 목소리가 안 나오면 자동으로 휴대폰 목소리로 이어서 말한다. */
(function (global) {
  'use strict';

  var synth = global.speechSynthesis || null;
  var voices = [];
  var token = 0;

  var DEFAULT_RATE = 0.92;
  var DEFAULT_PITCH = 1.02;

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

  /* 목소리 자연스러움 점수: 높을수록 사람 말에 가깝다 */
  function scoreVoice(v) {
    if (!v) return -999;
    var name = String(v.name || '');
    var low = name.toLowerCase();
    var lang = String(v.lang || '').toLowerCase();
    var score = 0;

    /* 인터넷으로 합성하는 목소리(Google/Microsoft Natural 등)가 보통 훨씬 자연스럽다 */
    if (v.localService === false) score += 50;
    else score -= 40;

    if (/natural|neural/.test(low)) score += 90;
    if (/wavenet|studio|premium|enhanced|improved|hd/.test(low)) score += 60;
    if (/online|network|cloud|internet/.test(low)) score += 40;
    if (/google/.test(low)) score += 30;
    if (/microsoft|azure|edge/.test(low)) score += 25;
    /* 이름이 알려진 자연스러운 한국어 목소리들 */
    if (/sunhi|injoon|yuna|seoyeon|hiujin|jiyoon|hyunsu|sora|minjun|gookmin|jimin/.test(low)) score += 45;
    if (/한국|korean/.test(low)) score += 5;

    /* 오래된 기계음 엔진 */
    if (/samsung/.test(low)) score -= 25;
    if (/compact|espeak|pico|flite|low quality|small/.test(low)) score -= 40;

    if (/^ko[-_]kr$/.test(lang)) score += 8;
    else if (lang.indexOf('ko') === 0) score += 3;

    return score;
  }

  function rankedVoices() {
    var ko = koreanVoices();
    var list = [];
    for (var i = 0; i < ko.length; i++) {
      list.push({ voice: ko[i], score: scoreVoice(ko[i]) });
    }
    list.sort(function (a, b) { return b.score - a.score; });
    return list;
  }

  function bestLocal(list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].voice.localService) return list[i].voice;
    }
    return null;
  }

  /* 고른 목소리(primary)와, 인터넷이 막혔을 때 이어받을 휴대폰 목소리(fallback)를 함께 돌려준다 */
  function pickVoices(uri) {
    var ko = koreanVoices();
    if (!ko.length) return { primary: null, fallback: null };

    if (uri) {
      for (var i = 0; i < ko.length; i++) {
        if (ko[i].voiceURI === uri || ko[i].name === uri) {
          return { primary: ko[i], fallback: bestLocal(rankedVoices()) };
        }
      }
      for (var j = 0; j < voices.length; j++) {
        if (voices[j].voiceURI === uri) {
          return { primary: voices[j], fallback: bestLocal(rankedVoices()) };
        }
      }
    }

    var list = rankedVoices();
    var primary = list[0] && list[0].score > 0 ? list[0].voice : null;
    var local = bestLocal(list);
    if (!primary) primary = local || (list[0] && list[0].voice) || null;
    var fallback = null;
    if (primary && primary.localService !== true && local &&
        !(local.voiceURI === primary.voiceURI && local.localService === primary.localService)) {
      fallback = local;
    }
    return { primary: primary, fallback: fallback };
  }

  /* 예전 이름 그대로 쓰는 곳이 있어도 되도록 */
  function pickVoice(uri) {
    return pickVoices(uri).primary;
  }

  /* ---------- 문장 나누기: 쉼표·마침표 자리에서 끊어 숨쉬듯 읽기 ---------- */
  function normalize(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/[\u200b-\u200f\ufeff]/g, '')
      /* 말로 읽으면 어색한 이모지·기호는 걷어 낸다 */
      .replace(/[\u2190-\u21ff\u2600-\u27bf\u2b00-\u2bff]/g, ' ')
      .replace(/[\ud83c-\ud83e][\udc00-\udfff]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n+\s*/g, ' ')
      .trim();
  }

  /* 한 문장이 너무 길 때만 쉼표 자리에서 나눈다 */
  function splitLong(s) {
    var parts = s.split(/([,、，·;:])\s*/);
    var pieces = [];
    var cur = '';
    for (var i = 0; i < parts.length; i += 2) {
      var seg = parts[i] || '';
      var sep = parts[i + 1] || '';
      if (!seg && !sep) continue;
      cur += seg + sep;
      if (cur.length >= 60) {
        if (cur.trim()) pieces.push(cur.trim());
        cur = '';
      }
    }
    if (cur.trim()) pieces.push(cur.trim());

    var out = [];
    for (var p = 0; p < pieces.length; p++) {
      var piece = pieces[p];
      var guard = 0;
      while (piece.length > 200 && guard++ < 20) {
        var cut = piece.lastIndexOf(' ', 190);
        if (cut < 100) cut = 190;
        out.push(piece.slice(0, cut).trim());
        piece = piece.slice(cut).trim();
      }
      if (piece) out.push(piece);
    }
    return out;
  }

  function splitText(text) {
    var clean = normalize(text);
    if (!clean) return [];

    var MAX = 150;
    var sentences = clean.match(/[^.!?。？！…]+(?:[.!?。？！…]+|$)/g) || [clean];
    var out = [];
    var buf = '';

    for (var i = 0; i < sentences.length; i++) {
      var s = sentences[i].trim();
      if (!s) continue;
      if (s.length > MAX) {
        if (buf) { out.push(buf); buf = ''; }
        var longs = splitLong(s);
        for (var k = 0; k < longs.length; k++) out.push(longs[k]);
        continue;
      }
      if (buf && (buf.length + 1 + s.length) > MAX) {
        out.push(buf);
        buf = s;
      } else {
        buf = buf ? buf + ' ' + s : s;
      }
    }
    if (buf) out.push(buf);
    return out;
  }

  /* ---------- 말하기 ---------- */
  function speak(text, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!synth) { resolve({ ok: false, reason: 'unsupported' }); return; }
      var chunks = splitText(text);
      if (!chunks.length) { resolve({ ok: false, reason: 'empty' }); return; }

      token++;
      var myToken = token;
      var picked = pickVoices(opts.voiceURI);
      var voice = picked.primary;
      var fallbackVoice = picked.fallback;
      var rate = typeof opts.rate === 'number' ? opts.rate : DEFAULT_RATE;
      var pitch = typeof opts.pitch === 'number' ? opts.pitch : DEFAULT_PITCH;
      var finished = false;
      var failedChunks = 0;

      try { synth.cancel(); } catch (e) { /* 무시 */ }

      var activeUtterances = [];
      global.__activeUtterances = activeUtterances;

      function done(reason) {
        if (finished) return;
        finished = true;
        if (reason === 'end' && opts.onEnd) opts.onEnd(reason);
        resolve({ ok: reason === 'end', reason: reason, voice: voice ? voice.name : '' });
      }

      function sayNext(idx, useVoice, alreadyRetried) {
        if (myToken !== token) { done('cancelled'); return; }
        if (idx >= chunks.length) { done(failedChunks >= chunks.length ? 'error' : 'end'); return; }
        /* 앞 문장 하나가 읽히면 그때 본 대기열은 비워 둔다 (크롬 메모리 참조 유지용) */
        var u = new SpeechSynthesisUtterance(chunks[idx]);
        u.lang = (useVoice && useVoice.lang) ? useVoice.lang : 'ko-KR';
        if (useVoice) u.voice = useVoice;
        u.rate = rate;
        u.pitch = pitch;
        u.volume = 1;
        u.onstart = function () {
          if (myToken !== token) return;
          if (opts.onStart) opts.onStart();
        };
        u.onend = function () {
          if (myToken !== token) return;
          sayNext(idx + 1, voice, false);
        };
        u.onerror = function (ev) {
          if (myToken !== token) return;
          var err = (ev && ev.error) || 'error';
          if (err === 'interrupted' || err === 'canceled') { done('cancelled'); return; }
          if (err === 'not-allowed') { failedChunks = chunks.length; done('blocked'); return; }
          /* 인터넷 목소리가 막히면(오프라인 등) 같은 문장을 휴대폰 목소리로 한 번 더 */
          if (!alreadyRetried && fallbackVoice && useVoice !== fallbackVoice) {
            sayNext(idx, fallbackVoice, true);
            return;
          }
          /* 그래도 안 되면 다음 문장은 이어서 시도 */
          failedChunks++;
          sayNext(idx + 1, useVoice, false);
        };
        /* 크롬에서 긴 문장이 끊기는 문제 방지: 참조 유지 */
        activeUtterances.push(u);
        if (activeUtterances.length > 30) activeUtterances.shift();
        try {
          synth.speak(u);
        } catch (e) {
          sayNext(idx + 1, useVoice, alreadyRetried);
        }
      }

      /* 크롬: 일시정지 상태로 남는 경우 풀어 주기 */
      try { if (synth.paused) synth.resume(); } catch (e) {}

      sayNext(0, voice, false);

      /* 안전장치: 발화가 끝나지 않고 멈춘 경우 */
      var guard = 0;
      var guardTimer = setInterval(function () {
        guard++;
        if (finished) { clearInterval(guardTimer); return; }
        if (myToken !== token) { clearInterval(guardTimer); done('cancelled'); return; }
        if (guard === 4) { try { if (synth.paused) synth.resume(); } catch (e) {} }
        if (guard > 60) { clearInterval(guardTimer); done('timeout'); }
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
    DEFAULT_RATE: DEFAULT_RATE,
    DEFAULT_PITCH: DEFAULT_PITCH,
    speak: speak,
    stop: stop,
    isSpeaking: isSpeaking,
    listen: listen,
    koreanVoices: koreanVoices,
    rankedVoices: rankedVoices,
    scoreVoice: scoreVoice,
    pickVoice: pickVoice,
    pickVoices: pickVoices,
    refreshVoices: refreshVoices,
    ttsSupported: ttsSupported,
    sttSupported: sttSupported,
    requestMic: requestMic,
    splitText: splitText
  };
})(window);
