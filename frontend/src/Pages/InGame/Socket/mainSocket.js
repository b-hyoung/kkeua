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
      console.log('📨 수신한 메시지:', data);
  
      // (⭐) word_chain_word_submitted 오면 외부 핸들러 호출
      if (data.type === "word_chain_word_submitted" && receiveWordHandler) {
        receiveWordHandler(data);
      }
    };

    socket.onerror = (err) => {
      console.error("⚠️ WebSocket 에러 발생:", err);
      console.error("⚠️ 시도했던 주소:", socketUrl);
    };

    socket.onclose = (e) => {
      console.warn(`❌ WebSocket 끊김: code=${e.code}, reason=${e.reason}`);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('📨 수신한 전체 메시지:', data);  // 이거 추가
    
      if (data.type === "word_chain_word_submitted" && receiveWordHandler) {
        receiveWordHandler(data);
      }
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
