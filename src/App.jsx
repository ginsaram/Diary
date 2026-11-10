import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Calendar, 
  Lock, 
  Settings, 
  BookOpen, 
  CheckSquare, 
  Plus, 
  Trash2, 
  Camera, 
  Sparkles, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw,
  PlusCircle,
  Eye,
  EyeOff,
  Type,
  Download,
  Upload,
  AlertTriangle
} from 'lucide-react';
import {
  STORAGE_KEYS,
  DEFAULT_PASSCODE,
  todayISO,
  addDaysISO,
  formatKoreanDate,
  loadJSON,
  safeSetItem,
  buildBackup,
  buildExportFileName,
  parseBackup,
  mergeBackup,
  countEntries,
  totalSize,
  formatBytes,
  byteSize,
  compressImage,
  readFileAsText
} from './utils/diary';

// Imagen 배경 생성용 키 (비어 있으면 AI 배경 생성 기능이 잠깁니다)
const apiKey = "";
// 브라우저 저장 공간(localStorage) 한도는 보통 5MB 정도입니다.
const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

export default function App() {
  // --- 상태 관리 ---
  const [isLocked, setIsLocked] = useState(true);
  const [passcode, setPasscode] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.passcode) || DEFAULT_PASSCODE;
    } catch {
      return DEFAULT_PASSCODE;
    }
  });
  const [enteredDigits, setEnteredDigits] = useState('');
  const [isPasscodeVisible, setIsPasscodeVisible] = useState(false);

  // 현재 선택된 날짜 (YYYY-MM-DD, 기기 시간대 기준)
  const [selectedDate, setSelectedDate] = useState(() => todayISO());

  // 다이어리 데이터 { "YYYY-MM-DD": { text: "", images: ["base64...", "base64..."] } }
  const [diaries, setDiaries] = useState(() => loadJSON(STORAGE_KEYS.entries, {}));

  // 나의 루틴 계획 리스트 [{ id, name, startDate, endDate }] - 최대 5개
  const [routines, setRoutines] = useState(() => {
    const saved = loadJSON(STORAGE_KEYS.routines, null);
    if (Array.isArray(saved)) return saved.slice(0, 5);
    return [
      { id: '1', name: '팔굽혀 펴기 100개', startDate: todayISO(), endDate: addDaysISO(todayISO(), 7) },
      { id: '2', name: '매일 책 10페이지 읽기', startDate: todayISO(), endDate: addDaysISO(todayISO(), 30) }
    ];
  });

  // 루틴 완료 기록 { "YYYY-MM-DD": ["routine_id_1", "routine_id_2"] }
  const [completedRoutines, setCompletedRoutines] = useState(() => loadJSON(STORAGE_KEYS.completed, {}));

  // 앱 설정 관련
  const [fontSize, setFontSize] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.fontSize) || 'base'; // sm, base, lg, xl
    } catch {
      return 'base';
    }
  });
  const [coverImage, setCoverImage] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.coverImage) || 'default';
    } catch {
      return 'default';
    }
  });

  // 저장 공간 부족 등 저장 실패 알림
  const [storageError, setStorageError] = useState(null);
  // 백업/복원 결과 메시지
  const [backupMessage, setBackupMessage] = useState({ text: '', type: '' });
  
  // UI 내비게이션 탭 ('diary', 'routine', 'settings')
  const [activeTab, setActiveTab] = useState('diary');

  // 모달 및 서브 상태
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState('');
  const [newRoutineStart, setNewRoutineStart] = useState(() => todayISO());
  const [newRoutineEnd, setNewRoutineEnd] = useState(() => addDaysISO(todayISO(), 7));
  
  // 비밀번호 변경 입력칸
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [newPassInputConfirm, setNewPassInputConfirm] = useState('');
  const [passChangeMessage, setPassChangeMessage] = useState({ text: '', type: '' });

  // AI 이미지 생성 상태
  const [aiPrompt, setAiPrompt] = useState('온화한 미소를 짓는 키다리 아저씨, 따뜻하고 포근한 수채화 화풍, 파스텔 톤, 아늑하고 안락한 감성 일러스트');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageError, setImageError] = useState('');

  // 사진 업로드 Ref
  const fileInputRef = useRef(null);
  // 백업 파일 불러오기 Ref
  const importInputRef = useRef(null);

  // --- 자동 저장 (저장 실패를 조용히 넘기지 않고 화면에 알립니다) ---
  const persist = (key, value) => {
    const result = safeSetItem(key, value);
    setStorageError(result.ok ? null : { key, message: result.message, quota: result.quota });
    return result.ok;
  };

  useEffect(() => {
    persist(STORAGE_KEYS.entries, JSON.stringify(diaries));
  }, [diaries]);

  useEffect(() => {
    persist(STORAGE_KEYS.routines, JSON.stringify(routines));
  }, [routines]);

  useEffect(() => {
    persist(STORAGE_KEYS.completed, JSON.stringify(completedRoutines));
  }, [completedRoutines]);

  useEffect(() => {
    persist(STORAGE_KEYS.passcode, passcode);
  }, [passcode]);

  useEffect(() => {
    persist(STORAGE_KEYS.fontSize, fontSize);
  }, [fontSize]);

  useEffect(() => {
    persist(STORAGE_KEYS.coverImage, coverImage);
  }, [coverImage]);

  // 저장 공간 사용량 (사진이 많아지면 금방 5MB를 넘기 때문입니다)
  const usedBytes = useMemo(
    () => totalSize(diaries, routines, completedRoutines),
    [diaries, routines, completedRoutines]
  );
  const photoCount = useMemo(
    () => Object.values(diaries || {}).reduce((sum, entry) => sum + (entry && Array.isArray(entry.images) ? entry.images.length : 0), 0),
    [diaries]
  );
  const usedRatio = Math.min(1, usedBytes / STORAGE_LIMIT_BYTES);
  const [lastBackupAt, setLastBackupAt] = useState(() => {
    try {
      return localStorage.getItem('diary_last_backup_at') || null;
    } catch {
      return null;
    }
  });

  // --- 잠금 해제 처리 ---
  const handleDigitClick = (num) => {
    if (enteredDigits.length >= 2) return;
    const nextDigits = enteredDigits + num;
    setEnteredDigits(nextDigits);

    if (nextDigits.length === 2) {
      if (nextDigits === passcode) {
        // 성공 시 잠금 해제
        setTimeout(() => {
          setIsLocked(false);
          setEnteredDigits('');
        }, 300);
      } else {
        // 실패 시 흔들림 피드백 후 초기화
        setTimeout(() => {
          setEnteredDigits('');
          alert('비밀번호가 올바르지 않습니다. 다시 시도해 주세요.');
        }, 400);
      }
    }
  };

  const handleBackspace = () => {
    setEnteredDigits(prev => prev.slice(0, -1));
  };

  // --- 다이어리 작성 및 사진 처리 ---
  const handleDiaryTextChange = (e) => {
    const text = e.target.value;
    setDiaries(prev => ({
      ...prev,
      [selectedDate]: {
        ...prev[selectedDate],
        text: text
      }
    }));
  };

  const triggerPhotoUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handlePhotoChange = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    const entry = diaries[selectedDate] || { text: "", images: [] };
    const room = 2 - (entry.images || []).length;

    if (room <= 0) {
      alert("하루에 사진은 최대 2장까지 첨부할 수 있습니다.");
      return;
    }
    if (files.length > room) {
      alert(`사진은 하루 최대 2장까지만 담을 수 있어 ${room}장만 추가합니다.`);
    }

    for (const file of files.slice(0, room)) {
      // 폰 사진 원본은 한 장에 몇 MB라서 그대로 저장하면 금방 저장 공간이 차집니다.
      // 붙이기 전에 긴 변 1400px 로 줄여 저장합니다.
      const dataUrl = await compressImage(file);
      if (!dataUrl) {
        alert("사진을 읽지 못했습니다. 다른 사진으로 다시 시도해 주세요.");
        continue;
      }
      setDiaries(prev => {
        const current = prev[selectedDate] || { text: "", images: [] };
        const images = [...(current.images || []), dataUrl];
        return {
          ...prev,
          [selectedDate]: {
            ...current,
            images: images.slice(0, 2) // 방어막으로 한 번 더 2장 제한
          }
        };
      });
    }
  };

  const deletePhoto = (indexToDelete) => {
    setDiaries(prev => {
      const entry = prev[selectedDate];
      if (!entry || !entry.images) return prev;
      const filteredImages = entry.images.filter((_, idx) => idx !== indexToDelete);
      return {
        ...prev,
        [selectedDate]: {
          ...entry,
          images: filteredImages
        }
      };
    });
  };

  // --- 루틴(계획) 관리 ---
  const handleAddRoutine = (e) => {
    e.preventDefault();
    if (!newRoutineName.trim()) return;

    if (routines.length >= 5) {
      alert("나의 계획은 최대 5개까지만 등록할 수 있습니다. 기존 계획을 완료하거나 삭제해 주세요.");
      return;
    }

    const newRoutine = {
      id: Date.now().toString(),
      name: newRoutineName.trim(),
      startDate: newRoutineStart,
      endDate: newRoutineEnd
    };

    setRoutines(prev => [...prev, newRoutine]);
    setNewRoutineName('');
    alert("새 계획이 등록되었습니다.");
  };

  const handleDeleteRoutine = (id) => {
    if (confirm("이 계획을 삭제하시겠습니까?")) {
      setRoutines(prev => prev.filter(r => r.id !== id));
    }
  };

  // 특정 날짜에 활성화된 루틴 필터링
  const getActiveRoutinesForDate = (dateStr) => {
    const targetDate = new Date(dateStr);
    return routines.filter(r => {
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      // 날짜 객체 비교를 위해 시각 제거
      start.setHours(0,0,0,0);
      end.setHours(23,59,59,999);
      return targetDate >= start && targetDate <= end;
    });
  };

  const toggleRoutineComplete = (routineId) => {
    const todayCompleted = completedRoutines[selectedDate] || [];
    let updated;
    if (todayCompleted.includes(routineId)) {
      updated = todayCompleted.filter(id => id !== routineId);
    } else {
      updated = [...todayCompleted, routineId];
    }

    setCompletedRoutines(prev => ({
      ...prev,
      [selectedDate]: updated
    }));
  };

  // --- 비밀번호 변경 ---
  const handleChangePasscode = (e) => {
    e.preventDefault();
    setPassChangeMessage({ text: '', type: '' });

    if (currentPassInput !== passcode) {
      setPassChangeMessage({ text: '현재 비밀번호가 일치하지 않습니다.', type: 'error' });
      return;
    }

    if (newPassInput.length !== 2 || isNaN(Number(newPassInput))) {
      setPassChangeMessage({ text: '새 비밀번호는 숫자 2자리로 설정해 주세요.', type: 'error' });
      return;
    }

    if (newPassInput !== newPassInputConfirm) {
      setPassChangeMessage({ text: '새 비밀번호 확인이 일치하지 않습니다.', type: 'error' });
      return;
    }

    setPasscode(newPassInput);
    setPassChangeMessage({ text: '비밀번호가 성공적으로 변경되었습니다!', type: 'success' });
    setCurrentPassInput('');
    setNewPassInput('');
    setNewPassInputConfirm('');
  };

  // --- AI 이미지 생성 (Imagen 4.0) ---
  const generateAIImage = async () => {
    if (!apiKey) {
      setImageError("AI 배경 생성 기능은 아직 준비 중입니다. 지금은 기본 일러스트를 그대로 사용해 주세요.");
      return;
    }
    if (!aiPrompt.trim()) return;
    setIsGeneratingImage(true);
    setImageError('');

    let delay = 1000;
    // 최대 5회 재시도 정책 적용 (지수 백오프)
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instances: { prompt: aiPrompt },
            parameters: { sampleCount: 1 }
          })
        });

        if (!response.ok) {
          throw new Error(`API 요청 실패 (코드: ${response.status})`);
        }

        const data = await response.json();
        const base64Bytes = data.predictions?.[0]?.bytesBase64Encoded;

        if (base64Bytes) {
          const generatedUrl = `data:image/png;base64,${base64Bytes}`;
          setCoverImage(generatedUrl);
          setIsGeneratingImage(false);
          alert("나만의 감성을 담은 다이어리 배경 이미지가 생성되어 반영되었습니다!");
          return;
        } else {
          throw new Error("이미지 데이터가 응답에 없습니다.");
        }
      } catch {
        if (attempt === 5) {
          setImageError("네트워크 상태가 불안정하여 AI 이미지 생성에 실패했습니다. 다시 한 번 시도해 주세요.");
          setIsGeneratingImage(false);
          return;
        }
        // 지수 백오프 대기 (1s, 2s, 4s, 8s...)
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  };

  const handleResetCover = () => {
    setCoverImage('default');
    alert("기본 키다리 아저씨 일러스트로 환원되었습니다.");
  };

  // --- 백업 파일 내려받기 ---
  const handleExportBackup = () => {
    try {
      const payload = buildBackup({ diaries, routines, completedRoutines, passcode, fontSize, coverImage });
      const text = JSON.stringify(payload, null, 2);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = buildExportFileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      setBackupMessage({
        type: 'success',
        text: `백업 파일을 내려받았습니다. 일기 ${countEntries(diaries)}편, 계획 ${routines.length}개, 크기 ${formatBytes(byteSize(text))}`
      });
      setStorageError(null);
      const now = new Date().toISOString();
      const savedAt = safeSetItem('diary_last_backup_at', now);
      if (savedAt.ok) setLastBackupAt(now);
    } catch {
      setBackupMessage({
        type: 'error',
        text: '백업 파일을 만들지 못했습니다. 폰의 저장 공간을 한 번 확인한 뒤 다시 시도해 주세요.'
      });
    }
  };

  // --- 백업 파일 불러와 합치기 ---
  const handleImportBackup = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;

    setBackupMessage({ text: '', type: '' });

    let text = '';
    try {
      text = await readFileAsText(file);
    } catch {
      setBackupMessage({ type: 'error', text: '파일을 읽지 못했습니다. 다시 시도해 주세요.' });
      return;
    }

    const parsed = parseBackup(text);
    if (!parsed.ok) {
      setBackupMessage({ type: 'error', text: parsed.error });
      return;
    }

    const merged = mergeBackup(diaries, routines, completedRoutines, parsed);

    if (merged.addedEntries === 0 && merged.addedRoutines === 0 && merged.addedChecks === 0) {
      setBackupMessage({
        type: 'success',
        text: '이 백업 파일의 기록은 이미 모두 이 폰에 들어 있습니다. 바뀐 것은 없습니다.'
      });
      return;
    }

    const ok = confirm(
      `백업 파일에서 일기 ${countEntries(parsed.diaries)}편, 계획 ${parsed.routines.length}개를 찾았습니다.\n\n` +
      `지금 기록에 더합니다. (겹치는 날짜는 지금 기록을 그대로 두고, 없는 날짜만 채웁니다)\n` +
      `지금 기록이 지워지지는 않습니다.\n\n계속할까요?`
    );
    if (!ok) return;

    setDiaries(merged.diaries);
    setRoutines(merged.routines);
    setCompletedRoutines(merged.completedRoutines);
    if (parsed.settings.fontSize) setFontSize(parsed.settings.fontSize);
    if (parsed.settings.passcode) setPasscode(parsed.settings.passcode);
    if (parsed.settings.coverImage) setCoverImage(parsed.settings.coverImage);

    setBackupMessage({
      type: 'success',
      text: `복원했습니다. 일기 ${merged.addedEntries}편, 계획 ${merged.addedRoutines}개, 계획 체크 ${merged.addedChecks}개를 새로 담았습니다.`
    });
  };

  // --- 폰트 사이즈 클래스 매핑 ---
  const getFontSizeClass = () => {
    switch (fontSize) {
      case 'sm': return 'text-sm';
      case 'lg': return 'text-lg';
      case 'xl': return 'text-xl';
      case 'base':
      default:
        return 'text-base';
    }
  };

  // 요소별 정밀 조정을 위한 도우미 스타일 객체
  const getFontSizeStyles = () => {
    switch (fontSize) {
      case 'sm': return { body: 'text-sm', title: 'text-lg', label: 'text-xs', btn: 'text-xs' };
      case 'lg': return { body: 'text-lg', title: 'text-xl', label: 'text-base', btn: 'text-base' };
      case 'xl': return { body: 'text-xl', title: 'text-2xl', label: 'text-lg', btn: 'text-lg' };
      case 'base':
      default:
        return { body: 'text-base', title: 'text-xl', label: 'text-sm', btn: 'text-sm' };
    }
  };

  // --- 일기 입력창 텍스트 조회 ---
  const currentDiaryText = diaries[selectedDate]?.text || "";
  const currentDiaryImages = diaries[selectedDate]?.images || [];
  const activeRoutinesToday = getActiveRoutinesForDate(selectedDate);
  const completedRoutinesToday = completedRoutines[selectedDate] || [];

  return (
    <div className="bg-amber-100/50 min-h-screen py-0 md:py-8 flex justify-center items-center font-sans">
      {/* 모바일 폰 외관 프레임 */}
      <div className="w-full max-w-md bg-[#FFFDF9] min-h-screen md:min-h-[840px] md:rounded-3xl md:shadow-2xl flex flex-col relative overflow-hidden border border-amber-900/10">
        
        {/* ======================================= */}
        {/* 1. 잠금 화면 (비밀번호 입력) */}
        {/* ======================================= */}
        {isLocked && (
          <div className="absolute inset-0 z-50 flex flex-col justify-between bg-amber-50">
            {/* 상단 비주얼 영역 (키다리아저씨 이미지) */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
              {/* 이미지 배경 / SVG */}
              <div className="w-full h-80 rounded-2xl overflow-hidden shadow-md border-2 border-amber-200/50 bg-gradient-to-b from-amber-100 to-amber-200 relative flex items-center justify-center">
                {coverImage === 'default' ? (
                  // 아름다운 키다리 아저씨 기본 일러스트 (SVG)
                  <svg viewBox="0 0 400 400" className="w-full h-full object-cover">
                    <defs>
                      <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#2D213F" />
                        <stop offset="50%" stopColor="#4A3B58" />
                        <stop offset="100%" stopColor="#A88B74" />
                      </linearGradient>
                      <radialGradient id="lampGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#FFF1C5" stopOpacity="1" />
                        <stop offset="50%" stopColor="#FFE082" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#FFE082" stopOpacity="0" />
                      </radialGradient>
                    </defs>
                    {/* 밤하늘 */}
                    <rect width="400" height="400" fill="url(#skyGrad)" />
                    {/* 별빛 */}
                    <circle cx="80" cy="70" r="1.5" fill="#FFF" opacity="0.8" />
                    <circle cx="120" cy="50" r="1.2" fill="#FFF" opacity="0.6" />
                    <circle cx="280" cy="80" r="1.8" fill="#FFF" opacity="0.9" />
                    <circle cx="340" cy="110" r="1" fill="#FFF" opacity="0.5" />
                    <circle cx="50" cy="150" r="2" fill="#FFF" opacity="0.7" />

                    {/* 보름달 */}
                    <circle cx="310" cy="90" r="25" fill="#FFFDF0" opacity="0.9" className="blur-[1px]" />
                    <circle cx="310" cy="90" r="35" fill="#FFF9C4" opacity="0.2" />

                    {/* 언덕 지평선 */}
                    <path d="M-50 400 Q150 280 450 400 Z" fill="#2E241E" />
                    <path d="M-10 400 Q250 310 420 400 Z" fill="#1C1512" />

                    {/* 가로등 빛 기둥 */}
                    <polygon points="120,400 220,180 255,180 350,400" fill="url(#lampGlow)" opacity="0.4" />

                    {/* 가로등 */}
                    <path d="M230,400 L230,170 Q230,165 235,165 L240,165" fill="none" stroke="#3E2723" strokeWidth="4" />
                    <path d="M228,170 L242,170 L235,155 Z" fill="#3E2723" />
                    <circle cx="235" cy="172" r="6" fill="#FFF59D" />

                    {/* 키다리아저씨 실루엣 */}
                    {/* 다리 */}
                    <line x1="165" y1="280" x2="162" y2="380" stroke="#000" strokeWidth="5.5" />
                    <line x1="178" y1="280" x2="182" y2="380" stroke="#000" strokeWidth="5" />
                    {/* 외투와 몸통 */}
                    <path d="M150,220 Q170,180 190,220 L195,290 L145,290 Z" fill="#1A1211" />
                    {/* 목도리 */}
                    <path d="M158,202 Q170,208 182,202 L178,212 L162,212 Z" fill="#A1887F" />
                    {/* 머리 및 클래식 모자(페도라) */}
                    <circle cx="170" cy="190" r="10" fill="#2D1C1B" />
                    <path d="M155,183 Q170,173 185,183 Z" fill="#0D0706" />
                    <line x1="145" y1="184" x2="195" y2="184" stroke="#0D0706" strokeWidth="3" />
                    {/* 지팡이 */}
                    <path d="M142,260 L145,380" stroke="#5D4037" strokeWidth="3" strokeLinecap="round" />
                    {/* 따뜻한 동반자 (강아지 실루엣) */}
                    <path d="M195,350 Q205,340 210,350 L212,375 L190,375 Z" fill="#000" />
                    <circle cx="208" cy="348" r="4" fill="#000" />
                    
                    {/* 텍스트 아트 */}
                    <rect x="25" y="25" width="110" height="35" rx="8" fill="#1E1625" fillOpacity="0.6" />
                    <text x="37" y="47" fill="#FFE082" fontSize="13" fontWeight="bold">키다리 아저씨</text>
                  </svg>
                ) : (
                  // 사용자가 생성하거나 업로드한 배경화면
                  <img 
                    src={coverImage} 
                    alt="하루 성찰 커버 이미지" 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&q=80&w=600'; // 포근한 햇살 이미지 폴백
                    }}
                  />
                )}
                
                {/* 그라데이션 오버레이 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                
                {/* 타이틀 오버레이 */}
                <div className="absolute bottom-5 text-center w-full">
                  <h1 className="text-3xl font-extrabold text-white tracking-widest drop-shadow-md">
                    하루 성찰
                  </h1>
                  <p className="text-xs text-amber-100/90 mt-1 font-medium">나를 안아주는 마음 일기장</p>
                </div>
              </div>

            </div>

            {/* 하단 패스코드 키패드 영역 */}
            <div className="bg-amber-100/60 p-6 rounded-t-[32px] border-t border-amber-200">
              <div className="text-center mb-4">
                <p className="text-sm font-semibold text-amber-900/80 tracking-wide">성찰 일기장을 열기 위해 2자리 비밀번호를 누르세요</p>
                {/* 비밀번호 자릿수 표시등 */}
                <div className="flex justify-center space-x-4 mt-3">
                  <div className={`w-4 h-4 rounded-full border-2 border-amber-800 transition-all duration-200 ${enteredDigits.length >= 1 ? 'bg-amber-800 scale-110' : 'bg-transparent'}`}></div>
                  <div className={`w-4 h-4 rounded-full border-2 border-amber-800 transition-all duration-200 ${enteredDigits.length >= 2 ? 'bg-amber-800 scale-110' : 'bg-transparent'}`}></div>
                </div>
              </div>

              {/* 키패드 그리드 */}
              <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    onClick={() => handleDigitClick(num.toString())}
                    className="h-14 rounded-2xl bg-white/80 active:bg-amber-200 text-xl font-bold text-amber-900 shadow-sm flex items-center justify-center transition-all duration-100 active:scale-95"
                  >
                    {num}
                  </button>
                ))}
                
                {/* 빈 자리 / 패스코드 노출 여부 토글 */}
                <button 
                  onClick={() => setIsPasscodeVisible(!isPasscodeVisible)}
                  className="h-14 rounded-2xl text-amber-800 flex items-center justify-center text-sm font-semibold hover:bg-amber-200/50"
                >
                  {isPasscodeVisible ? <EyeOff size={20} /> : <Eye size={20} />}
                  <span className="ml-1 text-xs">{isPasscodeVisible ? "숨기기" : "보기"}</span>
                </button>
                
                {/* 0번 */}
                <button
                  onClick={() => handleDigitClick('0')}
                  className="h-14 rounded-2xl bg-white/80 active:bg-amber-200 text-xl font-bold text-amber-900 shadow-sm flex items-center justify-center transition-all duration-100 active:scale-95"
                >
                  0
                </button>
                
                {/* 백스페이스 */}
                <button
                  onClick={handleBackspace}
                  className="h-14 rounded-2xl text-amber-800 flex items-center justify-center font-bold active:bg-amber-200/50"
                >
                  지우기
                </button>
              </div>

              {/* 화면에 임시 입력된 숫자 보여주기 (토글되었을 때만) */}
              {isPasscodeVisible && (
                <div className="text-center mt-2 text-sm text-amber-900 font-mono tracking-wider">
                  입력 중: {enteredDigits || "(없음)"}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================= */}
        {/* 2. 메인 콘텐츠 앱 레이아웃 */}
        {/* ======================================= */}
        {/* 헤더 영역 */}
        <header className="sticky top-0 bg-[#FFFDF9] border-b border-amber-900/10 px-5 py-4 flex items-center justify-between z-30">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-amber-800 flex items-center justify-center text-white shadow-sm">
              <span className="text-xs font-bold font-serif">성</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-amber-950 font-serif">하루 성찰</h1>
              <p className="text-[10px] text-amber-800/80 -mt-0.5">매일 더 성숙해지는 나의 기록</p>
            </div>
          </div>
          
          {/* 간편 로그인 아웃 (잠금 테스트용) */}
          <button
            onClick={() => {
              setIsLocked(true);
              setEnteredDigits('');
            }}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-semibold transition"
          >
            <Lock size={12} />
            <span>잠그기</span>
          </button>
        </header>

        {/* 본문 스크롤 영역 */}
        <main className={`flex-1 overflow-y-auto px-5 py-4 pb-24 ${getFontSizeClass()}`} style={{ fontSize: getFontSizeStyles().body }}>

          {/* 저장 실패 알림 (조용히 사라지면 일기가 사라지므로 화면에 남깁니다) */}
          {storageError && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3">
              <div className="flex items-start space-x-2">
                <AlertTriangle size={16} className="mt-0.5 text-red-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-red-700">{storageError.message}</p>
                  <p className="text-[11px] text-red-600 mt-1 leading-relaxed">
                    방금 적은 내용이 저장되지 않았을 수 있습니다. 지금 백업 파일을 받아 두면 기록을 잃지 않습니다.
                  </p>
                  <button
                    onClick={handleExportBackup}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold flex items-center space-x-1"
                  >
                    <Download size={12} />
                    <span>지금 백업 파일 받기</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* ======================================= */}
          {/* 탭 1: 일기 쓰기 화면 */}
          {/* ======================================= */}
          {activeTab === 'diary' && (
            <div className="space-y-5 animate-fadeIn">
              
              {/* 날짜 선택 인터페이스 */}
              <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-4 shadow-sm flex flex-col items-center">
                <span className="text-xs font-semibold text-amber-800/70 uppercase tracking-widest mb-1">성찰할 날짜 선택</span>
                
                <div className="flex items-center justify-between w-full">
                  {/* 이전 날짜 버튼 */}
                  <button 
                    onClick={() => setSelectedDate(addDaysISO(selectedDate, -1))}
                    className="p-1.5 rounded-full hover:bg-amber-200 text-amber-900 transition"
                  >
                    <ChevronLeft size={20} />
                  </button>

                  {/* 날짜 및 달력 보기 유도 버튼 */}
                  <button 
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white hover:bg-amber-100 border border-amber-200 text-amber-950 font-bold transition shadow-sm"
                  >
                    <Calendar size={18} className="text-amber-800" />
                    <span>{formatKoreanDate(selectedDate)}</span>
                  </button>

                  {/* 다음 날짜 버튼 */}
                  <button 
                    onClick={() => setSelectedDate(addDaysISO(selectedDate, 1))}
                    className="p-1.5 rounded-full hover:bg-amber-200 text-amber-900 transition"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>

                {/* 숨겨진 듯 나타나는 세련된 기본 달력 인풋 */}
                {showDatePicker && (
                  <div className="mt-3 w-full animate-slideDown">
                    <input 
                      type="date"
                      value={selectedDate}
                      onChange={(e) => {
                        setSelectedDate(e.target.value);
                        setShowDatePicker(false);
                      }}
                      className="w-full px-4 py-2.5 rounded-xl border border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 text-amber-950 text-center font-semibold bg-white cursor-pointer"
                    />
                    <p className="text-[11px] text-amber-700/80 text-center mt-1">날짜를 선택하고 아래에서 일기 및 오늘 계획을 확인하세요.</p>
                  </div>
                )}
              </div>

              {/* 오늘의 루틴/계획 체크리스트 영역 */}
              <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-amber-950 flex items-center space-x-1.5">
                    <CheckSquare size={18} className="text-amber-700" />
                    <span>오늘의 실천 계획</span>
                  </h3>
                  <span className="text-[11px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md font-semibold">
                    {activeRoutinesToday.length}개 활성화
                  </span>
                </div>

                {activeRoutinesToday.length === 0 ? (
                  <div className="text-center py-5 bg-amber-50/40 rounded-xl border border-dashed border-amber-200">
                    <p className="text-xs text-amber-700">오늘 일정에 등록된 계획이 없습니다.</p>
                    <button 
                      onClick={() => setActiveTab('routine')}
                      className="mt-2 text-xs font-bold text-amber-800 hover:underline inline-flex items-center"
                    >
                      <span>새 계획 작성하기</span>
                      <Plus size={12} className="ml-0.5" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeRoutinesToday.map((routine) => {
                      const isDone = completedRoutinesToday.includes(routine.id);
                      return (
                        <div 
                          key={routine.id}
                          onClick={() => toggleRoutineComplete(routine.id)}
                          className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                            isDone 
                              ? 'bg-amber-100/50 border-amber-300/80 opacity-70' 
                              : 'bg-amber-50/30 border-amber-100 hover:bg-amber-100/30'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <input 
                              type="checkbox"
                              checked={isDone}
                              onChange={() => {}} // 부모의 onClick에서 일괄 처리
                              className="w-5 h-5 rounded text-amber-700 focus:ring-amber-500 cursor-pointer"
                            />
                            <span className={`font-semibold ${isDone ? 'line-through text-amber-600' : 'text-amber-950'}`}>
                              {routine.name}
                            </span>
                          </div>
                          <span className="text-[10px] text-amber-800 bg-white border border-amber-200 px-2 py-0.5 rounded-full">
                            기한내
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 일기 본문 작성 Area */}
              <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-sm space-y-3">
                <h3 className="font-bold text-amber-950 flex items-center space-x-1.5 border-b border-amber-50 pb-2">
                  <BookOpen size={18} className="text-amber-700" />
                  <span>오늘의 성찰 일기</span>
                </h3>

                <textarea
                  value={currentDiaryText}
                  onChange={handleDiaryTextChange}
                  placeholder="오늘 하루는 어떠셨나요? 나를 되돌아보고, 고마웠던 순간이나 아쉬웠던 성찰을 이곳에 솔직히 기록해 보세요..."
                  rows={8}
                  className="w-full bg-[#FCFBF8] border border-amber-100/80 rounded-xl p-3.5 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 text-amber-950 font-serif leading-relaxed placeholder-amber-900/30 resize-none"
                  style={{ fontSize: getFontSizeStyles().body }}
                />
              </div>

              {/* 사진 첨부 영역 (최대 2장) */}
              <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-amber-950 flex items-center space-x-1.5">
                    <Camera size={18} className="text-amber-700" />
                    <span>오늘의 사진 기록 ({currentDiaryImages.length}/2)</span>
                  </h3>
                  
                  {currentDiaryImages.length < 2 && (
                    <button
                      onClick={triggerPhotoUpload}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold flex items-center space-x-1 transition shadow-sm"
                    >
                      <Plus size={14} />
                      <span>사진 추가</span>
                    </button>
                  )}
                </div>

                {/* 숨겨진 오리지널 파일 인풋 */}
                <input 
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoChange}
                  accept="image/*"
                  multiple
                  className="hidden"
                />

                {currentDiaryImages.length === 0 ? (
                  <div 
                    onClick={triggerPhotoUpload}
                    className="border-2 border-dashed border-amber-200 hover:border-amber-400 rounded-xl py-6 flex flex-col items-center justify-center cursor-pointer bg-amber-50/20 hover:bg-amber-50/50 transition"
                  >
                    <Camera size={32} className="text-amber-400 mb-2" />
                    <p className="text-xs text-amber-800">오늘 기억하고 싶은 순간의 사진을 올려주세요.</p>
                    <p className="text-[10px] text-amber-600/70 mt-1">최대 2장까지 등록 가능합니다.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {currentDiaryImages.map((img, idx) => (
                      <div key={idx} className="relative group rounded-xl overflow-hidden shadow-inner border border-amber-100 aspect-video bg-amber-50 flex items-center justify-center">
                        <img 
                          src={img} 
                          alt={`오늘의 사진 ${idx + 1}`} 
                          className="w-full h-full object-cover" 
                        />
                        {/* 이미지 삭제 오버레이 */}
                        <button
                          onClick={() => deletePhoto(idx)}
                          className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-red-600 text-white rounded-full transition"
                          title="사진 삭제"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ======================================= */}
          {/* 탭 2: 나의 계획 (루틴) 관리 화면 */}
          {/* ======================================= */}
          {activeTab === 'routine' && (
            <div className="space-y-5 animate-fadeIn">
              
              {/* 타이틀 및 소개 */}
              <div className="bg-amber-900/5 text-amber-900 p-4 rounded-2xl border border-amber-900/10">
                <h3 className="font-bold text-base flex items-center space-x-1.5">
                  <CheckSquare size={18} />
                  <span>나의 실천 계획 세우기 (최대 5개)</span>
                </h3>
                <p className="text-xs mt-1.5 leading-relaxed text-amber-800">
                  팔굽혀 펴기 100개, 매일 책 읽기 등 나를 성장시킬 소소한 습관들을 기간별로 등록해보세요. 
                  등록하신 기간 동안 해당 날짜의 다이어리 페이지 하단에 체크리스트 형태로 노출됩니다.
                </p>
              </div>

              {/* 신규 계획 추가 폼 */}
              {routines.length < 5 ? (
                <form onSubmit={handleAddRoutine} className="bg-white border border-amber-100 rounded-2xl p-4 shadow-sm space-y-4">
                  <div className="flex items-center space-x-1 border-b border-amber-50 pb-2">
                    <PlusCircle size={16} className="text-amber-700" />
                    <span className="font-bold text-amber-950 text-sm">새로운 성찰 계획 등록</span>
                  </div>

                  {/* 계획 명 */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-amber-900">계획명 (예: 팔굽혀 펴기 100개)</label>
                    <input 
                      type="text"
                      value={newRoutineName}
                      onChange={(e) => setNewRoutineName(e.target.value)}
                      placeholder="계획을 구체적으로 입력하세요"
                      maxLength={30}
                      className="w-full px-3 py-2 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-amber-950 text-sm bg-[#FCFBF8]"
                    />
                  </div>

                  {/* 기간 선택 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-amber-900">시작 날짜</label>
                      <input 
                        type="date"
                        value={newRoutineStart}
                        onChange={(e) => setNewRoutineStart(e.target.value)}
                        className="w-full px-3 py-2 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-amber-950 text-xs bg-[#FCFBF8]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-amber-900">종료 날짜</label>
                      <input 
                        type="date"
                        value={newRoutineEnd}
                        onChange={(e) => setNewRoutineEnd(e.target.value)}
                        className="w-full px-3 py-2 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-amber-950 text-xs bg-[#FCFBF8]"
                      />
                    </div>
                  </div>

                  {/* 등록 버튼 */}
                  <button
                    type="submit"
                    disabled={!newRoutineName.trim()}
                    className={`w-full py-2.5 rounded-xl text-white font-bold text-sm shadow transition duration-150 ${
                      newRoutineName.trim() 
                        ? 'bg-amber-700 hover:bg-amber-800 active:scale-95' 
                        : 'bg-amber-200 cursor-not-allowed'
                    }`}
                  >
                    계획 등록하기 ({routines.length}/5)
                  </button>
                </form>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
                  <p className="text-xs text-red-800 font-bold">⚠️ 계획은 최대 5개까지만 등록할 수 있습니다.</p>
                  <p className="text-[11px] text-red-600 mt-1">새 계획을 추가하기 전에 아래 리스트에서 불필요한 계획을 삭제해 주세요.</p>
                </div>
              )}

              {/* 현재 계획 목록 */}
              <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-sm space-y-3">
                <h4 className="font-bold text-amber-950 text-sm border-b border-amber-50 pb-2">
                  작성된 계획 목록 ({routines.length}/5)
                </h4>

                {routines.length === 0 ? (
                  <p className="text-xs text-center py-8 text-amber-600/70">등록된 성찰 계획이 없습니다. 첫 번째 계획을 등록해 보세요!</p>
                ) : (
                  <div className="space-y-3">
                    {routines.map((routine) => (
                      <div 
                        key={routine.id}
                        className="p-3 bg-[#FCFBF8] border border-amber-200/50 rounded-xl flex items-center justify-between"
                      >
                        <div>
                          <p className="font-bold text-amber-950 text-sm">{routine.name}</p>
                          <p className="text-[11px] text-amber-800/80 mt-1 font-mono">
                            기간: {routine.startDate} ~ {routine.endDate}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteRoutine(routine.id)}
                          className="p-2 hover:bg-red-50 text-amber-700 hover:text-red-600 rounded-lg transition"
                          title="계획 삭제"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ======================================= */}
          {/* 탭 3: 다이어리 설정 (글씨크기, 비밀번호, 배경화면) */}
          {/* ======================================= */}
          {activeTab === 'settings' && (
            <div className="space-y-5 animate-fadeIn">
              
              {/* 1. 글자 크기 설정 영역 */}
              <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-sm space-y-3">
                <h3 className="font-bold text-amber-950 text-sm flex items-center space-x-1.5 border-b border-amber-50 pb-2">
                  <Type size={16} className="text-amber-700" />
                  <span>글씨 크기 설정</span>
                </h3>
                <p className="text-xs text-amber-800 leading-relaxed">
                  눈이 피로하거나 글자가 너무 작게 느껴지신다면 원하시는 폰트 스케일로 맞춤 설정해 보세요.
                </p>

                <div className="grid grid-cols-4 gap-2 pt-2">
                  {[
                    { key: 'sm', name: '작게 (가-)' },
                    { key: 'base', name: '기본 (가)' },
                    { key: 'lg', name: '크게 (가+)' },
                    { key: 'xl', name: '가장 크게 (가++)' }
                  ].map((sizeItem) => (
                    <button
                      key={sizeItem.key}
                      onClick={() => setFontSize(sizeItem.key)}
                      className={`py-2 px-1 rounded-xl text-xs font-bold border transition ${
                        fontSize === sizeItem.key 
                          ? 'bg-amber-700 text-white border-amber-700' 
                          : 'bg-[#FCFBF8] text-amber-900 border-amber-200/80 hover:bg-amber-50'
                      }`}
                    >
                      {sizeItem.name}
                    </button>
                  ))}
                </div>

                {/* 실시간 텍스트 크기 맛보기 */}
                <div className="mt-3 p-3 bg-amber-50/50 rounded-xl text-center">
                  <p className="text-[10px] text-amber-700 font-bold mb-1">글자 크기 견본</p>
                  <p className={`font-serif text-amber-950 ${getFontSizeClass()}`}>
                    아름다운 가을날, 키다리 아저씨의 따뜻한 시선과 함께 성찰합니다.
                  </p>
                </div>
              </div>

              {/* 2. 비밀번호 변경 설정 영역 */}
              <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-sm space-y-3">
                <h3 className="font-bold text-amber-950 text-sm flex items-center space-x-1.5 border-b border-amber-50 pb-2">
                  <Lock size={16} className="text-amber-700" />
                  <span>진입 비밀번호 변경</span>
                </h3>
                
                <form onSubmit={handleChangePasscode} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">현재 비밀번호</label>
                    <input 
                      type="password"
                      maxLength={2}
                      placeholder="숫자 2자리"
                      value={currentPassInput}
                      onChange={(e) => setCurrentPassInput(e.target.value)}
                      className="w-full px-3 py-2 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-amber-950 text-xs font-mono text-center tracking-widest bg-[#FCFBF8]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-amber-900 mb-1">새 비밀번호</label>
                      <input 
                        type="password"
                        maxLength={2}
                        placeholder="숫자 2자리"
                        value={newPassInput}
                        onChange={(e) => setNewPassInput(e.target.value)}
                        className="w-full px-3 py-2 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-amber-950 text-xs font-mono text-center tracking-widest bg-[#FCFBF8]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-amber-900 mb-1">새 비밀번호 확인</label>
                      <input 
                        type="password"
                        maxLength={2}
                        placeholder="숫자 2자리"
                        value={newPassInputConfirm}
                        onChange={(e) => setNewPassInputConfirm(e.target.value)}
                        className="w-full px-3 py-2 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-amber-950 text-xs font-mono text-center tracking-widest bg-[#FCFBF8]"
                      />
                    </div>
                  </div>

                  {passChangeMessage.text && (
                    <div className={`p-2 rounded-lg text-center text-xs font-semibold ${
                      passChangeMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}>
                      {passChangeMessage.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl text-xs shadow transition active:scale-95"
                  >
                    비밀번호 안전하게 바꾸기
                  </button>
                </form>
              </div>

              {/* 3. 첫 화면 커버 이미지 변경 영역 (AI 생성 기능 탑재) */}
              <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-sm space-y-3">
                <h3 className="font-bold text-amber-950 text-sm flex items-center space-x-1.5 border-b border-amber-50 pb-2">
                  <Sparkles size={16} className="text-amber-700" />
                  <span>잠금 화면 배경 최적화</span>
                </h3>
                
                <p className="text-xs text-amber-800 leading-relaxed">
                  키다리 아저씨 테마 외에도 내가 원하는 <strong>나만의 성찰 분위기</strong>를 인공지능이 즉시 그려줍니다. (Imagen 4.0 모델 기반)
                </p>

                {/* 현재 이미지 미니 뷰 */}
                <div className="relative h-28 rounded-xl overflow-hidden border border-amber-200 bg-amber-50/50 flex items-center justify-center">
                  {coverImage === 'default' ? (
                    <span className="text-xs text-amber-700/80 font-bold">현재 상태: 기본 키다리 아저씨 일러스트</span>
                  ) : (
                    <>
                      <img src={coverImage} alt="현재 커버 미리보기" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="text-white text-xs font-bold bg-amber-900/80 px-2 py-1 rounded">커스텀 배경 활성 중</span>
                      </div>
                    </>
                  )}
                </div>

                {/* AI 프롬프트 생성 인풋 */}
                <div className="space-y-2">
                  <textarea 
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    rows={2}
                    placeholder="생성하고 싶은 이미지의 묘사를 자유롭게 써주세요 (한국어/영어 모두 가능)"
                    className="w-full p-2 text-xs border border-amber-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-amber-950 bg-[#FCFBF8] resize-none"
                  />

                  {/* 신속 프리셋 제안 */}
                  <div className="flex flex-wrap gap-1">
                    {[
                      '고요한 아침의 햇살 가득한 서재',
                      '밤하늘의 별빛을 바라보며 사색하는 키다리아저씨',
                      '숲 속 조용한 오두막집과 차 한 잔의 여유',
                      '따뜻한 등불이 밝혀진 겨울밤 길목'
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAiPrompt(preset + ', 따뜻하고 감성적인 파스텔 일러스트')}
                        className="text-[10px] bg-amber-50 hover:bg-amber-100 text-amber-900 px-2 py-1 rounded border border-amber-200/50"
                      >
                        #{preset.slice(0, 10)}...
                      </button>
                    ))}
                  </div>

                  {imageError && (
                    <p className="text-xs text-red-600 font-semibold text-center mt-1">{imageError}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={generateAIImage}
                      disabled={isGeneratingImage}
                      className="py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-200 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow transition"
                    >
                      {isGeneratingImage ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>AI 그리는 중...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} />
                          <span>나만의 AI배경 생성</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleResetCover}
                      disabled={isGeneratingImage}
                      className="py-2.5 bg-amber-100 hover:bg-amber-200 disabled:opacity-50 text-amber-900 font-bold rounded-xl text-xs transition border border-amber-300"
                    >
                      기본 이미지 환원
                    </button>
                  </div>
                </div>
              </div>

              {/* 4. 기록 백업과 복원 */}
              <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-sm space-y-3">
                <h3 className="font-bold text-amber-950 text-sm flex items-center space-x-1.5 border-b border-amber-50 pb-2">
                  <Download size={16} className="text-amber-700" />
                  <span>기록 백업과 복원</span>
                </h3>

                <p className="text-xs text-amber-800 leading-relaxed">
                  일기는 이 폰의 브라우저 안에만 저장됩니다. 폰을 바꾸거나 브라우저 기록을 지우면 함께 사라지니,
                  가끔 <strong>백업 파일</strong>을 내려받아 드라이브·메일 같은 안전한 곳에 보관해 주세요.
                </p>

                {/* 저장 공간 사용량 */}
                <div className="rounded-xl bg-amber-50/60 border border-amber-200/60 p-3">
                  <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                    <span>저장 공간</span>
                    <span className="font-mono">
                      {formatBytes(usedBytes)} / 약 {formatBytes(STORAGE_LIMIT_BYTES)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-amber-200/70 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        usedRatio > 0.8 ? 'bg-red-500' : usedRatio > 0.6 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.max(2, Math.round(usedRatio * 100))}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-amber-700/80 leading-relaxed">
                    일기 {countEntries(diaries)}편 · 사진 {photoCount}장 저장됨
                    {usedRatio > 0.8 && ' · 거의 가득 찼습니다. 백업을 받아 두고 오래된 사진을 정리해 주세요.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleExportBackup}
                    className="py-2.5 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow transition active:scale-95"
                  >
                    <Download size={14} />
                    <span>백업 내려받기</span>
                  </button>
                  <button
                    onClick={() => importInputRef.current && importInputRef.current.click()}
                    className="py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 border border-amber-300 transition active:scale-95"
                  >
                    <Upload size={14} />
                    <span>백업 불러오기</span>
                  </button>
                </div>

                <input
                  type="file"
                  ref={importInputRef}
                  onChange={handleImportBackup}
                  accept="application/json,.json"
                  className="hidden"
                />

                {backupMessage.text && (
                  <div className={`p-2 rounded-lg text-[11px] font-semibold leading-relaxed ${
                    backupMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {backupMessage.text}
                  </div>
                )}

                <p className="text-[10px] text-amber-800/70 leading-relaxed">
                  내려받은 파일은 폰의 ‘다운로드’ 폴더에 저장됩니다. 불러오면 지금 기록에 날짜별로 합쳐지고,
                  지금 기록이 지워지지는 않습니다.
                  {lastBackupAt && ` (마지막 백업: ${new Date(lastBackupAt).toLocaleDateString('ko-KR')})`}
                </p>
              </div>

              {/* 하단 저작권 정보 */}
              <div className="text-center text-[10px] text-amber-800/60 pt-2 pb-6">
                <p>© 2026 하루 성찰 다이어리. All rights reserved.</p>
                <p>본 앱은 모바일 해상도에 완벽 대응하는 반응형 다이어리 앱입니다.</p>
              </div>

            </div>
          )}

        </main>

        {/* ======================================= */}
        {/* 3. 모바일 하단 내비게이션 바 */}
        {/* ======================================= */}
        {!isLocked && (
          <nav className="absolute bottom-0 left-0 right-0 bg-[#FFFDF9] border-t border-amber-900/10 px-6 py-2.5 flex justify-between items-center z-40 rounded-t-2xl shadow-lg">
            
            {/* 성찰 일기장 탭 버튼 */}
            <button
              onClick={() => setActiveTab('diary')}
              className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-xl transition ${
                activeTab === 'diary' ? 'text-amber-900 font-bold scale-105' : 'text-amber-900/50 hover:text-amber-900/80'
              }`}
            >
              <BookOpen size={20} className={activeTab === 'diary' ? 'stroke-[2.5px]' : 'stroke-[1.8px]'} />
              <span className="text-[11px]">일기 쓰기</span>
            </button>

            {/* 나의 계획 탭 버튼 */}
            <button
              onClick={() => setActiveTab('routine')}
              className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-xl transition ${
                activeTab === 'routine' ? 'text-amber-900 font-bold scale-105' : 'text-amber-900/50 hover:text-amber-900/80'
              }`}
            >
              <CheckSquare size={20} className={activeTab === 'routine' ? 'stroke-[2.5px]' : 'stroke-[1.8px]'} />
              <span className="text-[11px]">나의 계획 ({routines.length})</span>
            </button>

            {/* 환경설정 탭 버튼 */}
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-xl transition ${
                activeTab === 'settings' ? 'text-amber-900 font-bold scale-105' : 'text-amber-900/50 hover:text-amber-900/80'
              }`}
            >
              <Settings size={20} className={activeTab === 'settings' ? 'stroke-[2.5px]' : 'stroke-[1.8px]'} />
              <span className="text-[11px]">환경 설정</span>
            </button>

          </nav>
        )}

      </div>
    </div>
  );
}