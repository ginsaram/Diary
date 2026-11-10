// 하루 성찰 – 데이터 저장·백업 도우미
// 이 파일은 화면과 무관한 순수 함수만 담습니다. (날짜 계산, 백업 파일 만들기/읽기, 사진 줄이기, 안전한 저장)

export const STORAGE_KEYS = {
  entries: 'diary_entries',
  routines: 'diary_routines',
  completed: 'diary_completed_routines',
  passcode: 'diary_passcode',
  fontSize: 'diary_font_size',
  coverImage: 'diary_cover_image',
};

export const BACKUP_SCHEMA = 'haru-seongchal-backup';
export const BACKUP_VERSION = 1;
export const DEFAULT_PASSCODE = '11';

const WEEKS = ['일', '월', '화', '수', '목', '금', '토'];

// ---------- 날짜 ----------
const pad2 = (n) => String(n).padStart(2, '0');

/** Date -> 'YYYY-MM-DD' (기기 시간대 기준) */
export function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 오늘 날짜 'YYYY-MM-DD' (기기 시간대 기준, UTC 아님) */
export function todayISO() {
  return toISODate(new Date());
}

/** 'YYYY-MM-DD' -> 기기 시간대 기준 0시 Date */
export function parseISODate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

/** 'YYYY-MM-DD' 에 일수를 더한 'YYYY-MM-DD' */
export function addDaysISO(dateStr, days) {
  const d = parseISODate(dateStr);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function formatKoreanDate(dateStr) {
  if (!dateStr) return '';
  const date = parseISODate(dateStr);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKS[date.getDay()]}요일)`;
}

// ---------- 저장 공간 ----------
export function byteSize(text) {
  if (typeof text !== 'string') return 0;
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return text.length * 2;
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * localStorage 에 안전하게 쓰기.
 * 공간 부족(QuotaExceeded) 등 실패해도 앱이 죽지 않고 결과를 돌려줍니다.
 */
export function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return { ok: true };
  } catch (err) {
    const name = err && err.name ? err.name : 'Error';
    const quota = name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || (err && err.code === 22);
    return {
      ok: false,
      quota,
      message: quota
        ? '저장 공간이 가득 찼습니다.'
        : '기록을 저장하지 못했습니다.',
    };
  }
}

/**
 * localStorage 에서 JSON 읽기. 깨진 데이터는 지우지 않고 별도 키에 보관한 뒤 기본값을 돌려줍니다.
 */
export function loadJSON(key, fallback) {
  let raw = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return fallback;
    return parsed;
  } catch {
    try {
      localStorage.setItem(`${key}_broken_${Date.now()}`, raw);
      localStorage.removeItem(key);
    } catch {
      /* 보관도 실패하면 원본을 그대로 둡니다 */
    }
    return fallback;
  }
}

// ---------- 일기 데이터 ----------
/** 화면에 보여줄 일기 편수 (본문이나 사진이 있는 날짜만) */
export function countEntries(diaries) {
  if (!diaries || typeof diaries !== 'object') return 0;
  return Object.values(diaries).filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const hasText = typeof entry.text === 'string' && entry.text.trim().length > 0;
    const hasImages = Array.isArray(entry.images) && entry.images.length > 0;
    return hasText || hasImages;
  }).length;
}

/** 백업 파일에서 쓰는 전체 데이터 크기(대략) */
export function totalSize(diaries, routines, completedRoutines) {
  try {
    return byteSize(JSON.stringify({ diaries, routines, completedRoutines }));
  } catch {
    return 0;
  }
}

// ---------- 백업 파일 ----------
export function buildBackup({ diaries, routines, completedRoutines, passcode, fontSize, coverImage }) {
  return {
    app: '하루 성찰 – 나를 안아주는 마음 일기장',
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    entries: diaries || {},
    routines: Array.isArray(routines) ? routines : [],
    completedRoutines: completedRoutines || {},
    settings: {
      passcode: typeof passcode === 'string' ? passcode : DEFAULT_PASSCODE,
      fontSize: fontSize || 'base',
      coverImage: coverImage && coverImage !== 'default' ? coverImage : null,
    },
  };
}

export function buildExportFileName(date = new Date()) {
  return `haru-seongchal-backup-${toISODate(date)}.json`;
}

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** 백업 파일 내용을 검사해 안전한 값만 돌려줍니다. */
export function parseBackup(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: '백업 파일을 읽을 수 없습니다. 이 앱에서 내보낸 JSON 파일인지 확인해 주세요.' };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, error: '백업 파일 형식이 올바르지 않습니다.' };
  }

  // 예전 형식(최상위에 diaries)도 받아들입니다.
  const entries = isPlainObject(raw.entries) ? raw.entries : isPlainObject(raw.diaries) ? raw.diaries : null;
  if (!entries) {
    return { ok: false, error: '이 파일에는 일기 기록이 없습니다. 이 앱에서 내보낸 백업 파일인지 확인해 주세요.' };
  }

  const diaries = {};
  Object.entries(entries).forEach(([date, entry]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isPlainObject(entry)) return;
    const text = typeof entry.text === 'string' ? entry.text : '';
    const images = Array.isArray(entry.images)
      ? entry.images.filter((img) => typeof img === 'string' && img.startsWith('data:image/')).slice(0, 2)
      : [];
    if (!text && images.length === 0) return;
    diaries[date] = { text, images };
  });

  const routines = Array.isArray(raw.routines)
    ? raw.routines
        .filter((r) => isPlainObject(r) && typeof r.name === 'string')
        .map((r, i) => ({
          id: r.id ? String(r.id) : String(Date.now() + i),
          name: r.name,
          startDate: typeof r.startDate === 'string' ? r.startDate : todayISO(),
          endDate: typeof r.endDate === 'string' ? r.endDate : todayISO(),
        }))
        .slice(0, 5)
    : [];

  const completedRoutines = {};
  if (isPlainObject(raw.completedRoutines)) {
    Object.entries(raw.completedRoutines).forEach(([date, ids]) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Array.isArray(ids)) {
        const clean = ids.filter((id) => typeof id === 'string');
        if (clean.length) completedRoutines[date] = clean;
      }
    });
  }

  const settings = isPlainObject(raw.settings) ? raw.settings : {};
  const passcode = typeof settings.passcode === 'string' && /^\d{2}$/.test(settings.passcode) ? settings.passcode : null;
  const fontSize = ['sm', 'base', 'lg', 'xl'].includes(settings.fontSize) ? settings.fontSize : null;
  const coverImage = typeof settings.coverImage === 'string' && settings.coverImage.startsWith('data:image/') ? settings.coverImage : null;

  if (countEntries(diaries) === 0 && routines.length === 0 && Object.keys(completedRoutines).length === 0) {
    return { ok: false, error: '백업 파일에 옮길 기록이 없습니다.' };
  }

  return {
    ok: true,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : null,
    diaries,
    routines,
    completedRoutines,
    settings: { passcode, fontSize, coverImage },
  };
}

/**
 * 지금 기록에 백업 기록을 합칩니다. (겹치는 날짜는 지금 기록 유지 = 기록이 사라지지 않음)
 */
export function mergeBackup(currentDiaries, currentRoutines, currentCompleted, parsed) {
  const diaries = { ...(currentDiaries || {}) };
  let addedEntries = 0;
  let addedRoutines = 0;
  let addedChecks = 0;

  Object.entries(parsed.diaries || {}).forEach(([date, entry]) => {
    const mine = diaries[date];
    const mineHasContent = mine && ((typeof mine.text === 'string' && mine.text.trim()) || (Array.isArray(mine.images) && mine.images.length));
    if (!mineHasContent) {
      diaries[date] = { text: entry.text || '', images: Array.isArray(entry.images) ? entry.images.slice(0, 2) : [] };
      addedEntries += 1;
    }
  });

  const routines = Array.isArray(currentRoutines) ? [...currentRoutines] : [];
  const knownRoutineIds = new Set(routines.map((r) => String(r.id)));
  const idRemap = {};
  (parsed.routines || []).forEach((routine) => {
    const key = String(routine.id);
    if (knownRoutineIds.has(key)) {
      idRemap[key] = key;
      return;
    }
    if (routines.length >= 5) return;
    routines.push(routine);
    knownRoutineIds.add(key);
    idRemap[key] = key;
    addedRoutines += 1;
  });

  const completedRoutines = { ...(currentCompleted || {}) };
  Object.entries(parsed.completedRoutines || {}).forEach(([date, ids]) => {
    const mine = Array.isArray(completedRoutines[date]) ? completedRoutines[date] : [];
    const merged = new Set(mine);
    ids.forEach((id) => {
      const mapped = idRemap[id] || id;
      if (!merged.has(mapped)) {
        merged.add(mapped);
        addedChecks += 1;
      }
    });
    if (merged.size) completedRoutines[date] = Array.from(merged);
  });

  return { diaries, routines, completedRoutines, addedEntries, addedRoutines, addedChecks };
}

// ---------- 파일 읽기 ----------
/** 파일을 텍스트로 읽기 (FileReader 우선 — 예전 브라우저에서도 동작) */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof FileReader === 'undefined') {
        if (file && typeof file.text === 'function') {
          file.text().then(resolve).catch(reject);
          return;
        }
        reject(new Error('FileReader unavailable'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error || new Error('read failed'));
      reader.readAsText(file);
    } catch (err) {
      reject(err);
    }
  });
}

// ---------- 사진 줄이기 ----------
/**
 * 폰 사진은 그대로 저장하면 금방 저장 공간이 차기 때문에,
 * 긴 변을 maxSide 픽셀로 줄이고 JPEG 로 다시 저장합니다.
 */
export function compressImage(file, maxSide = 1400, quality = 0.82) {
  return new Promise((resolve) => {
    const readOriginal = () => {
      try {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      } catch {
        resolve('');
      }
    };

    if (typeof document === 'undefined' || typeof window === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
      return readOriginal();
    }

    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      return readOriginal();
    }

    const img = new Image();
    img.onload = () => {
      try {
        const longest = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
        const scale = longest > maxSide ? maxSide / longest : 1;
        const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
        const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas unavailable');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const out = canvas.toDataURL('image/jpeg', quality);
        URL.revokeObjectURL(objectUrl);
        if (out && out.length > 64) resolve(out);
        else readOriginal();
      } catch {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          /* ignore */
        }
        readOriginal();
      }
    };
    img.onerror = () => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        /* ignore */
      }
      readOriginal();
    };
    img.src = objectUrl;
  });
}
