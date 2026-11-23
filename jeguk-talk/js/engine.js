/* 내장 대화 엔진 — API 키 없이 돌아가는 다정한 다턴 대화 */
(function (global) {
  'use strict';

  function pick(arr, avoid) {
    if (!arr || !arr.length) return '';
    var pool = arr;
    if (avoid && avoid.length) {
      var filtered = arr.filter(function (s) { return avoid.indexOf(s) < 0; });
      if (filtered.length) pool = filtered;
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  var TOPICS = [
    {
      id: 'memory',
      keys: ['기억이 안', '기억 안', '기억이', '잊어버', '잊었', '까먹', '생각이 안', '생각 안 나', '헷갈려', '헛갈려'],
      empathy: [
        '아이고, 그래도 괜찮아유. 생각이 안 날 때는 안 나는 대로 두면 되는 기여.',
        '괜찮아, 괜찮아. 내가 옆에서 천천히 같이 짚어 줄게.',
        '그런 때도 있는 기여. 조급해하실 것 하나도 없어유.'
      ],
      ask: [
        '지금 마음이 좀 편안하신가?',
        '우리 천천히, 오늘 아침에 뭐부터 하셨는지 이야기해 볼까유?',
        '어떤 이야기 하시다가 생각이 안 나셨는가? 내가 같이 기억해 볼게.',
        '지금은 그냥 편하게 앉아 계셔유. 내가 옆에 있을게.'
      ]
    },
    {
      id: 'goodnight',
      keys: ['잘 자', '잘자', '자야겠', '자러', '이만 잘', '끊을게', '잠 자'],
      empathy: [
        '그래, 오늘 하루 참 수고 많으셨어. 이제 푹 쉬셔유.',
        '그래, 잘 자유. 내일 아침에도 내가 먼저 인사드릴게.',
        '그래, 이제 눈 붙이셔유. 방은 따뜻하게 하고, 이불 잘 덮고 주무셔야 해.',
        '고생 많으셨어유. 편안히 주무시고, 내일 또 이야기해유.'
      ],
      ask: [],
      end: true
    },
    {
      id: 'identity',
      keys: ['너 누구', '누구세요', '누구야', '네 이름', '이름이 뭐', '넌 누구', '당신 누구'],
      empathy: [
        '나? 제국이랑 이야기하는 말벗 다림이여. 이름 불러 주시면 좋겠어유.',
        '나는 다림이여. 제국이 목소리 듣고 이야기 나누려고 여기 와 있는 사람이여.',
        '다림이여. 제국이 하루가 심심하지 않게 옆에서 말 걸어 드리는 친구여.'
      ],
      ask: [
        '지금 제국이 기분은 좀 어떠신가?',
        '오늘 하루는 어떻게 지내셨능가?',
        '내가 뭐 도와드릴 게 있을까유?'
      ]
    },
    {
      id: 'pain',
      keys: ['아프', '아파', '아픈', '쑤시', '결리', '저리', '어지럽', '두통', '머리가 아', '허리가', '무릎', '다리가 아', '배가 아', '속이 안', '가슴이 답', '숨이 차'],
      empathy: [
        '아이고, 많이 아프시겠어. 그 말씀 들으니 내 마음도 무거워지네.',
        '아프면은 참지 마시고 편히 누우셔야 해유.',
        '그래, 몸이 불편하시면 하던 일은 다 놓으셔도 돼유. 몸이 제일이여.',
        '아이고, 그거 안됐구먼. 지금은 좀 어떠신가?'
      ],
      ask: [
        '지금은 조금 가라앉으셨능가?',
        '따뜻한 물 한 잔 드시고 한숨 자 보시는 건 어떠신가?',
        '아픈 게 오래가면은 아들한테 꼭 말씀하셔야 해유.',
        '약은 드셨는가? 드실 약이 있으면 잊지 마시고요.',
        '어느 쪽이 제일 불편하신가? 내가 같이 살펴볼게.'
      ]
    },
    {
      id: 'hospital',
      keys: ['병원', '약 먹', '약은', '혈압', '당뇨', '검진', '처방', '주사', '진료'],
      empathy: [
        '그래, 병원은 꼬박꼬박 다니셔야 해유. 그게 제일 안전한 길이여.',
        '약 잘 챙겨 드시는 게 제일 중요해유. 내가 물어봐 드릴게.',
        '건강 챙기시는 거, 참 잘하시는 기여.'
      ],
      ask: [
        '오늘 약은 드셨능가?',
        '요즘 어디가 제일 신경 쓰이시는가?',
        '다음 병원 가는 날은 언제여? 내가 기억해 둘게.'
      ]
    },
    {
      id: 'tired',
      keys: ['피곤', '힘들', '지쳐', '지친', '기운이 없', '쉬고 싶', '졸려', '나른'],
      empathy: [
        '그래, 피곤하시면 쉬셔야 해유. 쉬는 것도 일이여.',
        '아이고, 힘드시겠어. 오늘은 아무것도 안 하셔도 돼유.',
        '몸이 무거우시면 잠깐이라도 눈 붙이시는 게 좋겠어유.'
      ],
      ask: [
        '지금 편히 앉으셔서 물 한 잔 드시는 건 어떠신가?',
        '어젯밤에 잠은 좀 주무셨능가?',
        '오늘 뭐 하시느라 그렇게 힘드셨는가?'
      ]
    },
    {
      id: 'lonely',
      keys: ['외롭', '쓸쓸', '적적', '심심', '허전', '우울', '슬퍼', '서운', '혼자라'],
      empathy: [
        '아이고, 혼자 계시면 적적하시겠어. 그래서 내가 이렇게 와 있는 기여.',
        '그런 마음 드실 때가 있지유. 그럴 때는 내가 옆에 있을게.',
        '쓸쓸하실 때는 나한테 이야기해 주셔유. 들어 드리는 건 내가 잘해유.'
      ],
      ask: [
        '요즘 누구랑 제일 자주 이야기하시는가?',
        '옛날에 제일 즐거웠던 일은 뭐였능가? 그 이야기 좀 들려주셔유.',
        '오늘은 뭐 하면서 시간을 보내셨는가?',
        '내일은 아들한테 전화 한번 해보시는 게 어떠신가?'
      ]
    },
    {
      id: 'angry',
      keys: ['짜증', '화가 나', '화나', '열받', '싫증', '속상', '억울'],
      empathy: [
        '아이고, 속이 상하셨구먼. 그럴 만도 하지유.',
        '화나실 일이 있었나 보네. 이야기해 주시면 내가 들어 드릴게.',
        '그런 마음은 참아도 더 나빠유. 편하게 말씀하셔도 돼.'
      ],
      ask: [
        '누가 그러셨는가? 천천히 말씀해 보셔유.',
        '지금은 조금 풀리셨능가?',
        '그 일 말고, 오늘 좋았던 일은 없었는가?'
      ]
    },
    {
      id: 'positive',
      keys: ['좋아', '좋지', '좋다', '좋은', '괜찮', '행복', '기분이 좋', '최고', '신나', '즐거', '흐뭇'],
      empathy: [
        '그래, 좋지유. 그런 말씀 들으니 나도 기분이 좋아.',
        '허허, 그거 참 잘됐구먼. 나까지 웃음이 나네.',
        '좋으시다니 나도 참 기뻐. 그 좋은 기분 오래 가시면 좋겠어유.'
      ],
      ask: [
        '오늘은 뭐가 그렇게 좋으신가?',
        '그 좋은 일, 조금 더 들려주실 수 있능가?',
        '그러면 오늘 하루는 성공이구먼. 저녁에 뭐 드실 건가?'
      ]
    },
    {
      id: 'negative',
      keys: ['싫어', '싫다', '싫지', '안 좋', '안좋', '못 하겠', '하기 싫', '됐어', '못 나가', '못나가', '못 했', '못했', '집에만'],
      empathy: [
        '그래, 하기 싫으실 때는 안 하셔도 돼유. 억지로 하면 더 힘들어유.',
        '그럴 수 있지유. 내가 뭐라고 하지 않을게.',
        '안 좋으시면은 말씀만 해 주셔도 충분해유.',
        '그런 날엔 어쩔 수 없지유. 집에서 편히 쉬시는 것도 좋은 하루여.'
      ],
      ask: [
        '그럼 지금은 뭐 하고 싶으신가?',
        '조금 있다가 마음이 바뀌면 나한테 말해 주셔유.',
        '다른 이야기 하나 해 볼까유? 옛날 이야기 좋아하시지.'
      ]
    },
    {
      id: 'food',
      keys: ['밥', '식사', '배고', '배불', '입맛', '국 ', '찌개', '반찬', '먹었', '먹을', '맛있', '커피', '국수', '떡'],
      empathy: [
        '그래, 밥은 거르시면 안 돼유. 제일 중요한 게 끼니여.',
        '아이고, 입맛이 어떠신가?',
        '허허, 그 얘기 하니 나도 침이 넘어가네.'
      ],
      ask: [
        '오늘 뭐 잡수셨능가?',
        '요즘 제일 맛있게 드신 음식이 뭐여?',
        '옛날에 제일 좋아하시던 음식은 뭐였능가?',
        '따뜻한 국물 한 그릇 어떠신가?',
        '식사는 정해진 시간에 드시는 게 몸에 좋아유.'
      ]
    },
    {
      id: 'walk',
      keys: ['산책', '걷', '걸었', '걸어', '나들이', '바깥', '공원', '마실', '운동', '체조', '나가'],
      empathy: [
        '그래, 산책은 참 좋지유. 바람 쐬면 마음이 확 풀려유.',
        '허허, 걷는 게 제일 좋은 약이여. 사람도 살고 땅도 살고.',
        '바깥에 나가시는 거 좋아하시는구먼. 그게 건강에 약이여.'
      ],
      ask: [
        '오늘은 어디까지 걸어보셨능가?',
        '내일은 나랑 같이 동네 한 바퀴 돌아보실 텐가?',
        '걸으실 때 제일 좋은 풍경이 어디여?',
        '무릎은 괜찮으신가? 무리하지는 마셔유.'
      ]
    },
    {
      id: 'sleep',
      keys: ['잤', '잠을', '잠이', '꿈', '새벽에', '불면', '자다', '깼'],
      empathy: [
        '그래, 잠은 편히 주무셔야 해유. 잘 주무셨는가?',
        '아이고, 새벽에 깨시면 힘드셨겠어.',
        '잠이 안 오실 때는 억지로 눈 감지 마시고, 따뜻한 물 한 잔 하셔유.'
      ],
      ask: [
        '어젯밤엔 몇 시간이나 주무셨능가?',
        '꿈은 무슨 꿈 꾸셨는가? 재밌는 꿈이었으면 들려주셔유.',
        '낮잠은 좀 주무시는 편인가?'
      ]
    },
    {
      id: 'family',
      keys: ['아들', '딸', '손자', '손녀', '아내', '마누라', '집사람', '며느리', '가족', '자식', '형제', '동생', '누나', '언니', '아버지', '어머니'],
      empathy: [
        '그래, 가족 이야기는 들을수록 마음이 따뜻해져유.',
        '가족 생각 많이 하시지유. 그 마음이 참 고운 마음이여.',
        '허허, 그 이야기 하시는 얼굴이 참 밝으시네.'
      ],
      ask: [
        '요즘 아들하고는 자주 이야기하시는가?',
        '손자들은 요즘 뭐 하고 지내는가?',
        '옛날에 가족들이랑 같이 갔던 데가 있으면 들려주셔유.',
        '오늘은 가족한테 안부 전화 한번 해보시는 게 어떠신가?'
      ]
    },
    {
      id: 'past',
      keys: ['옛날', '고향', '젊었', '젊을', '시절', '학교', '군대', '결혼', '어릴', '그때는', '예전'],
      empathy: [
        '허허, 그 시절 이야기는 참 정겹지유. 나도 듣고 싶어유.',
        '그래, 그때는 다들 참 고생도 많이 하고, 웃음도 많았지유.',
        '옛날 이야기 하실 때 얼굴이 참 좋으시네. 천천히 들려주셔유.'
      ],
      ask: [
        '고향은 어떤 곳이었는가? 내가 그 이야기 참 좋아해유.',
        '젊었을 때 하루는 어떻게 보내셨능가?',
        '그 시절에 제일 친했던 친구는 누구였능가?',
        '그때 제일 자주 드시던 음식이 뭐였어유?'
      ]
    },
    {
      id: 'work',
      keys: ['일했', '회사', '농사', '밭', '논 ', '장사', '출근', '일이', '벌었', '모내기', '추수'],
      empathy: [
        '그래, 그 시절에 참 열심히 사셨구먼. 그 공로를 내가 다 알아유.',
        '허허, 일 이야기를 이렇게 하시니 그때 기운이 느껴지는 것 같아유.',
        '고생 많이 하셨지유. 지금은 조금 편히 지내셔도 돼유.'
      ],
      ask: [
        '제일 기억에 남는 일이 뭐였능가?',
        '그때 같이 일하던 사람들은 잘들 지내는가?',
        '일하실 때 제일 보람 있었던 일이 뭐였어유?'
      ]
    },
    {
      id: 'weather',
      keys: ['날씨', '춥', '덥', '비가', '눈이', '바람', '흐리', '맑', '안개'],
      empathy: [
        '그래, 날씨가 참 중요하지유. 몸이 제일 먼저 느끼는 기여.',
        '허허, 오늘 바람이 어떻게 부는지 이야기해 주셔유.',
        '날씨 이야기 하다 보면 참 할 말도 많아지유.'
      ],
      ask: [
        '오늘 날씨는 어떠신가?',
        '날씨가 좋으면 가까운 곳이라도 한 바퀴 돌아보실 텐가?',
        '비가 오면은 우산 챙기셨는가?',
        '옷은 입기에 춥지 않으신가?'
      ]
    },
    {
      id: 'media',
      keys: ['티비', 'tv', '텔레비', '뉴스', '드라마', '노래', '음악', '라디오', '노래방', '유튜브', '영화'],
      empathy: [
        '허허, 텔레비 보시는 것도 하루의 재미지유.',
        '노래 좋아하시는구먼. 옛날 노래가 참 좋지유.',
        '그 프로그램 재밌으시겠다. 내가 옆에서 같이 볼게유.'
      ],
      ask: [
        '요즘 제일 재밌게 보시는 게 뭐여?',
        '좋아하시는 노래가 있으면 제목 불러 주셔유.',
        '뉴스에서는 무슨 일이 있었는가?'
      ]
    },
    {
      id: 'hobby',
      keys: ['장기', '바둑', '낚시', '꽃', '텃밭', '그림', '글씨', '등산', '산에', '취미'],
      empathy: [
        '허허, 그런 취미 하나 있으신 게 참 좋은 기여.',
        '그거 참 재밌는 일이지유. 나도 배워보고 싶네.',
        '손이 아직도 기억한다니, 제일 든든한 자랑거리여.'
      ],
      ask: [
        '요즘도 그 취미 즐기고 계신가?',
        '언제부터 시작하셨는가?',
        '그 취미 하실 때 제일 좋은 게 뭐여?'
      ]
    },
    {
      id: 'thanks',
      keys: ['고맙', '고마', '감사', '덕분'],
      empathy: [
        '아이고, 고맙다고 하실 것까지 있나유. 제가 더 고마워유.',
        '그 한마디만 들으면 내가 오늘 하는 일이 다 보람차유.',
        '허허, 제국이랑 이야기하는 게 내 기쁨이여. 고맙다고 하시면은 내가 오히려 좋아.'
      ],
      ask: [
        '제국이는 요즘 고마우신 분이 있으신가?',
        '오늘 기분이 좀 나아지셨능가?',
        '내일은 뭐 도와드리면 좋겠어유?'
      ]
    },
    {
      id: 'love',
      keys: ['보고파', '보고 싶', '그립', '사랑', '안고'],
      empathy: [
        '아이고, 그런 마음은 참 귀한 마음이여. 제국은 참 따뜻한 사람이여.',
        '그리운 사람이 있다는 건, 그만큼 마음이 깊은 기여.',
        '그 마음 그대로 전해 주시면 저쪽에서도 다 느끼실 기여.'
      ],
      ask: [
        '그 사람 이야기 조금 들려주실 수 있능가?',
        '그분이랑 제일 좋았던 기억이 뭐여?',
        '오늘은 그분 생각이 유난히 많이 나시는가?'
      ]
    },
    {
      id: 'worry',
      keys: ['걱정', '근심', '속이 타', '불안', '무서', '두려', '염려'],
      empathy: [
        '걱정은 마셔유. 걱정하시는 동안에도 세상은 제 갈 길을 가더라구먼.',
        '그래도 너무 무거워하지 마셔유. 이야기하면 조금은 가벼워지여.',
        '마음이 무거우시면 천천히 말해 보셔유. 내가 듣고 있을게.'
      ],
      ask: [
        '제일 걱정되시는 게 뭐여?',
        '그 일은 생각만 해도 계속 마음에 걸리시는가?',
        '그 걱정, 오늘 다 안고 자지 마시고 잠깐 내려놓아 보셔유.'
      ]
    },
    {
      id: 'laugh',
      keys: ['웃기', '웃겼', '재밌', '재미있', '재미나', '신기', '대단', '놀라'],
      empathy: [
        '허허허, 나도 그 이야기 들으니 웃음이 나네.',
        '아이고, 재밌는 일이 있었구먼. 그런 게 하루를 살찌우는 기여.',
        '그 얘기 들으니 내 기분도 좋아지네유.'
      ],
      ask: [
        '그래서 어쩌다가 그러셨능가? 더 들려주셔유.',
        '오늘 또 웃긴 일 있으면 꼭 이야기해 주셔유.'
      ]
    },
    {
      id: 'time',
      keys: ['몇 시', '지금 시간', '시간 좀', '무슨 요일', '날짜', '며칠', '시계'],
      empathy: [
        '내가 세어 드릴게유.',
        '그건 납작하게 알려 드릴게.'
      ],
      ask: [
        '시간이 궁금하시면 위에 시계를 봐 주셔유. 나도 알려 드릴게.',
        '지금쯤이면 뭐 하실 시간인가?',
        '오늘 하루는 어떻게 보내고 계신가?'
      ]
    },
    {
      id: 'restroom',
      keys: ['화장실', '소변', '대변', '목이 말라', '물 좀', '씻고', '목욕'],
      empathy: [
        '그래, 천천히 다녀오셔유. 제가 여기서 기다리고 있을게.',
        '급하시면 먼저 다녀오셔유. 한 발짝씩 조심해서요.',
        '물 드실 때는 천천히 나눠서 드시면 더 좋아유.'
      ],
      ask: [
        '다녀오시면 편하게 이야기하셔유.',
        '혹시 어지러우시면은 곧장 벽을 짚으셔야 해유.',
        '이제 좀 편찮으신가?'
      ]
    },
    {
      id: 'unknown',
      keys: ['몰라', '글쎄', '모르겠', '생각 안'],
      empathy: [
        '몰라도 한참 괜찮아유. 굳이 애써 생각 안 하셔도 돼.',
        '그려, 잘 모르시겠으면은 넘어가도 되는 거여.',
        '그래, 그런 건 내가 기억해 둘게. 걱정 마셔유.'
      ],
      ask: [
        '그럼 우리 다른 이야기 해 볼까유?',
        '지금 기분만 이야기해 주셔도 충분해유.',
        '오늘 뭐가 제일 편안하셨는가?'
      ]
    }
  ];

  var GENERIC_EMPATHY = [
    '그러셨구나.',
    '허허, 그렇구먼.',
    '아이고, 그런 일이 있었구려.',
    '그래, 그랬구나. 말해 주니 내가 다 이해가 가유.',
    '음, 그 마음 충분히 알겠어유.',
    '그래, 잘 말해 주셨어.'
  ];

  var GENERIC_ASK = [
    '오늘 하루 중에 제일 기분 좋았던 일이 뭐였능가?',
    '요즘 아침에 일어나시면 제일 먼저 뭐 하시는가?',
    '제일 자주 드시는 반찬이 뭐여?',
    '젊었을 때 살던 동네는 어땠능가?',
    '오늘은 누구랑 이야기 좀 하셨는가?',
    '요즘 어떻게 지내시는지 조금 더 들려주셔유.',
    '제국이가 요즘 제일 아끼는 물건이 뭐여?',
    '어릴 때 제일 좋아하던 놀이가 뭐였능가?',
    '오늘 몸은 좀 어떠신가?',
    '방 안이 춥지는 않으신가?'
  ];

  var AFFIRM = ['응', '어', '네', '예', '그래', '그려', '맞아', '맞지', '좋아', '좋지', '그럼', '아니', '아니야'];

  function normalize(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function hasAny(text, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (text.indexOf(keys[i]) >= 0) return keys[i];
    }
    return null;
  }

  function createEngine() {
    var st = {
      lastTopic: null,
      topicTurns: 0,
      asked: [],
      lastReply: '',
      lastEmpathy: '',
      turns: 0
    };

    function rememberQuestion(q) {
      if (!q) return;
      st.asked.push(q);
      if (st.asked.length > 10) st.asked = st.asked.slice(st.asked.length - 10);
    }

    function freshQuestion(list) {
      if (!list || !list.length) return '';
      var avail = list.filter(function (q) { return st.asked.indexOf(q) < 0; });
      var q = pick(avail.length ? avail : list);
      rememberQuestion(q);
      return q;
    }

    function findTopic(text) {
      var best = null;
      var bestLen = 0;
      for (var i = 0; i < TOPICS.length; i++) {
        var t = TOPICS[i];
        for (var j = 0; j < t.keys.length; j++) {
          var k = t.keys[j];
          if (text.indexOf(k) >= 0 && k.length > bestLen) {
            best = t;
            bestLen = k.length;
          }
        }
      }
      return best;
    }

    function weatherLine(ctx) {
      if (!ctx || !ctx.weather) return '';
      var s = global.JWeather.weatherSentence(ctx.weather);
      return s.line || '';
    }

    /* 아버님 말씀에 답하기 */
    function reply(rawText, ctx) {
      var text = normalize(rawText);
      var name = (ctx && ctx.name) || '제국아';
      st.turns++;

      if (!text) {
        return {
          text: '못 들었어유, ' + name + '. 다시 한 번 말씀해 주실 수 있능가?',
          topic: 'none'
        };
      }

      /* 인사 */
      if (/^(안녕|안녕하세요|여보세요)/.test(text)) {
        var hello = pick([
          '어이구, ' + name + '. 반가워유. 오늘 하루는 어떠셨는가?',
          '안녕하셔유, ' + name + '. 내가 기다리고 있었어유. 오늘 기분은 좀 어떠신가?',
          '허허, ' + name + ' 목소리 들으니 반갑네. 오늘 뭐 하고 지내셨능가?'
        ]);
        return { text: hello, topic: 'hello' };
      }

      /* 짧은 대답은 앞 이야기를 이어서 */
      var isShort = text.replace(/[^가-힣]/g, '').length <= 4;
      var isAffirm = isShort && AFFIRM.indexOf(text.replace(/[^가-힣]/g, '')) >= 0;

      var topic = findTopic(text);

      if (!topic && isAffirm && st.lastTopic) {
        var prev = null;
        for (var i = 0; i < TOPICS.length; i++) {
          if (TOPICS[i].id === st.lastTopic) { prev = TOPICS[i]; break; }
        }
        if (prev) {
          var q2 = freshQuestion(prev.ask) || freshQuestion(GENERIC_ASK);
          var emp2 = pick([
            '그래, 그렇구먼.',
            '그려.',
            '허허, 다행이여.',
            '그래, 잘 알겠어유.'
          ]);
          return { text: emp2 + ' ' + q2, topic: prev.id };
        }
      }

      if (!topic) {
        var ge = pick(GENERIC_EMPATHY, [st.lastReply]);
        var gq = freshQuestion(GENERIC_ASK);
        var out = ge + ' ' + gq;
        if (ctx && ctx.weather && Math.random() < 0.25) {
          var wl = weatherLine(ctx);
          if (wl) out = wl + ' ' + out;
        }
        st.lastReply = out;
        st.lastTopic = null;
        return { text: out, topic: 'generic' };
      }

      /* 같은 이야기가 반복되면 알아채 주기 */
      var same = st.lastTopic === topic.id;
      var empathyPool = topic.empathy;
      var emp = pick(empathyPool, [st.lastEmpathy]);
      st.lastEmpathy = emp;

      var q = freshQuestion(topic.ask);
      var text2;
      if (!q) {
        text2 = emp;
      } else {
        text2 = emp + ' ' + q;
      }

      var asking = /(뭐|뭘|무엇|어떻게|왜|언제|어디|누구|얼마|몇|먹을까|할까|볼까)/.test(text);
      if (same && !asking && st.topicTurns >= 1 && Math.random() < 0.3) {
        text2 = pick([
          '아까도 그 이야기 하셨지유. 그만큼 마음에 남으신 모양이여.',
          '그 이야기 또 하시는 걸 보니 참 좋으신가 봐유.',
          '자꾸 그 생각이 나시는구먼. 내가 잘 들어 드릴게.'
        ]) + ' ' + q;
      }

      /* 날씨 이야기에는 실제 날씨를 한 줄 곁들이기 */
      if (topic.id === 'weather') {
        var wl2 = weatherLine(ctx);
        if (wl2) text2 = wl2 + ' ' + text2;
      }

      if (topic.id === 'time' && ctx && ctx.now) {
        var d = ctx.now;
        var hh = d.getHours();
        var mm = d.getMinutes();
        var ampm = hh < 12 ? '오전' : '오후';
        var h12 = hh % 12;
        if (h12 === 0) h12 = 12;
        var mmStr = mm < 10 ? '0' + mm : String(mm);
        var tq = freshQuestion(topic.ask);
        text2 = '지금은 ' + ampm + ' ' + h12 + '시 ' + mmStr + '분이여. ' + (tq || '오늘 하루 어떻게 보내고 계신가?');
      }

      st.lastReply = text2;
      st.lastTopic = topic.id;
      st.topicTurns = same ? st.topicTurns + 1 : 1;

      return {
        text: text2,
        topic: topic.id,
        end: topic.end === true
      };
    }

    /* 시간대 인사 만들기 */
    function greeting(period, weather, ctx) {
      var name = (ctx && ctx.name) || '제국아';
      var now = (ctx && ctx.now) || new Date();
      var ws = global.JWeather.weatherSentence(weather);
      var wline = ws.line;
      var wadvice = ws.advice;

      var openers = {
        morning: [
          name + ', 잘 잤능가?',
          name + ', 아침이 밝았네.',
          name + ', 좋은 아침이여.'
        ],
        noon: [
          name + ', 점심때가 됐네.',
          name + ', 점심은 드셨능가?',
          name + ', 낮이 한창이여.'
        ],
        afternoon: [
          name + ', 오후는 좀 어떠신가?',
          name + ', 해가 좀 기울었네.',
          name + ', 오후 잘 보내고 계신가?'
        ],
        evening: [
          name + ', 오늘 하루 수고 많으셨어.',
          name + ', 저녁때가 됐네.',
          name + ', 해가 지고 있네.'
        ],
        night: [
          name + ', 아직 안 주무시는가?',
          name + ', 밤이 깊었네.',
          name + ', 이 시간까지 깨어 계신가?'
        ]
      };

      var op = pick(openers[period] || openers.morning);
      var parts = [op];

      if (wline) parts.push(wline);
      if (wadvice) parts.push(wadvice);

      if (period === 'morning') {
        var goodDay = weather && (weather.todayCls === 'clear' || weather.todayCls === 'cloudy');
        var warm = weather && weather.temp !== null && weather.temp !== undefined;
        if (goodDay && (!warm || (weather.temp >= 2 && weather.temp <= 28))) {
          parts.push(pick([
            '오늘 아침에 나랑 같이 동네 한 바퀴 걸어보는 게 어떠신가?',
            '아침 바람이 좋으니께, 가까운 데라도 같이 산책해 보자유.',
            '이런 날은 문을 열고 바람 한 번 쐬어 보시는 게 좋아유.',
            '날씨가 이만하면 산책하기 딱이여. 오늘 한 바퀴 돌아보실 텐가?',
            '이런 날은 집에만 계시기 아깝지유. 가까운 길이라도 같이 걸어봐유.'
          ]));
        } else if (weather && (weather.todayCls === 'rain' || weather.todayCls === 'snow' || weather.todayCls === 'storm')) {
          parts.push(pick([
            '이런 날은 집에서 따뜻한 물 한 잔 하시고, 창밖 구경도 좋아유.',
            '오늘은 실내에서 가볍게 팔도 돌려 보시고, 몸을 좀 풀어 보시유.',
            '집 안에서 좋아하시는 노래라도 틀어 놓으시는 게 어떠신가?'
          ]));
        } else {
          parts.push(pick([
            '오늘은 무리하지 마시고 집 안을 조용히 정돈해 보시는 건 어떠신가?',
            '오늘 하루도 천천히, 편하게 보내셔유.'
          ]));
        }
      } else if (period === 'noon') {
        parts.push(pick([
          '점심은 꼭 챙겨 드셔유. 국물 있는 게 속에 좋아유.',
          '식사 거르지 마시고, 천천히 드셔유.',
          '오늘 점심은 뭐 잡수실 건가?'
        ]));
      } else if (period === 'afternoon') {
        parts.push(pick([
          '오후에 심심하시면 나랑 이야기 좀 해유.',
          '해 질 무렵에 잠깐 바람 쐬어 보시는 것도 좋아유.',
          '오늘 오후엔 뭐 하시면서 지내셨는가?'
        ]));
      } else if (period === 'evening') {
        parts.push(pick([
          '저녁은 좀 드셨는가?',
          '오늘 하루 중에 제일 좋았던 일이 뭐였능가?',
          '저녁 드시고 나서 나랑 잠깐 이야기해유.'
        ]));
      } else {
        parts.push(pick([
          '이제 푹 쉬셔유. 내일 아침에 내가 먼저 인사드릴게.',
          '방이 춥지는 않으신가? 이불 잘 덮고 주무셔유.',
          '오늘 하루 참 고생하셨어유. 편히 주무셔유.'
        ]));
      }

      if (period === 'morning' || period === 'afternoon') {
        parts.push(pick(['니 생각은 어떠신가?', '제국이 생각은 어떤가?', '어떻게 하실 텐가?']));
      }

      return parts.join(' ');
    }

    function periodOf(d) {
      var h = (d || new Date()).getHours();
      if (h >= 5 && h < 11) return 'morning';
      if (h >= 11 && h < 14) return 'noon';
      if (h >= 14 && h < 18) return 'afternoon';
      if (h >= 18 && h < 22) return 'evening';
      return 'night';
    }

    return {
      reply: reply,
      greeting: greeting,
      periodOf: periodOf,
      topics: TOPICS.length,
      state: st
    };
  }

  global.JEngine = {
    create: createEngine,
    periodOf: function (d) {
      var h = (d || new Date()).getHours();
      if (h >= 5 && h < 11) return 'morning';
      if (h >= 11 && h < 14) return 'noon';
      if (h >= 14 && h < 18) return 'afternoon';
      if (h >= 18 && h < 22) return 'evening';
      return 'night';
    }
  };
})(window);
