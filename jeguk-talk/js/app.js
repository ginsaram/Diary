/* 앱 동작: 화면 · 음성 · 날씨 · 인사 스케줄 */
(function (global) {
  'use strict';

  var S = global.JStore.getSettings();
  var engine = global.JEngine.create();
  var weather = null;
  var started = false;
  var listening = null;
  var lastSpoken = '';
  var micGranted = false;
  var wakeLockObj = null;
  var weatherTimer = null;
  var speakTimer = null;
  var greetCheckTimer = null;
  var openSheetAt = 0;

  var els = {};

  function $(id) { return document.getElementById(id); }

  function boot() {
    els = {
      app: $('app'),
      clock: $('clock'),
      dateLine: $('dateLine'),
      weatherEmoji: $('weatherEmoji'),
      weatherTemp: $('weatherTemp'),
      weatherDesc: $('weatherDesc'),
      weatherChip: $('weatherChip'),
      gear: $('gearBtn'),
      buddy: $('buddy'),
      caption: $('caption'),
      hint: $('hint'),
      quickRow: $('quickRow'),
      micBtn: $('micBtn'),
      talkBtn: $('talkBtn'),
      periodRow: $('periodRow'),
      startOverlay: $('startOverlay'),
      startBtn: $('startBtn'),
      sheet: $('sheet'),
      sheetClose: $('sheetClose'),
      toast: $('toast')
    };

    tickClock();
    setInterval(tickClock, 15000);

    loadWeather();
    weatherTimer = setInterval(loadWeather, 30 * 60 * 1000);

    bindMain();
    bindSettings();
    fillVoices();

    /* 가족용: 주소 끝에 #family 를 붙이면 바로 설정이 열린다 (북마크용) */
    function openFamilySheet() {
      started = true;
      els.startOverlay.hidden = true;
      openSheet();
    }
    function isFamilyHash() {
      return location.hash === '#family' || location.hash === '#\uC124\uC815';
    }
    if (isFamilyHash()) setTimeout(openFamilySheet, 300);
    window.addEventListener('hashchange', function () {
      if (isFamilyHash()) openFamilySheet();
    });

    if (!JSpeech.ttsSupported()) {
      setHint('이 브라우저는 목소리 읽기를 지원하지 않아요. 화면 글씨로 이야기할게요.', true);
    }

    setTimeout(fillVoices, 1200);
    setTimeout(fillVoices, 3500);

    registerServiceWorker();

    greetCheckTimer = setInterval(checkSchedule, 20000);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        tickClock();
        checkSchedule();
        if (S.wakeLock) requestWakeLock();
      }
    });

    window.__jeguk = {
      ready: true,
      get state() {
        return {
          started: started,
          weather: weather,
          settings: S,
          listening: !!listening,
          lastSpoken: lastSpoken,
          engineTopics: engine.topics,
          voice: (function () {
            var p = JSpeech.pickVoices(S.voiceURI).primary;
            return p ? { name: p.name, local: !!p.localService, uri: p.voiceURI } : null;
          })(),
          ttsEngine: aiTtsEnabled() ? 'openai:' + (S.ttsVoice || 'nova') : 'browser'
        };
      },
      engine: engine,
      speak: speakText,
      respond: handleUser,
      greet: greet
    };
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    try {
      navigator.serviceWorker.register('sw.js').then(function () {
        updateSwNote();
      }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- 시계 ---------- */
  var DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  function tickClock() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h < 12 ? '오전' : '오후';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    var mm = m < 10 ? '0' + m : String(m);
    els.clock.textContent = ampm + ' ' + h12 + ':' + mm;
    els.dateLine.textContent = (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + DAYS[d.getDay()];
  }

  /* ---------- 날씨 ---------- */
  function loadWeather() {
    return JWeather.fetchWeather(S.lat, S.lon).then(function (w) {
      weather = w;
      JStore.setCachedWeather(w);
      renderWeather(w);
      return w;
    }).catch(function () {
      var cached = JStore.getCachedWeather();
      if (cached) {
        weather = cached;
        renderWeather(cached, true);
      } else {
        els.weatherDesc.textContent = '날씨 확인 안 됨';
        els.weatherTemp.textContent = '';
      }
      return null;
    });
  }

  function renderWeather(w, stale) {
    if (!w) return;
    els.weatherEmoji.textContent = w.emoji || '🌤';
    els.weatherTemp.textContent = (w.temp === null || w.temp === undefined) ? '' : w.temp + '°';
    var desc = w.desc || '';
    if (w.tmin !== null && w.tmax !== null && w.tmin !== undefined && w.tmax !== undefined) {
      desc += ' ' + w.tmin + '~' + w.tmax + '°';
    }
    els.weatherDesc.textContent = desc;
    els.weatherChip.title = (w.todayDesc || w.desc) + (stale ? ' (저장된 날씨)' : '');
  }

  /* ---------- 말하기 ---------- */
  function setCaption(text) {
    els.caption.textContent = text;
    els.caption.scrollTop = 0;
  }

  function setHint(text, warn) {
    els.hint.textContent = text || '';
    els.hint.className = 'hint' + (warn ? ' warn' : '');
  }

  var speakSeq = 0;

  function speakLocal(text) {
    return JSpeech.speak(text, {
      rate: S.rate,
      pitch: S.pitch,
      voiceURI: S.voiceURI
    });
  }

  function isSpeakingNow() {
    return JSpeech.isSpeaking() || !!aiAudio;
  }

  function stopVoice() {
    stopAiAudio();
    JSpeech.stop();
  }

  function speakText(text, opts) {
    opts = opts || {};
    speakSeq++;
    var mySeq = speakSeq;
    lastSpoken = text;
    setCaption(text);
    JStore.addHistory('app', text);
    els.buddy.classList.add('speaking');
    els.buddy.classList.remove('listening');
    setHint('');

    var work;
    if (aiTtsEnabled()) {
      work = aiSpeak(text).then(function (r) {
        if (r.ok || mySeq !== speakSeq) return r;
        /* 키·인터넷 문제면 휴대폰 목소리로 이어서 읽는다 */
        return speakLocal(text);
      });
    } else {
      work = speakLocal(text);
    }

    return work.then(function (r) {
      if (mySeq !== speakSeq) return r;
      els.buddy.classList.remove('speaking');
      if (!r.ok && r.reason === 'unsupported') {
        setHint('목소리가 나오지 않는 브라우저예요. 글씨로 읽어 주세요.', true);
      }
      if (r.ok && opts.afterSpeak) opts.afterSpeak();
      return r;
    });
  }

  /* ---------- OpenAI 목소리 (선택 · 키가 있을 때만) ---------- */
  var aiAudio = null;
  var aiAudioUrl = '';
  var aiStop = null;

  function aiTtsEnabled() {
    if (S.ttsEngine !== 'openai') return false;
    if (!S.apiKey) return false;
    return S.provider === 'openai' || /^sk-/.test(S.apiKey);
  }

  function stopAiAudio() {
    if (aiStop) {
      try { aiStop(); } catch (e) {}
      aiStop = null;
    }
    if (aiAudio) {
      try { aiAudio.pause(); } catch (e) {}
      aiAudio = null;
    }
    if (aiAudioUrl) {
      try { URL.revokeObjectURL(aiAudioUrl); } catch (e) {}
      aiAudioUrl = '';
    }
  }

  function aiSpeak(text) {
    return new Promise(function (resolve) {
      var plain = JSpeech.splitText(text).join(' ');
      var body = {
        model: 'tts-1',
        voice: S.ttsVoice || 'nova',
        input: plain.slice(0, 900) || ' ',
        response_format: 'mp3',
        speed: Math.max(0.5, Math.min(1.5, Number(S.rate) || 0.92))
      };
      fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + S.apiKey
        },
        body: JSON.stringify(body)
      }).then(function (res) {
        if (!res.ok) throw new Error('TTS HTTP ' + res.status);
        return res.blob();
      }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = new Audio();
        aiAudio = a;
        aiAudioUrl = url;
        var settled = false;
        function finish(ok, reason) {
          if (settled) return;
          settled = true;
          if (aiStop === stopper) aiStop = null;
          if (aiAudio === a) aiAudio = null;
          try { URL.revokeObjectURL(url); } catch (e) {}
          if (aiAudioUrl === url) aiAudioUrl = '';
          resolve({ ok: ok, reason: reason, voice: 'openai:' + (S.ttsVoice || 'nova') });
        }
        var stopper = function () { finish(false, 'cancelled'); };
        aiStop = stopper;
        a.onended = function () { finish(true, 'end'); };
        a.onerror = function () { finish(false, 'audio-error'); };
        a.src = url;
        var p = a.play();
        if (p && p.catch) p.catch(function () { finish(false, 'play-blocked'); });
      }).catch(function () { resolve({ ok: false, reason: 'tts-failed' }); });
    }).catch(function () { return { ok: false, reason: 'tts-failed' }; });
  }

  /* ---------- 듣기 ---------- */
  function startListening() {
    if (listening) { stopListening(true); return; }
    if (!JSpeech.sttSupported()) {
      setHint('이 휴대폰에서는 마이크 듣기가 안 돼요. 아래 버튼으로 대답해 주세요.', true);
      return;
    }
    stopVoice();
    clearTimeout(speakTimer);
    els.buddy.classList.remove('speaking');
    els.buddy.classList.add('listening');
    els.micBtn.classList.add('listening');
    els.micBtn.querySelector('.lbl').textContent = '듣고 있어요…';
    setHint('말씀하세요. 제가 듣고 있어요.');

    var got = '';
    listening = JSpeech.listen({
      onStart: function () { micGranted = true; },
      onPartial: function (t) {
        got = t;
        if (t) setHint('듣는 중: ' + t);
      },
      onError: function (err) {
        els.buddy.classList.remove('listening');
        els.micBtn.classList.remove('listening');
        els.micBtn.querySelector('.lbl').textContent = '눌러서 대답하기';
        listening = null;
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          micGranted = false;
          setHint('마이크 사용을 허락해 주셔야 들을 수 있어요. 아래 버튼으로도 대답하실 수 있어요.', true);
        } else if (err === 'no-speech') {
          setHint('잘 못 들었어요. 다시 한 번 말씀해 주시거나 아래 버튼을 눌러 주세요.');
        } else if (err === 'unsupported') {
          setHint('이 휴대폰은 마이크 듣기를 지원하지 않아요. 아래 버튼으로 대답해 주세요.', true);
        } else if (err !== 'aborted') {
          setHint('잘 못 들었어요. 다시 한 번 말씀해 주세요.');
        }
      },
      onEnd: function (text) {
        els.buddy.classList.remove('listening');
        els.micBtn.classList.remove('listening');
        els.micBtn.querySelector('.lbl').textContent = '눌러서 대답하기';
        listening = null;
        var said = (text || got || '').trim();
        if (said) {
          handleUser(said);
        } else if (!els.hint.textContent) {
          setHint('잘 못 들었어요. 다시 한 번 말씀해 주시거나 아래 버튼을 눌러 주세요.');
        }
      }
    });
    if (!listening) {
      els.buddy.classList.remove('listening');
      els.micBtn.classList.remove('listening');
      els.micBtn.querySelector('.lbl').textContent = '눌러서 대답하기';
    }
  }

  function stopListening(silent) {
    if (listening) {
      try { listening.stop(); } catch (e) {}
      listening = null;
    }
    els.buddy.classList.remove('listening');
    els.micBtn.classList.remove('listening');
    els.micBtn.querySelector('.lbl').textContent = '눌러서 대답하기';
    if (!silent) setHint('');
  }

  /* ---------- 대화 ---------- */
  function handleUser(text) {
    var clean = String(text || '').trim();
    if (!clean) return;

    if (clean === '다시 말해줘' || clean === '다시말해줘') {
      JStore.addHistory('user', clean);
      if (lastSpoken) {
        speakText(lastSpoken, { afterSpeak: autoListenAfterSpeak });
      } else {
        greet(JEngine.periodOf(new Date()));
      }
      return;
    }

    JStore.addHistory('user', clean);
    setHint('아버님: ' + clean);

    respondTo(clean);
  }

  function respondTo(text) {
    var ctx = { name: S.name, weather: weather, now: new Date() };

    if (S.provider !== 'none' && S.apiKey) {
      aiReply(text, ctx).then(function (reply) {
        if (reply) finishReply(reply, ctx, false);
        else localReply(text, ctx);
      }).catch(function () {
        localReply(text, ctx);
      });
      return;
    }
    localReply(text, ctx);
  }

  function localReply(text, ctx) {
    var r = engine.reply(text, ctx);
    finishReply(r.text, ctx, r.end === true);
  }

  function finishReply(text, ctx, end) {
    speakText(text, {
      afterSpeak: function () {
        if (end) {
          setHint('편히 주무세요.');
          return;
        }
        autoListenAfterSpeak();
      }
    });
  }

  function autoListenAfterSpeak() {
    if (!S.autoListen) {
      setHint('아래 버튼을 눌러 대답하실 수 있어요.');
      return;
    }
    if (!JSpeech.sttSupported()) return;
    if (document.hidden) return;
    speakTimer = setTimeout(function () {
      if (!isSpeakingNow()) startListening();
    }, 700);
  }

  /* ---------- 인사 ---------- */
  function greet(period, opts) {
    opts = opts || {};
    var ctx = { name: S.name, weather: weather, now: new Date() };
    var p = period || JEngine.periodOf(new Date());
    var text = engine.greeting(p, weather, ctx);
    speakText(text, {
      afterSpeak: function () {
        if (opts.noListen) return;
        autoListenAfterSpeak();
      }
    });
    return text;
  }

  function talk() {
    var p = JEngine.periodOf(new Date());
    if (!started) { startSession(); return; }
    /* 이미 인사를 했으면 짧게 새 이야기를 건넨다 */
    var prompts = [
      S.name + ', 지금 뭐 하고 계신가?',
      S.name + ', 오늘 몸은 좀 어떠신가?',
      S.name + ', 심심하지 않으신가? 내가 이야기 좀 해 드릴까?',
      S.name + ', 창밖 좀 보셨는가? 오늘 하늘이 어떤가?',
      S.name + ', 물 한 잔 드실 시간이여. 목 마르지 않으신가?',
      S.name + ', 오늘 제일 기분 좋았던 일은 뭐였능가?',
      S.name + ', 옛날 이야기 하나 들려주실 텐가? 내가 잘 들어 드릴게.',
      S.name + ', 잠깐 앉아서 같이 쉬어유. 오늘 하루 어땠는가?'
    ];
    var text = prompts[Math.floor(Math.random() * prompts.length)];
    if (text === lastSpoken) text = prompts[(Math.floor(Math.random() * prompts.length) + 1) % prompts.length];
    speakText(text, { afterSpeak: autoListenAfterSpeak });
  }

  /* ---------- 아침 인사 스케줄 ---------- */
  function checkSchedule() {
    if (!started || !S.autoGreet) return;
    if (els.sheet && !els.sheet.hidden) return;
    if (Date.now() - openSheetAt < 60000) return;
    var now = new Date();
    var today = JStore.todayKey(now);
    if (JStore.getGreetedDate() === today) return;

    var parts = String(S.greetTime || '06:00').split(':');
    var gh = parseInt(parts[0], 10);
    var gm = parseInt(parts[1], 10);
    if (isNaN(gh)) gh = 6;
    if (isNaN(gm)) gm = 0;

    var target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), gh, gm, 0, 0);
    if (now < target) return;

    /* 인사 시각을 많이 지났으면 지금 시간대에 맞춰 인사 */
    var lateMin = (now - target) / 60000;
    var period = lateMin <= 150 ? 'morning' : JEngine.periodOf(now);
    JStore.setGreetedDate(today);
    greet(period);
  }

  /* ---------- 화면 켜 두기 ---------- */
  function requestWakeLock() {
    if (!S.wakeLock) return;
    if (!('wakeLock' in navigator)) return;
    if (wakeLockObj) return;
    try {
      navigator.wakeLock.request('screen').then(function (lock) {
        wakeLockObj = lock;
        lock.addEventListener('release', function () { wakeLockObj = null; });
      }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- 시작 ---------- */
  function startSession() {
    started = true;
    els.startOverlay.hidden = true;

    JSpeech.refreshVoices();
    fillVoices();

    JSpeech.requestMic().then(function (ok) {
      micGranted = ok;
      if (!ok && JSpeech.sttSupported()) {
        setHint('마이크를 허락하지 않으셨어도, 아래 버튼으로 대답하실 수 있어요.');
      }
    });

    requestWakeLock();

    var p = JEngine.periodOf(new Date());
    /* 시작 인사: 아침 시각을 지났고 아직 인사 전이면 아침 인사 */
    var now = new Date();
    var today = JStore.todayKey(now);
    var parts = String(S.greetTime || '06:00').split(':');
    var gh = parseInt(parts[0], 10);
    var gm = parseInt(parts[1], 10);
    if (isNaN(gh)) gh = 6;
    if (isNaN(gm)) gm = 0;
    var target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), gh, gm, 0, 0);
    if (S.autoGreet && JStore.getGreetedDate() !== today && now >= target && (now - target) / 60000 <= 150) {
      p = 'morning';
    }
    /* 앱을 열어 인사를 드렸으면 오늘 인사는 마친 것으로 본다 (6시 전에 열었을 때는 6시 인사를 남겨 둔다) */
    if (now >= target) JStore.setGreetedDate(today);
    greet(p);
  }

  /* ---------- 버튼 ---------- */
  function bindMain() {
    els.startBtn.addEventListener('click', function () {
      /* 이 클릭 안에서 말을 시작해야 휴대폰이 소리를 허락한다 */
      startSession();
    });

    els.micBtn.addEventListener('click', function () {
      if (!started) { startSession(); return; }
      if (isSpeakingNow()) stopVoice();
      startListening();
    });

    els.talkBtn.addEventListener('click', talk);

    els.quickRow.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-say]') : null;
      if (!btn) return;
      handleUser(btn.getAttribute('data-say'));
    });

    els.periodRow.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-period]') : null;
      if (!btn) return;
      if (!started) { startSession(); return; }
      stopVoice();
      greet(btn.getAttribute('data-period'));
    });

    bindGear();
  }

  function bindGear() {
    var timer = null;
    var armed = false;

    function cancel() {
      if (timer) { clearTimeout(timer); timer = null; }
      armed = false;
      els.gear.classList.remove('arming');
    }

    els.gear.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      els.gear.classList.add('arming');
      timer = setTimeout(function () {
        timer = null;
        armed = true;
        els.gear.classList.remove('arming');
        openSheetAt = Date.now();
        openSheet();
      }, 1800);
    });
    els.gear.addEventListener('pointerup', cancel);
    els.gear.addEventListener('pointerleave', cancel);
    els.gear.addEventListener('pointercancel', cancel);
    els.gear.addEventListener('click', function (ev) {
      ev.preventDefault();
      if (armed || Date.now() - openSheetAt < 800) { armed = false; return; }
      toast('가족 설정은 톱니바퀴를 2초쯤 길게 눌러 주세요.');
    });
    els.gear.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  }

  /* ---------- 설정 ---------- */
  function openSheet() {
    stopVoice();
    els.buddy.classList.remove('speaking');
    fillSettingsForm();
    els.sheet.hidden = false;
    els.sheet.scrollTop = 0;
    updateHistSummary();
  }

  function closeSheet() {
    els.sheet.hidden = true;
    if (!started) els.startOverlay.hidden = false;
    /* #family 로 열었을 때는 주소에서 빼 두어, 다시 열어도 설정이 먼저 뜨지 않게 */
    if (location.hash === '#family' || location.hash === '#\uC124\uC815') {
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch (e) {}
    }
  }

  function fillSettingsForm() {
    $('setName').value = S.name;
    $('setAutoGreet').checked = !!S.autoGreet;
    $('setGreetTime').value = S.greetTime || '06:00';
    $('setRate').value = S.rate;
    $('rateVal').textContent = Number(S.rate).toFixed(2);
    $('setAutoListen').checked = !!S.autoListen;
    $('setWakeLock').checked = !!S.wakeLock;
    $('setProvider').value = S.provider || 'none';
    $('setApiKey').value = S.apiKey || '';
    $('setModel').value = S.model || '';
    $('locNow').textContent = '지역: ' + (S.locName || '설정 안 됨') + ' (' + Number(S.lat).toFixed(3) + ', ' + Number(S.lon).toFixed(3) + ')';
    $('locResults').innerHTML = '';
    var eng = $('setTtsEngine');
    if (eng) eng.value = S.ttsEngine === 'openai' ? 'openai' : 'browser';
    var tv = $('setTtsVoice');
    if (tv) tv.value = S.ttsVoice || 'nova';
    updateTtsNote();
    fillVoices();
    updateSwNote();
  }

  function updateTtsNote() {
    var el = $('ttsNote');
    if (!el) return;
    if (aiTtsEnabled()) {
      el.textContent = '지금은 OpenAI 목소리(' + (S.ttsVoice || 'nova') + ')로 읽습니다. 인터넷이나 키에 문제가 생기면 자동으로 휴대폰 목소리로 돌아갑니다.';
    } else if (S.ttsEngine === 'openai') {
      el.textContent = 'OpenAI 키가 아직 없어서 지금은 휴대폰 목소리로 읽습니다. 위에 키를 넣으면 OpenAI 목소리를 씁니다.';
    } else {
      el.textContent = '지금은 위에서 고른 휴대폰 목소리로 읽습니다. OpenAI 키를 넣고 방식을 바꾸면 더 자연스러운 목소리로 읽어 줄 수 있어요.';
    }
  }

  function updateSwNote() {
    var el = $('swNote');
    if (!el) return;
    if ('serviceWorker' in navigator) {
      el.textContent = '이 앱은 한 번 열어 두면 인터넷이 잠깐 끊겨도 열려요.';
    } else {
      el.textContent = '';
    }
  }

  function save() {
    JStore.saveSettings(S);
  }

  function fillVoices() {
    var sel = $('setVoice');
    if (!sel) return;
    JSpeech.refreshVoices();
    var list = JSpeech.koreanVoices();
    var current = S.voiceURI || '';
    var auto = JSpeech.pickVoices('');
    var autoVoice = auto.primary;
    var html = '<option value="">자동 (가장 자연스러운 목소리)</option>';
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      var label = v.name;
      if (v.localService === false) label += ' (인터넷 목소리)';
      if (autoVoice && v.voiceURI === autoVoice.voiceURI) label = '⭐ ' + label;
      html += '<option value="' + escapeAttr(v.voiceURI) + '">' + escapeHtml(label) + '</option>';
    }
    sel.innerHTML = html;
    sel.value = current;
    if (sel.value !== current) sel.value = '';

    var note = $('voiceAutoNote');
    if (note) {
      if (!list.length) {
        note.textContent = '이 휴대폰에서 한국어 목소리를 찾지 못했어요. 휴대폰 설정에서 Google 음성 합성의 한국어 음성을 설치하면 목소리가 좋아져요.';
      } else if (autoVoice) {
        note.textContent = '자동으로 고른 목소리: ' + autoVoice.name +
          (autoVoice.localService === false ? ' (인터넷 목소리 · 가장 자연스러움)' : ' (휴대폰 목소리)');
      } else {
        note.textContent = '';
      }
    }
    renderVoiceDiag();
  }

  function renderVoiceDiag() {
    var box = $('voiceDiag');
    if (!box) return;
    var list = JSpeech.rankedVoices();
    if (!list.length) { box.innerHTML = ''; return; }
    var auto = JSpeech.pickVoices('');
    var html = '<div class="vdhead">이 휴대폰의 한국어 목소리 ' + list.length + '개</div>';
    for (var i = 0; i < list.length && i < 8; i++) {
      var v = list[i].voice;
      var star = (auto.primary && v.voiceURI === auto.primary.voiceURI) ? '⭐ ' : '· ';
      html += '<div class="vdline">' + star + escapeHtml(v.name) +
        ' <span class="vmeta">(' + (v.localService ? '휴대폰' : '인터넷') + ')</span></div>';
    }
    box.innerHTML = html;
  }

  /* 목소리 미리 듣기: 저장하지 않고 지금 고른 목소리로 한 마디 */
  var audSeq = 0;

  function audition(text, uri) {
    audSeq++;
    var my = audSeq;
    stopVoice();
    speakSeq++;
    els.buddy.classList.add('speaking');
    return JSpeech.speak(text, {
      rate: S.rate,
      pitch: S.pitch,
      voiceURI: uri || ''
    }).then(function (r) {
      if (my === audSeq) els.buddy.classList.remove('speaking');
      return r;
    });
  }

  /* 이 휴대폰에 있는 한국어 목소리를 하나씩 들려준다 */
  function auditionAll() {
    var list = JSpeech.koreanVoices();
    if (!list.length) {
      toast('이 휴대폰에서 한국어 목소리를 찾지 못했어요.');
      return;
    }
    audSeq++;
    var my = audSeq;
    stopVoice();
    var i = 0;

    function step() {
      if (my !== audSeq || i >= list.length) {
        els.buddy.classList.remove('speaking');
        return;
      }
      var v = list[i++];
      els.buddy.classList.add('speaking');
      JSpeech.speak('이 목소리는 ' + v.name + ' 입니다. ' + S.name + ', 오늘 하루 어떠셨는가?', {
        rate: S.rate,
        pitch: S.pitch,
        voiceURI: v.voiceURI
      }).then(function () {
        if (my !== audSeq) return;
        setTimeout(step, 400);
      });
    }
    step();
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function updateHistSummary() {
    var list = JStore.getHistory();
    var el = $('histSummary');
    if (!el) return;
    if (!list.length) {
      el.textContent = '아직 기록이 없어요.';
      return;
    }
    var last = new Date(list[list.length - 1].t);
    el.textContent = '모두 ' + list.length + '마디 · 마지막 대화 ' + (last.getMonth() + 1) + '월 ' + last.getDate() + '일 ' + last.getHours() + '시 ' + (last.getMinutes() < 10 ? '0' : '') + last.getMinutes() + '분';
  }

  function renderHist() {
    var box = $('histBox');
    var list = JStore.getHistory();
    if (!list.length) {
      box.innerHTML = '<p class="note">아직 기록이 없어요.</p>';
      box.hidden = false;
      return;
    }
    var html = '';
    var lastDay = '';
    var days = [];
    for (var i = list.length - 1; i >= 0; i--) {
      var it = list[i];
      var d = new Date(it.t);
      var day = JStore.todayKey(d);
      if (day !== lastDay) {
        days.push('<div class="histday">' + d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + DAYS[d.getDay()] + '</div>');
        lastDay = day;
      }
      var hh = d.getHours();
      var mm = d.getMinutes();
      var t = (hh < 10 ? '0' + hh : hh) + ':' + (mm < 10 ? '0' + mm : mm);
      var who = it.who === 'app' ? '다림이' : '아버님';
      var cls = it.who === 'app' ? 'a' : 'b';
      days.push('<div class="histline"><span class="t">' + t + '</span><span class="who ' + cls + '">' + who + '</span><span class="x">' + escapeHtml(it.text) + '</span></div>');
    }
    html = days.join('');
    box.innerHTML = html;
    box.hidden = false;
    box.scrollTop = 0;
  }

  function bindSettings() {
    els.sheetClose.addEventListener('click', closeSheet);

    $('setName').addEventListener('change', function () {
      var v = this.value.trim();
      S.name = v || '제국아';
      this.value = S.name;
      save();
      toast('호칭을 저장했어요.');
    });

    $('setAutoGreet').addEventListener('change', function () {
      S.autoGreet = !!this.checked;
      save();
    });

    $('setGreetTime').addEventListener('change', function () {
      S.greetTime = this.value || '06:00';
      save();
      toast('아침 인사 시각: ' + S.greetTime);
    });

    $('setRate').addEventListener('input', function () {
      S.rate = parseFloat(this.value) || JSpeech.DEFAULT_RATE;
      $('rateVal').textContent = Number(S.rate).toFixed(2);
      save();
    });

    $('setVoice').addEventListener('change', function () {
      S.voiceURI = this.value || '';
      save();
      /* 고른 목소리를 바로 들려준다 */
      audition(S.name + ', 나는 말벗 다림이여. 오늘 하루도 편안하게 지내셔유.', S.voiceURI);
    });

    $('testVoice').addEventListener('click', function () {
      var sel = $('setVoice');
      var uri = sel ? (sel.value || '') : (S.voiceURI || '');
      audition(S.name + ', 나는 말벗 다림이여. 오늘 하루도 편안하게 지내셔유.', uri);
    });

    var cycleBtn = $('auditionAll');
    if (cycleBtn) cycleBtn.addEventListener('click', auditionAll);

    var engSel = $('setTtsEngine');
    if (engSel) {
      engSel.addEventListener('change', function () {
        S.ttsEngine = this.value === 'openai' ? 'openai' : 'browser';
        save();
        updateTtsNote();
        if (S.ttsEngine === 'openai' && !aiTtsEnabled()) {
          toast('OpenAI 키가 아직 없어서 지금은 휴대폰 목소리로 읽어요.');
        }
      });
    }

    var ttsVoiceSel = $('setTtsVoice');
    if (ttsVoiceSel) {
      ttsVoiceSel.addEventListener('change', function () {
        S.ttsVoice = this.value || 'nova';
        save();
        audition(S.name + ', 나는 말벗 다림이여. 오늘 하루도 편안하게 지내셔유.');
      });
    }

    $('testMorning').addEventListener('click', function () {
      els.sheet.hidden = true;
      if (!started) started = true;
      els.startOverlay.hidden = true;
      greet('morning');
    });

    $('setAutoListen').addEventListener('change', function () {
      S.autoListen = !!this.checked;
      save();
    });

    $('setWakeLock').addEventListener('change', function () {
      S.wakeLock = !!this.checked;
      save();
      if (S.wakeLock) requestWakeLock();
    });

    /* 지역 찾기 */
    $('locSearchBtn').addEventListener('click', doLocSearch);
    $('locQuery').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); doLocSearch(); }
    });

    function pickFromList(ev) {
      var btn = ev.target.closest ? ev.target.closest('button[data-lat]') : null;
      if (!btn) return;
      setLocation(parseFloat(btn.getAttribute('data-lat')), parseFloat(btn.getAttribute('data-lon')), btn.getAttribute('data-name'));
      toast(btn.getAttribute('data-name') + ' 으로 설정했어요.');
    }
    $('locQuick').addEventListener('click', pickFromList);
    $('locResults').addEventListener('click', pickFromList);

    $('locGps').addEventListener('click', function () {
      if (!navigator.geolocation) { toast('이 휴대폰은 위치를 알려주지 못해요.'); return; }
      toast('위치를 찾는 중…');
      navigator.geolocation.getCurrentPosition(function (pos) {
        setLocation(pos.coords.latitude, pos.coords.longitude, '휴대폰 위치');
        toast('이 휴대폰 위치로 설정했어요.');
      }, function () {
        toast('위치를 가져오지 못했어요. 지역 이름으로 찾아 주세요.');
      }, { timeout: 10000, maximumAge: 600000 });
    });

    /* 대화 기록 */
    $('histView').addEventListener('click', function () {
      var box = $('histBox');
      if (!box.hidden) { box.hidden = true; return; }
      renderHist();
    });

    $('histDownload').addEventListener('click', function () {
      var text = JStore.historyText();
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '제국아-대화기록-' + JStore.todayKey(new Date()) + '.txt';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 2000);
      toast('대화 기록을 파일로 저장했어요.');
    });

    $('histClear').addEventListener('click', function () {
      if (!confirm('대화 기록을 모두 지울까요? 가족만 보는 기록이에요.')) return;
      JStore.clearHistory();
      $('histBox').hidden = true;
      updateHistSummary();
      toast('기록을 지웠어요.');
    });

    /* 고급 API */
    $('setProvider').addEventListener('change', function () {
      S.provider = this.value;
      save();
    });
    $('setApiKey').addEventListener('change', function () {
      S.apiKey = this.value.trim();
      save();
      updateTtsNote();
      toast(S.apiKey ? 'API 키를 저장했어요. (이 휴대폰에만)' : 'API 키를 지웠어요.');
    });
    $('setModel').addEventListener('change', function () {
      S.model = this.value.trim();
      save();
    });
    $('apiTest').addEventListener('click', function () {
      var st = $('apiStatus');
      if (S.provider === 'none') { st.textContent = '지금은 내장 대화로 동작해요. 그대로도 잘 됩니다.'; return; }
      if (!S.apiKey) { st.textContent = 'API 키를 먼저 넣어 주세요.'; return; }
      st.textContent = '확인 중…';
      aiReply(S.name + ', 오늘 기분이 어떠신가?', { name: S.name, weather: weather, now: new Date() })
        .then(function (t) {
          st.textContent = t ? ('연결됐어요: ' + t) : '연결되지 않았어요. 키와 모델 이름을 확인해 주세요.';
        })
        .catch(function (e) {
          st.textContent = '연결되지 않았어요: ' + (e && e.message ? e.message : '알 수 없는 오류');
        });
    });
  }

  function doLocSearch() {
    var q = $('locQuery').value.trim();
    if (!q) return;
    var box = $('locResults');
    box.innerHTML = '<p class="note">찾는 중…</p>';
    JWeather.geocode(q).then(function (list) {
      if (!list.length) {
        box.innerHTML = '<p class="note">그 이름의 지역을 찾지 못했어요. 다른 이름으로 해보세요. (예: 아산, 공주, 유구)</p>';
        return;
      }
      var html = '';
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        html += '<button type="button" data-lat="' + r.lat + '" data-lon="' + r.lon + '" data-name="' + escapeAttr(r.name) + '">' + escapeHtml(r.name) + ' <small>(' + r.lat.toFixed(2) + ', ' + r.lon.toFixed(2) + ')</small></button>';
      }
      box.innerHTML = html;
    }).catch(function () {
      box.innerHTML = '<p class="note">지역을 찾지 못했어요. 인터넷을 확인해 주세요.</p>';
    });
  }

  function setLocation(lat, lon, name) {
    S.lat = lat;
    S.lon = lon;
    S.locName = name;
    save();
    $('locNow').textContent = '지역: ' + name + ' (' + Number(lat).toFixed(3) + ', ' + Number(lon).toFixed(3) + ')';
    loadWeather();
  }

  /* ---------- AI (선택) ---------- */
  function aiSystemPrompt(ctx) {
    var lines = [
      '너는 "' + (ctx.name || '제국아') + '"라고 부르는 어르신의 다정한 말벗 "다림이"다.',
      '어르신은 치매 초기이시다. 틀린 말을 고치거나 기억을 시험하는 질문을 하지 마라.',
      '짧고 또박또박한 한국어 2~3문장으로, 충청도 말투를 살짝 섞어 다정하게 말해라.',
      '공감을 먼저 하고, 마지막에 가벼운 질문을 하나 던져라.',
      '불안하거나 아픈 이야기가 나오면 안심시키고 가족에게 알리도록 권해라.',
      '어르신을 부를 때는 항상 "' + (ctx.name || '제국아') + '"라고 불러라.',
      '이모지와 목록 기호는 쓰지 마라. 말로 읽어 줄 글이므로 자연스러운 문장으로만 써라.'
    ];
    if (ctx.weather) {
      lines.push('오늘 날씨: ' + (ctx.weather.todayDesc || ctx.weather.desc) + ', ' + ctx.weather.temp + '도, 최고 ' + ctx.weather.tmax + '도 최저 ' + ctx.weather.tmin + '도.');
    }
    return lines.join(' ');
  }

  function recentTurns(limit) {
    var list = JStore.getHistory();
    var out = [];
    var start = Math.max(0, list.length - (limit || 8));
    for (var i = start; i < list.length; i++) {
      out.push({ role: list[i].who === 'app' ? 'assistant' : 'user', content: list[i].text });
    }
    return out;
  }

  function aiReply(text, ctx) {
    var sys = aiSystemPrompt(ctx);
    var model = S.model || (S.provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini');

    if (S.provider === 'openai') {
      var body = {
        model: model,
        messages: [{ role: 'system', content: sys }].concat(recentTurns(8)).concat([{ role: 'user', content: text }]),
        temperature: 0.85,
        max_tokens: 200
      };
      return fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + S.apiKey
        },
        body: JSON.stringify(body)
      }).then(function (res) {
        if (!res.ok) throw new Error('OpenAI HTTP ' + res.status);
        return res.json();
      }).then(function (d) {
        var t = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
        return t ? String(t).trim() : '';
      });
    }

    if (S.provider === 'gemini') {
      var contents = recentTurns(8).map(function (m) {
        return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
      });
      contents.push({ role: 'user', parts: [{ text: text }] });
      var gbody = {
        systemInstruction: { parts: [{ text: sys }] },
        contents: contents,
        generationConfig: { temperature: 0.85, maxOutputTokens: 220 }
      };
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(S.apiKey);
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gbody)
      }).then(function (res) {
        if (!res.ok) throw new Error('Gemini HTTP ' + res.status);
        return res.json();
      }).then(function (d) {
        var cand = d && d.candidates && d.candidates[0];
        var p = cand && cand.content && cand.content.parts && cand.content.parts[0];
        return p && p.text ? String(p.text).trim() : '';
      });
    }

    return Promise.resolve('');
  }

  /* ---------- 알림 ---------- */
  var toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 2600);
  }

  /* ---------- 시작 ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
