// 현재 턴 플레이어의 guest_id 저장
export let currentPlayerId = null;
let socket = null;
let receiveWordHandler = null; // (⭐) 외부 핸들러 저장

export function connectSocket(gameId) {
  console.log("📌 connectSocket 호출됨");

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    console.log("🔌 기존 소켓 정리 중...");
    socket.close();
    socket = null;
  }

  // 쿠키 읽기
  const cookies = document.cookie.split(';').map(c => c.trim());
  const guestCookie = cookies.find(c => c.startsWith('kkua_guest_uuid='));
  let guestUuid = guestCookie ? guestCookie.split('=')[1] : null;

  // 쿠키에서 guest_uuid를 찾지 못한 경우 localStorage에서 찾기
  if (!guestUuid) {
    guestUuid = localStorage.getItem('kkua_guest_uuid');
    console.log("🧩 로컬스토리지에서 guest_uuid를 찾음:", guestUuid);
  }

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
      if (receiveWordHandler) {
        console.log("✅ 초기 수신 핸들러 세팅 완료");
      }
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
        "time_sync",
        "user_joined",
        "participants_update",
        "connected"
      ];

      if (wordChainRelevantTypes.includes(data.type)) {
        console.log(`✅ [끝말잇기] 타입 수신: ${data.type}`, data);
        if (data.type === "word_chain_state" && data.current_player_id) {
            currentPlayerId = data.current_player_id;
            console.log("🎯 현재 턴 플레이어 ID 업데이트:", currentPlayerId);
        }
        // === word_chain_started 수신 시 상세 로그 및 currentPlayerId 설정 ===
        if (data.type === "word_chain_started") {
          console.log("✅ word_chain_started 메시지 수신 (from socket):", data);
          if (data.current_player_id !== undefined && data.current_player_id !== null) {
            currentPlayerId = data.current_player_id;
            console.log("🎯 게임 시작 - 현재 턴 플레이어 ID 설정:", currentPlayerId);
          }
        }
        // === 추가: word_chain_word_submitted 수신 시 currentPlayerId를 next_turn_guest_id로 변경 ===
        if (data.type === "word_chain_word_submitted" && data.next_turn_guest_id !== undefined && data.next_turn_guest_id !== null) {
          currentPlayerId = data.next_turn_guest_id;
          console.log("🎯 단어 제출 완료 - 다음 턴으로 변경:", currentPlayerId);
        }
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
      if (e.code === 4003) {
        alert("⚠️ 서버 오류로 연결이 끊어졌습니다. 잠시 후 다시 시도해주세요.");
      }
      socket = null;
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


export function submitWordChainWord(word, myGuestId, currentTurnGuestId) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    if (currentTurnGuestId !== null && myGuestId !== currentTurnGuestId) {
      console.warn("🚫 현재 당신 턴이 아닙니다. 제출 금지.");
      showTurnWarning(); 
      return;
    }
    socket.send(JSON.stringify({
      type: "word_chain",
      action: "validate_word",
      word: word
    }));
  }
}
// ✅ 최소 추가: 끝말잇기 게임 시작 요청
export function requestStartWordChainGame(firstWord = "끝말잇기") {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: "word_chain",
      action: "start_game",
      first_word: firstWord
    }));
    console.log('🚀 [끝말잇기] 게임 시작 요청 보냄, 첫 단어:', firstWord);
  }
}

// ✅ 추가: 끝말잇기 게임 종료 요청
export function requestEndWordChainGame() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: "word_chain",
      action: "end_game"
    }));
    console.log('🏁 [끝말잇기] 게임 종료 요청 보냄');
  }
}

// ✅ 턴이 아닐 때 경고 알림
function showTurnWarning() {
  alert("⛔ 현재 당신의 차례가 아닙니다!");
}
// ✅ 턴 넘기기 요청 함수 추가
export function requestSkipTurn() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: "word_chain",
      action: "skip_turn"
    }));
    console.log('⏩ [끝말잇기] 턴 넘기기 요청 보냄');
  }
}

export function requestCurrentTurn() {
  const socket = getSocket();
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'request_current_turn' }));
    console.log('📤 [소켓] 현재 턴 요청 보냄 (request_current_turn)');
  } else {
    console.error('❌ 소켓이 열려있지 않아 requestCurrentTurn 실패');
  }
}