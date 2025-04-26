// src/Pages/InGame/Socket/kdataSocket.js

import { getSocket } from './mainSocket';

export function sendWordToServer({ user, word, itemUsed }) {
  const socket = getSocket();
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn('🚫 WebSocket이 열려 있지 않음');
    return;
  }

  const payload = {
    action: "submit_word",
    user,
    current_word: word,
    itemUsed: itemUsed || false,
  };

  socket.send(JSON.stringify(payload));
  console.log('✅ 서버에 단어 전송:', payload);
}
