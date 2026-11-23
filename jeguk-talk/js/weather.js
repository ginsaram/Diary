/* 날씨: Open-Meteo 무료 API (키 필요 없음) */
(function (global) {
  'use strict';

  var WMO = {
    0: ['맑음', '☀️', 'clear'],
    1: ['대체로 맑음', '🌤', 'clear'],
    2: ['구름 조금', '⛅', 'cloudy'],
    3: ['흐림', '☁️', 'cloudy'],
    45: ['안개', '🌫', 'fog'],
    48: ['안개', '🌫', 'fog'],
    51: ['이슬비', '🌦', 'rain'],
    53: ['이슬비', '🌦', 'rain'],
    55: ['이슬비', '🌧', 'rain'],
    56: ['어는 이슬비', '🌧', 'rain'],
    57: ['어는 이슬비', '🌧', 'rain'],
    61: ['비', '🌧', 'rain'],
    63: ['비', '🌧', 'rain'],
    65: ['비', '🌧', 'rain'],
    66: ['어는 비', '🌧', 'rain'],
    67: ['어는 비', '🌧', 'rain'],
    71: ['눈', '🌨', 'snow'],
    73: ['눈', '🌨', 'snow'],
    75: ['눈', '❄️', 'snow'],
    77: ['눈', '❄️', 'snow'],
    80: ['소나기', '🌦', 'rain'],
    81: ['소나기', '🌧', 'rain'],
    82: ['소나기', '🌧', 'rain'],
    85: ['눈 소나기', '🌨', 'snow'],
    86: ['눈 소나기', '🌨', 'snow'],
    95: ['천둥번개', '⛈', 'storm'],
    96: ['천둥번개', '⛈', 'storm'],
    99: ['천둥번개', '⛈', 'storm']
  };

  function codeInfo(code, isDay) {
    var row = WMO[code];
    if (!row) row = ['구름 조금', '⛅', 'cloudy'];
    var emoji = row[1];
    if (!isDay && (code === 0 || code === 1)) emoji = '🌙';
    return { desc: row[0], emoji: emoji, cls: row[2] };
  }

  function getJSON(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = null;
      var ctrl = null;
      function finish(err, data) {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (err) reject(err);
        else resolve(data);
      }
      try {
        if (typeof AbortController !== 'undefined') {
          ctrl = new AbortController();
        }
      } catch (e) { ctrl = null; }
      timer = setTimeout(function () {
        if (ctrl) { try { ctrl.abort(); } catch (e) {} }
        finish(new Error('시간 초과'));
      }, timeoutMs || 9000);
      var opts = { cache: 'no-store' };
      if (ctrl) opts.signal = ctrl.signal;
      fetch(url, opts)
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) { finish(null, data); })
        .catch(function (err) { finish(err); });
    });
  }

  function round(n) {
    if (typeof n !== 'number' || isNaN(n)) return null;
    return Math.round(n);
  }

  function fetchWeather(lat, lon) {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(lat) +
      '&longitude=' + encodeURIComponent(lon) +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,precipitation' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&timezone=auto&forecast_days=2';
    return getJSON(url, 9000).then(function (d) {
      var cur = d.current || {};
      var daily = d.daily || {};
      var isDay = cur.is_day !== 0;
      var info = codeInfo(cur.weather_code, isDay);
      var todayCode = (daily.weather_code && daily.weather_code[0] !== undefined) ? daily.weather_code[0] : cur.weather_code;
      var todayInfo = codeInfo(todayCode, true);
      var w = {
        temp: round(cur.temperature_2m),
        feels: round(cur.apparent_temperature),
        humidity: round(cur.relative_humidity_2m),
        wind: round(cur.wind_speed_10m),
        isDay: isDay,
        code: cur.weather_code,
        desc: info.desc,
        emoji: info.emoji,
        cls: info.cls,
        todayDesc: todayInfo.desc,
        todayEmoji: todayInfo.emoji,
        todayCls: todayInfo.cls,
        tmax: round(daily.temperature_2m_max ? daily.temperature_2m_max[0] : null),
        tmin: round(daily.temperature_2m_min ? daily.temperature_2m_min[0] : null),
        pop: round(daily.precipitation_probability_max ? daily.precipitation_probability_max[0] : null),
        tomorrowDesc: daily.weather_code && daily.weather_code[1] !== undefined
          ? codeInfo(daily.weather_code[1], true).desc : '',
        updatedAt: Date.now()
      };
      return w;
    });
  }

  function geocode(query) {
    var url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(query) +
      '&count=6&language=ko&format=json';
    return getJSON(url, 8000).then(function (d) {
      var list = (d && d.results) || [];
      return list.map(function (r) {
        var parts = [];
        if (r.name) parts.push(r.name);
        if (r.admin1 && r.admin1 !== r.name) parts.push(r.admin1);
        if (r.admin2 && r.admin2 !== r.name) parts.push(r.admin2);
        return {
          name: parts.join(' '),
          lat: r.latitude,
          lon: r.longitude,
          country: r.country || ''
        };
      });
    });
  }

  /* 기온을 말로 */
  function tempWord(t) {
    if (t === null || t === undefined) return '';
    if (t <= -5) return '몹시 추운';
    if (t <= 3) return '쌀쌀한';
    if (t <= 11) return '선선한';
    if (t <= 19) return '딱 좋은';
    if (t <= 26) return '포근한';
    if (t <= 30) return '더운';
    return '무더운';
  }

  /* 날씨에 맞는 한마디와 권유 */
  function weatherSentence(w) {
    if (!w) return { line: '', advice: '' };
    var t = (w.temp === null ? '' : w.temp + '도');
    var cls = w.todayCls || w.cls;
    var line = '';
    var advice = '';

    if (cls === 'rain') {
      line = '오늘은 비가 내린다니께' + (t ? ' 기온은 ' + t + '여' : '') + '.';
      advice = '비에 젖지 않게 우산은 꼭 챙기시고, 길이 미끄러우니 천천히 다니셔야 해유.';
      if (w.pop && w.pop >= 60) advice = '비 올 확률이 ' + w.pop + '퍼센트라니께, 우산은 꼭 챙기셔야 해유. 길이 미끄러우니 천천히 다니시고.';
    } else if (cls === 'snow') {
      line = '오늘은 눈이 온다니께' + (t ? ' 기온은 ' + t + '여' : '') + '.';
      advice = '길이 미끄러우니 바깥에 나가실 때는 꼭 조심하시고, 되도록 따뜻한 방에서 지내시는 게 좋겠어유.';
    } else if (cls === 'storm') {
      line = '오늘은 천둥번개가 친다니께' + (t ? ' 기온은 ' + t + '여' : '') + '.';
      advice = '밖에 나가시는 건 오늘은 삼가시고, 집에서 따뜻하게 지내시는 게 좋겠어유.';
    } else if (cls === 'fog') {
      line = '오늘은 안개가 자욱허니' + (t ? ' 기온은 ' + t + '여' : '') + '.';
      advice = '앞이 잘 안 보이니께, 나가실 때는 천천히 다니셔야 해유.';
    } else if (cls === 'cloudy') {
      line = '오늘은 구름이 좀 꼈지만' + (t ? ' 기온은 ' + t + '여' : '') + '.';
      advice = '바람이 세지 않으면 동네 한 바퀴 정도는 괜찮아유.';
    } else {
      line = '오늘은 하늘이 맑고' + (t ? ' 기온은 ' + t + '여' : '') + '.';
      advice = '산책하기 참 좋은 날이여.';
    }

    var temp = w.temp;
    if (cls !== 'rain' && cls !== 'snow' && cls !== 'storm') {
      if (temp !== null && temp >= 30) advice = '한낮에는 무더우니 그늘에서 쉬시고, 물을 자주 드셔야 해유.';
      else if (temp !== null && temp >= 27) advice = '조금 더우니 한낮보다는 아침이나 해 질 녘에 걸으시는 게 좋겠어유.';
      else if (temp !== null && temp <= 0) advice = '몹시 추우니께 따뜻하게 입고, 장갑도 챙기셔야 해유.';
      else if (temp !== null && temp <= 5) advice = '쌀쌀허니께 겉옷을 든든히 입고 나가셔야 해유.';
      else if (w.wind !== null && w.wind >= 30) advice = '바람이 세니께 오래 걷지는 마시고 짧게 다녀오셔유.';
    }
    return { line: line, advice: advice };
  }

  global.JWeather = {
    fetchWeather: fetchWeather,
    geocode: geocode,
    weatherSentence: weatherSentence,
    tempWord: tempWord,
    codeInfo: codeInfo
  };
})(window);
