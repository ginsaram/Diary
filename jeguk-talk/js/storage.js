/* 저장소: 설정 · 대화 기록 (모두 이 휴대폰 브라우저 안에만 저장) */
(function (global) {
  'use strict';

  var K_SETTINGS = 'jeguk.settings.v1';
  var K_HISTORY = 'jeguk.history.v1';
  var K_GREETED = 'jeguk.greeted.v1';
  var K_WEATHER = 'jeguk.weather.v1';
  var HISTORY_MAX = 1500;

  var DEFAULTS = {
    name: '제국아',
    autoGreet: true,
    greetTime: '06:00',
    rate: 0.85,
    pitch: 1.0,
    voiceURI: '',
    autoListen: true,
    wakeLock: true,
    lat: 36.7693,
    lon: 127.0825,
    locName: '충남 아산시 배방읍',
    provider: 'none',
    apiKey: '',
    model: ''
  };

  function readJSON(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function getSettings() {
    var saved = readJSON(K_SETTINGS, {});
    var out = {};
    var k;
    for (k in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) out[k] = DEFAULTS[k];
    }
    if (saved && typeof saved === 'object') {
      for (k in saved) {
        if (Object.prototype.hasOwnProperty.call(saved, k)) out[k] = saved[k];
      }
    }
    return out;
  }

  function saveSettings(s) {
    return writeJSON(K_SETTINGS, s);
  }

  function todayKey(d) {
    var t = d || new Date();
    var m = String(t.getMonth() + 1);
    var day = String(t.getDate());
    if (m.length < 2) m = '0' + m;
    if (day.length < 2) day = '0' + day;
    return t.getFullYear() + '-' + m + '-' + day;
  }

  function getHistory() {
    var list = readJSON(K_HISTORY, []);
    return Array.isArray(list) ? list : [];
  }

  function addHistory(who, text) {
    if (!text) return;
    var list = getHistory();
    list.push({ t: Date.now(), who: who, text: String(text).slice(0, 400) });
    if (list.length > HISTORY_MAX) list = list.slice(list.length - HISTORY_MAX);
    writeJSON(K_HISTORY, list);
  }

  function clearHistory() {
    writeJSON(K_HISTORY, []);
  }

  function historyText() {
    var list = getHistory();
    if (!list.length) return '아직 대화 기록이 없어요.';
    var out = [];
    var lastDay = '';
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var d = new Date(it.t);
      var day = todayKey(d);
      if (day !== lastDay) {
        out.push('');
        out.push('=== ' + d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ===');
        lastDay = day;
      }
      var hh = String(d.getHours());
      var mm = String(d.getMinutes());
      if (hh.length < 2) hh = '0' + hh;
      if (mm.length < 2) mm = '0' + mm;
      out.push(hh + ':' + mm + '  ' + (it.who === 'app' ? '다림이' : '아버님') + ' : ' + it.text);
    }
    return out.join('\n');
  }

  function getGreetedDate() {
    try {
      return global.localStorage.getItem(K_GREETED) || '';
    } catch (e) {
      return '';
    }
  }

  function setGreetedDate(v) {
    try {
      global.localStorage.setItem(K_GREETED, v);
    } catch (e) { /* 저장 실패는 무시 */ }
  }

  function getCachedWeather() {
    return readJSON(K_WEATHER, null);
  }

  function setCachedWeather(w) {
    writeJSON(K_WEATHER, w);
  }

  global.JStore = {
    DEFAULTS: DEFAULTS,
    getSettings: getSettings,
    saveSettings: saveSettings,
    todayKey: todayKey,
    getHistory: getHistory,
    addHistory: addHistory,
    clearHistory: clearHistory,
    historyText: historyText,
    getGreetedDate: getGreetedDate,
    setGreetedDate: setGreetedDate,
    getCachedWeather: getCachedWeather,
    setCachedWeather: setCachedWeather
  };
})(window);
