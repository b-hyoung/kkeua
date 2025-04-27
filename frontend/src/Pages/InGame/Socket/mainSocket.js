let socket = null;
let receiveWordHandler = null; // (⭐) 외부 핸들러 저장

export function connectSocket(gameId) {
  console.log("📌 connectSocket 호출됨");

  // 쿠키 읽기
  const cookies = document.cookie.split(';').map(c => c.trim());
  const guestCookie = cookies.find(c => c.startsWith('kkua_guest_uuid='));
  const guestUuid = guestCookie ? guestCookie.split('=')[1] : null;

  console.log("🧩 현재 쿠키 목록:", cookies);
  console.log("🧩 찾은 guest_uuid:", guestUuid);
  console.log("🧩 넘겨받은 gameId:", gameId);

  if (!guestUuid) {
    console.error('🚫 게스트 UUID를 찾을 수 없습니다. 소켓 연결 중단');
    return;
  }
  if (!gameId) {
    console.error('🚫 방 ID(gameId)가 없습니다. 소켓 연결 중단');
    return;
  }

  const socketUrl = `ws://127.0.0.1:8000/ws/gamerooms/${gameId}/${guestUuid}`;
  console.log("🚀 연결 시도할 WebSocket 주소:", socketUrl);

  try {
    socket = new WebSocket(socketUrl);

    socket.onopen = () => {
      console.log("✅ WebSocket 연결 성공:", socketUrl);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('📨 수신 데이터:', data);

      const wordChainRelevantTypes = [
        "word_chain_state",
        "word_chain_word_submitted",
        "word_chain_started",
        "word_chain_game_ended",
        "word_chain_error",
        "word_validation_result",
        "time_sync"
      ];

      if (wordChainRelevantTypes.includes(data.type)) {
        console.log(`✅ [끝말잇기] 타입 수신: ${data.type}`, data);
        if (receiveWordHandler) {
          receiveWordHandler(data);
        }
      } else {
        console.warn('📭 [메인소켓] 처리하지 않는 타입 수신:', data.type);
      }
    };

    socket.onerror = (err) => {
      console.error("⚠️ WebSocket 에러 발생:", err);
      console.error("⚠️ 시도했던 주소:", socketUrl);
    };

    socket.onclose = (e) => {
      console.warn(`❌ WebSocket 끊김: code=${e.code}, reason=${e.reason}`);
    };

    

  } catch (error) {
    console.error("❗ 소켓 생성 자체 실패:", error);
  }
}

export function setReceiveWordHandler(handler) {
  receiveWordHandler = handler;
}

export function getSocket() {
  return socket;
}


// ✅ 최소 추가: 끝말잇기 단어 제출
export function submitWordChainWord(word) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: "word_chain",
      action: "validate_word",
      word: word
    }));
  }}
// ✅ 최소 추가: 끝말잇기 게임 시작 요청
export function requestStartWordChainGame(firstWord = "끝말잇기") {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: "start_game",
      first_word: firstWord
    }));
    console.log('🚀 [끝말잇기] 게임 시작 요청 보냄, 첫 단어:', firstWord);
  }
}