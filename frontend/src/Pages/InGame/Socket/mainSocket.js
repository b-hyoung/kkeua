let socket = null;

function getGuestUuidFromCookie() {
  const cookies = document.cookie.split('; ').reduce((acc, cookie) => {
    const [name, value] = cookie.split('=');
    acc[name] = value;
    return acc;
  }, {});
  return cookies['kkua_guest_uuid'] || null;
}

export function connectSocket(gameId) {
  console.log("📌 connectSocket 호출됨");

  const guestUuid = getGuestUuidFromCookie();

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

  const baseWsUrl = process.env.REACT_APP_WS_BASE_URL || 'ws://localhost:8000';
  const socketUrl = `${baseWsUrl}/simple-ws/ws`;
  console.log("🚀 연결 시도할 WebSocket 주소:", socketUrl);

  try {
    socket = new WebSocket(socketUrl);

    socket.onopen = () => {
      console.log("✅ WebSocket 연결 성공:", socketUrl);
      const guestUuid = getGuestUuidFromCookie();
      if (guestUuid) {
        sendMessage({
          type: "register",
          guest_id: guestUuid
        });
        console.log("🙋‍♂️ [onopen] guest_id 서버 등록 완료:", guestUuid);
      } else {
        console.error('🚫 게스트 UUID가 없어서 서버에 등록할 수 없습니다.');
      }
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('🧾 [소켓 수신] 데이터:', data);

      switch (data.type) {
        case 'connected':
          console.log('✅ 서버로부터 connected 수신:', data);
          const guestUuid = getGuestUuidFromCookie();
          if (guestUuid && gameId) {
            sendMessage({
              type: "start_game",
              guest_id: guestUuid,
              game_id: gameId,
              first_word: "끝말잇기"
            });
            console.log("🎮 [connected] 받은 뒤 start_game 서버로 전송 완료:", { guest_id: guestUuid, game_id: gameId });
          } else {
            console.error('🚫 guestUuid 또는 gameId가 없어 start_game을 보낼 수 없습니다.');
          }
          break;
        case 'user_joined':
          console.log('👤 새 유저 입장:', data.username);
          break;
        case 'chat':
          console.log('💬 채팅 메시지:', data.username, ':', data.message);
          break;
        case 'username_changed':
          console.log(`✏️ 닉네임 변경: ${data.old_username} → ${data.new_username}`);
          break;
        case 'pong':
          console.log('🏓 핑-퐁 응답:', data);
          break;
        case 'game_started':
          console.log('🎮 끝말잇기 게임 시작:', data.message);
          if (data.current_turn_player) {
            console.log(`🎯 [게임 시작] 첫 번째 차례는: ${data.current_turn_player}`);
          } else {
            console.warn('⚠️ [게임 시작] current_turn_player 정보 없음');
          }
          break;
        case 'turn_change':
          if (data.next_player) {
            console.log(`🔄 턴 변경됨 → 다음 차례: ${data.next_player}`);
          } else {
            console.warn('⚠️ [턴 변경] next_player 정보 없음');
          }
          break;
        case 'game_error':
          console.error('🚫 게임 에러:', data.message);
          break;
        case 'word_accepted':
          console.log('✅ [word_accepted] 서버로부터 받은 데이터:', data);
          console.log('🟢 단어 승인:', data.username, '단어:', data.word);
          break;
        case 'word_rejected':
          console.warn('🔴 단어 거절:', data.username, '단어:', data.word, '이유:', data.reason);
          break;
        case 'game_over':
          console.log('🏁 [무시] 서버로부터 game_over 수신 (타이머 종료 무시)', data.message);
          // ✅ 일단 게임 종료 관련 처리를 막음 (alert, 리다이렉트 등 없음)
          break;
        case 'user_left':
          console.log('🚪 유저 퇴장:', data.username);
          break;
        case 'time_sync':
          console.log('⏱️ [시간 동기화] 서버 기준 남은 시간:', data.time_left);
          if (typeof window.setInputTimeLeftFromSocket === 'function') {
            window.setInputTimeLeftFromSocket(data.time_left);
          }
          break;
        default:
          console.warn('❔ 알 수 없는 타입 수신:', data);
      }
    };

    socket.onerror = (error) => {
      console.error("⚠️ WebSocket 오류 발생:", error);
    };

    socket.onclose = (e) => {
      console.warn(`❌ WebSocket 끊김: code=${e.code}, reason=${e.reason}`);
      // socket = null; ✅ 삭제
    };

  } catch (error) {
    console.error("❗ 소켓 생성 실패:", error);
  }
}

export function getSocket() {
  return socket;
}

export function sendWordChainMessage(word = '') {
  if (socket && socket.readyState === WebSocket.OPEN) {
    const message = {
      type: 'submit_word', // ✅ 서버가 요구하는 형식
      word: word,
      timestamp: new Date().toISOString()
    };
    socket.send(JSON.stringify(message));
    console.log("📤 submit_word 메시지 전송:", message);
  } else {
    console.error("🚫 WebSocket이 열려있지 않아서 메시지를 보낼 수 없습니다.");
  }
}

export function sendMessage(message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  } else {
    console.error("🚫 WebSocket이 열려있지 않습니다. 메시지를 보낼 수 없습니다.");
  }
}
