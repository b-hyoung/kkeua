import React from 'react';
import { useEffect, useRef, useState } from 'react';
import guestStore from '../store/guestStore';
import { useNavigate } from 'react-router-dom';
import { lobbyUrl } from '../Component/urls';

export const socketRef = React.createRef();

export default function useGameRoomSocket(roomId) {
    const navigate = useNavigate()
    const [connected, setConnected] = useState(false);
    const [messages, setMessages] = useState([]);
    const [participants, setParticipants] = useState([]);
    const [gameStatus, setGameStatus] = useState();
    const [roomUpdated, setRoomUpdated] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [finalResults, setFinalResults] = useState([]);

    // Move intentionalClose outside of useEffect, as a top-level ref
    const intentionalClose = useRef(false);

    useEffect(() => {
        if (roomId) {
            // guestStore에서 UUID 가져오기
            const { uuid } = guestStore.getState();

            if (!uuid) {
                console.error("UUID가 없습니다. 로그인이 필요합니다.");
                return;
            }

            console.log(`웹소켓 연결 시도: /ws/gamerooms/${roomId}/${uuid}`);

            // 웹소켓 연결 생성
            const socket = new WebSocket(`${process.env.REACT_APP_WS_BASE_URL || 'ws://localhost:8000'}/ws/gamerooms/${roomId}/${uuid}`);
            socketRef.current = socket;

            socket.onopen = () => {
                console.log("웹소켓 연결 성공!");
                setConnected(true);
                // setRoomUpdated(true); // 불필요한 데이터 fetch 방지
            };

            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                console.log('소켓 메시지 수신:', data);
                console.log('🧾 [소켓 전체 수신 로그] 받은 데이터:', data);

                if (data.type === 'chat') {
                    const { guest_id } = guestStore.getState();
                    console.log('내 guest_id:', guest_id);
                    console.log('수신 guest_id:', data.guest_id);
                    console.log('수신 message_id:', data.message_id);

                    const isOwnMessage = false;
                    const alreadyExists = data.message_id
                        ? messages.some(msg => msg.message_id === data.message_id)
                        : false;

                    if (!isOwnMessage && !alreadyExists) {
                        setMessages(prev => [...prev, {
                            nickname: data.nickname,
                            message: typeof data.message === 'string' ? data.message : JSON.stringify(data.message),
                            guest_id: data.guest_id,
                            timestamp: data.timestamp,
                            type: data.type,
                            message_id: data.message_id || `${data.guest_id}-${Date.now()}`
                        }]);
                    }

                    if (
                        typeof data.message === 'object' &&
                        data.message.type === 'word_chain' &&
                        data.message.action === 'start_game'
                    ) {
                        console.log("🎯 word_chain -> start_game 감지됨: 상태 'playing'으로 설정");
                        setGameStatus('playing');
                    }
                } else if (data.type === 'participants_update') {
                    console.log('웹소켓으로 참가자 목록 업데이트:', data.participants);
                    console.log('📦 participants_update 전체 데이터:', JSON.stringify(data, null, 2));
                    if (data.participants && Array.isArray(data.participants)) {
                        setParticipants(prev =>
                            data.participants.map(newP => {
                                const existing = prev.find(p => p.guest_id === newP.guest_id);

                                const isCreatorValue =
                                    typeof newP.is_creator === 'boolean'
                                        ? newP.is_creator
                                        : typeof newP.is_owner === 'boolean'
                                            ? newP.is_owner
                                            : existing?.is_creator || false;

                                return {
                                    ...existing,
                                    ...newP,
                                    is_creator: isCreatorValue
                                };
                            })
                        );

                        if (data.message) {
                            setMessages((prev) => [...prev, {
                                nickname: "시스템",
                                message: data.message,
                                type: 'system',
                                timestamp: data.timestamp || new Date().toISOString()
                            }]);
                        }

                        setRoomUpdated(true);
                    }
                } else if (data.type === 'status_update' || data.type === 'game_status') {
                    console.log("✅ status_update 수신 후 처리 시작");
                    console.log("📥 게임 상태 메시지 수신:", data);
                    setGameStatus(prev => {
                        console.log("🔁 이전 상태:", prev, "➡️ 새로운 상태:", data.status);
                        return data.status;
                    });
                    console.log("✅ setGameStatus 실행됨:", data.status);
                    console.log("📡 [게임 상태 수신] 타입: status_update, 상태:", data.status);

                    if (data.status === 'playing') {
                        setParticipants(prev =>
                            prev.map(p => ({
                                ...p,
                                status: 'PLAYING'
                            }))
                        );
                    }
                } else if (data.type === 'word_chain_started') {
                    console.log("🎯 끝말잇기 게임 시작 알림 수신");
                    setGameStatus('playing');
                    setParticipants(prev =>
                        prev.map(p => ({
                            ...p,
                            status: 'PLAYING'
                        }))
                    );
                    if (socketRef.current) {
                        intentionalClose.current = true;
                        console.log("🛑 게임 시작 - 소켓 종료 처리");
                        socketRef.current.close();
                    }
                } else if (data.type === 'ready_status_changed') {
                    const { guest_id } = guestStore.getState();
                    if (String(data.guest_id) === String(guest_id)) {
                        setIsReady(data.is_ready);
                    }
                    // Updated logic: preserve is_creator, only update status and nickname
                    setParticipants(prev => prev.map(p =>
                        p.guest_id === data.guest_id
                          ? {
                              ...p,
                              status: data.is_ready ? 'READY' : 'WAITING',
                              nickname: data.nickname || p.nickname,
                              is_creator: p.is_creator // preserve original value
                            }
                          : p
                    ));
                    setMessages((prev) => [...prev, {
                        nickname: "시스템",
                        message: `${data.nickname || `게스트_${data.guest_id}`}님이 ${data.is_ready ? '준비완료' : '대기중'} 상태가 되었습니다.`,
                        type: 'system',
                        timestamp: data.timestamp || new Date().toISOString()
                    }]);
                } else if (data.type === 'ready_status_updated') {
                    setIsReady(data.is_ready);
                } else if (data.type === 'final_results') {
                    console.log("🏁 최종 결과 수신:", data.results);
                    if (Array.isArray(data.results)) {
                        setFinalResults(data.results);
                    }
                }
            };

            let retryCount = 0;
            socket.onclose = (event) => {
                if (intentionalClose.current) {
                    console.log("✅ 의도된 종료 - 재연결 안함");
                    return;
                }

                console.warn("📴 웹소켓 연결 종료됨:", event.code, event.reason);
                setConnected(false);

                if (retryCount < 3) {
                    retryCount++;
                    console.log(`🔁 [${retryCount}/3] 웹소켓 재연결 시도...`);
                    setTimeout(() => {
                        setRoomUpdated(true); // GameLobbyPage에서 감지
                    }, 3000);
                } else {
                    console.error("🚨 3회 재연결 실패 - 자동 퇴장");
                    alert("네트워크 연결에 실패했습니다. 로비로 이동합니다.");

                    // 퇴장 처리 (handleClickExit이 외부에서 정의된 경우)
                    if (typeof window.handleClickExit === 'function') {
                        window.handleClickExit();
                    } else {
                        navigate(lobbyUrl); // 예비 fallback
                    }
                }
            };
        }

        return () => {
            // 컴포넌트 언마운트 시 소켓 닫기
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, [roomId]); // UUID는 변경될 수 있지만 페이지가 로드될 때 한 번만 연결

    // 메시지 전송 함수
    const sendMessage = (message) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          const { guest_id, nickname } = guestStore.getState();
          const messageData = {
            type: 'chat',
            message: message,
            guest_id: guest_id,
            nickname: nickname,
            timestamp: new Date().toISOString(),
            message_id: `${guest_id}-${Date.now()}`
          };
          socketRef.current.send(JSON.stringify(messageData));
        } else {
          console.error("웹소켓이 연결되지 않았습니다");
        }
      };

    // 준비 상태 토글 함수 추가
    const toggleReady = () => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
                type: 'toggle_ready'
            }));
        } else {
            console.error("웹소켓이 연결되지 않았습니다");
        }
    };

    // 상태 업데이트 함수 (준비 또는 시작)
   
    // isReady 상태 디버깅용 useEffect 추가
    useEffect(() => {
        console.log("🟢 현재 isReady 상태:", isReady);
    }, [isReady, messages]);

    return {
        connected,
        messages,
        participants,
        gameStatus,
        isReady,
        sendMessage,
        toggleReady,
        roomUpdated,
        setRoomUpdated,
        finalResults,
        setFinalResults
    };
}