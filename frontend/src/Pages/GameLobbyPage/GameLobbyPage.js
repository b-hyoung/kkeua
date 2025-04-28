import React, { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import axiosInstance from '../../Api/axiosInstance';
import { gameLobbyUrl, gameUrl, lobbyUrl } from '../../Component/urls';
import userIsTrue from '../../Component/userIsTrue';
import { ROOM_API } from '../../Api/roomApi';
import guestStore from '../../store/guestStore';
import useGameRoomSocket from '../../hooks/useGameRoomSocket';

function GameLobbyPage() {
  const { roomId } = useParams();
  const [roomInfo, setRoomInfo] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [redirectingToGame, setRedirectingToGame] = useState(false);
  const [loadingDelay, setLoadingDelay] = useState(true);
  const navigate = useNavigate();
  const [showRedirectMessage, setShowRedirectMessage] = useState(false);
  // 최소 로딩 시간 2.5초 타이머
  useEffect(() => {
    const timer = setTimeout(() => setLoadingDelay(false), 1000); // 2.5 seconds
    return () => clearTimeout(timer);
  }, []);

  /* Guest Check */
  useEffect(() => {
    const checkGuest = async () => {
      const { uuid, guest_id, nickname } = guestStore.getState();

      if (uuid && guest_id && nickname) {
        console.log("✅ 저장된 guestStore 정보 사용:", { uuid, guest_id, nickname });
        return;
      }
      // 쿠키 확인 (직접 document.cookie 사용)
      const cookies = document.cookie.split(';');
      const guestUuidCookie = cookies.find(cookie => cookie.trim().startsWith('kkua_guest_uuid='));
      const guestUuid = guestUuidCookie ? guestUuidCookie.split('=')[1].trim() : null;

      console.log("쿠키에서 찾은 UUID:", guestUuid);

      // 스토어 상태 확인
      console.log("스토어에 저장된 UUID:", uuid);

      if (guestUuid) {
        // 스토어 상태 업데이트
        if (!uuid || uuid !== guestUuid) {
          console.log("UUID 불일치, 스토어 업데이트");
          const current = guestStore.getState();
          guestStore.getState().setGuestInfo({
            uuid: guestUuid,
            guest_id: current.guest_id,
            nickname: current.nickname,
            guest_uuid: current.guest_uuid
          });
        }

        // userIsTrue 호출
        const result = await userIsTrue();
        if (!result) {
          alert("어멋 어딜들어오세요 Get Out !");
          navigate("/");
          return;
        }
      } else {
        // 쿠키가 없으면 로그인 시도
        try {
          const response = await axiosInstance.post('/guests/login');

          guestStore.getState().setGuestInfo({
            uuid: response.data.uuid,
            nickname: response.data.nickname,
            guest_id: response.data.guest_id
          });
        } catch (error) {
          alert("서버 연결에 문제가 있습니다");
          navigate("/");
        }
      }
    };
    checkGuest();
  }, [navigate]);

  /* USER INFO */
  const fetchRoomData = async () => {
    try {
      setIsLoading(true);
      const response = await axiosInstance.get(`/gamerooms/${roomId}`);
      console.log("방 정보 API 응답:", response.data);

      // API 응답 구조 처리
      if (response.data) {
        // room 객체 저장
        if (response.data.room) {
          setRoomInfo(response.data.room);
        } else {
          // 직접 객체가 room 정보인 경우 (이전 API 호환)
          setRoomInfo(response.data);
        }

        // participants 배열 저장
        if (response.data.participants && Array.isArray(response.data.participants)) {
          setParticipants(response.data.participants);
        }
      }
    } catch (error) {
      console.error("방 정보 가져오기 실패:", error);
    } finally {
      setIsLoading(false);
    }
  };

  /* 방장 확인 */
  const checkIfOwnerFromParticipants = () => {
    const { guest_id } = guestStore.getState();
    console.log("현재 내 guest_id:", guest_id);
    // 로그: 게스트 스토어 전체 상태
    console.log("게스트 스토어 전체 상태:", guestStore.getState());
    participants.forEach(p => {
      console.log(`참가자 guest_id: ${p.guest_id}, is_creator: ${p.is_creator}`);
    });
    const currentUser = guest_id
      ? participants.find(p => String(p.guest_id) === String(guest_id))
      : null;
    if (!currentUser) {
      console.warn("⚠️ 현재 사용자 정보를 참가자 목록에서 찾을 수 없습니다. guest_id:", guest_id);
    }
    console.log("현재 사용자 정보:", currentUser);

    return currentUser?.is_creator === true;
  };

  useEffect(() => {
    fetchRoomData();

    // 주기적으로 방 정보 갱신 (옵션)
    const interval = setInterval(fetchRoomData, 30000);
    return () => clearInterval(interval);
  }, [roomId]);
  
  // 방장 여부 확인 useEffect - fetchRoomData에서 가져온 데이터 사용
  useEffect(() => {
    // 참가자 정보로 방장 여부 확인
    const isOwnerFromParticipants = checkIfOwnerFromParticipants();
    if (isOwnerFromParticipants !== undefined) {
      setIsOwner(isOwnerFromParticipants);
      return;
    }

    // 기존 API 호출 방식으로 확인 (백업)
    const checkIfOwner = async () => {
      try {
        const response = await axiosInstance.get(`/gamerooms/${roomId}/is-owner`);
        console.log("방장 확인 응답:", response.data);

        if (response.data.is_owner) {
          console.log("✅ 방장 확인: 현재 사용자는 방장입니다!");
          setIsOwner(true);
        } else {
          console.log("❌ 방장 확인: 현재 사용자는 방장이 아닙니다.");
          setIsOwner(false);
        }
      } catch (error) {
        console.error("방장 여부 확인 실패:", error);
        setIsOwner(false);
      }
    };

    checkIfOwner();
  }, [roomId, participants]);

  /* Exit from Room BTN */
  const handleClickExit = () => {
    const lobbyUrl = "/lobby";
    
    if (isOwner) {
      let confirmDelete = window.confirm("정말로 방을 삭제하시겠습니까?");
      if (confirmDelete) {
        try {
          // 방 삭제 API 직접 호출
          axiosInstance.delete(ROOM_API.DELET_ROOMSID(roomId))
            .then(() => {
              alert("방이 삭제되었습니다.");
              navigate(lobbyUrl);
            })
            .catch((error) => {
              alert("당신은 나갈수 없어요. 끄아지옥 ON....");
              console.log(error);
            });
        } catch (error) {
          alert("당신은 나갈수 없어요. 끄아지옥 ON.... Create User");
          console.log(error);
        }
      }
    } else {
      let confirmLeave = window.confirm("로비로 나가시겠습니까?");
      if (confirmLeave) {
        try {
          // uuid 가져오기
          const { uuid } = guestStore.getState();

          // 요청 본문에 게스트 UUID 추가
          axiosInstance.post(ROOM_API.LEAVE_ROOMS(roomId), {
            guest_uuid: uuid
          })
          .then(() => {
            alert("방에서 나갑니다!");
            navigate(lobbyUrl);
          })
          .catch((error) => {
            console.error("방 나가기 실패:", error);
            alert("당신은 나갈수 없어요. 끄아지옥 ON....");
          });
        } catch (error) {
          console.error("방 나가기 실패:", error);
          alert("당신은 나갈수 없어요. 끄아지옥 ON....");
        }
      }
    }
  };

  /* Start BTN */
  const handleClickStartBtn = async (id) => {
    try {
      await axiosInstance.post(ROOM_API.PLAY_ROOMS(roomId));

      if (sendMessage) {
        sendMessage({
          type: 'word_chain',
          action: 'start_game',
          first_word: '끝말잇기'
        });
        console.log("🔔 start_game 액션 소켓 전송 완료");
      }

    } catch (error) {
      console.error("게임 시작 오류:", error);
      if (error.response && error.response.data && error.response.data.detail) {
        alert(`게임 시작 실패: ${error.response.data.detail}`);
      } else {
        alert("네트워크 오류입니다.");
      }
    }
  }

  /* 웹소켓 연결 사용 부분 개선 */
  const {
    connected,
    messages,
    participants: socketParticipants,
    gameStatus,
    isReady,
    sendMessage,
    toggleReady,
    roomUpdated,
    setRoomUpdated,
    connect, // 연결 메서드 추가
    disconnect // 연결 종료 메서드 추가
  } = useGameRoomSocket(roomId);

  /* 채팅 메시지 상태 및 핸들러 추가 */
  const [chatMessage, setChatMessage] = useState('');

  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = () => {
    if (chatMessage.trim() === '') return;

    if (sendMessage) {
      sendMessage(chatMessage);
      setChatMessage('');
    }
  };

  /* 준비 상태 업데이트 핸들러 수정 */
  const handleReady = () => {
    toggleReady(); // 새로운 toggleReady 함수 사용
  };


  /* 게임 시작 후 자동 이동 */
  useEffect(() => {
    console.log("🧭 gameStatus 변화 감지:", gameStatus);

    if (gameStatus && typeof gameStatus === 'string' && gameStatus.toLowerCase() === 'playing') {
      console.log("🎮 게임 상태가 'playing'으로 감지됨 -> 게임페이지 이동 준비 중");
      setRedirectingToGame(true);
      setTimeout(() => {
        if (disconnect) {
          console.log("게임 시작 전: 웹소켓 연결 종료 시도");
          disconnect();
        }
        console.log("🕹️ navigate 실행");
        navigate(gameUrl(roomId));
      }, 2500);
    }
  }, [gameStatus, roomId, navigate]);

  // socketParticipants 변경 모니터링
  useEffect(() => {
    console.log("👥 socketParticipants 변경됨:", socketParticipants);
  }, [socketParticipants]);

  // socketParticipants에서 'playing' 상태 감지 시 2초 안내 후 게임 페이지로 이동
  useEffect(() => {
    if (socketParticipants && socketParticipants.length > 0) {
      const anyPlaying = socketParticipants.some(
        participant => participant.status && participant.status.toLowerCase() === 'playing'
      );

      if (anyPlaying) {
        console.log("👾 참가자 중 'playing' 상태 발견 -> 2초 메세지 후 게임 페이지로 이동");
        setShowRedirectMessage(true);
        setTimeout(() => {
          if (disconnect) {
            console.log("참가자 준비 완료 감지: 웹소켓 연결 종료 시도");
            disconnect();
          }
          navigate(gameUrl(roomId));
        }, 2000);
      }
    }
  }, [socketParticipants, roomId, navigate]);

  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      console.log('마지막 메시지 전체:', lastMsg);
      console.log('마지막 메시지 닉네임:', lastMsg.nickname);
      console.log('마지막 메시지 내용:', lastMsg.message);
    }
  }, [messages]);

  useEffect(() => {
    // 메시지 배열이 업데이트될 때마다 로그 출력
    console.log("현재 메시지 배열:", messages);

    // 메시지가 있을 경우 각 메시지의 닉네임을 확인
    if (messages.length > 0) {
      messages.forEach((msg, idx) => {
        console.log(`메시지 ${idx} 닉네임:`, msg.nickname);
      });
    }
  }, [messages]);

  useEffect(() => {
    // UUID 확인 로직 추가
    const checkUuidConsistency = async () => {
      const { uuid } = guestStore.getState();

      if (!uuid) {
        // UUID가 없는 경우 로그인 API 호출
        try {
          const response = await axiosInstance.post('/guests/login');
          console.log("로그인 응답:", response.data);

          // 응답 데이터로 게스트 정보 업데이트
          guestStore.getState().setGuestInfo({
            uuid: response.data.uuid,
            nickname: response.data.nickname,
            guest_id: response.data.guest_id
          });

          console.log("게스트 스토어 업데이트 완료:", guestStore.getState());
        } catch (error) {
          console.error("로그인 실패:", error);
          alert("서버 연결에 문제가 있습니다");
          navigate("/");
        }
      }
    };

    checkUuidConsistency();
  }, [navigate]);

  // 웹소켓 연결 상태 모니터링 및 재연결 로직 추가
  useEffect(() => {
    console.log("웹소켓 연결 상태:", connected ? "연결됨" : "연결 안됨");

    // 연결이 안 되어 있으면 명시적으로 연결 시도
    if (!connected && connect) {
      console.log("웹소켓 연결 시도...");
      connect();
    }

    // 컴포넌트 언마운트 시 연결 종료
    return () => {
      console.log("컴포넌트 언마운트: 웹소켓 연결 종료");
      // if (disconnect) disconnect();
    };
  }, [connected, connect, disconnect]);

  // 웹소켓 참가자 정보와 API 참가자 정보 동기화
  useEffect(() => {
    if (connected && socketParticipants && socketParticipants.length > 0) {
      console.log("소켓에서 받은 참가자 정보:", socketParticipants);
      setParticipants(socketParticipants);
    }
  }, [connected, socketParticipants]);

  // 게임 상태 변경 시 처리 (playing 상태면 게임 페이지로 2.5초 후 이동)
  useEffect(() => {
    console.log("✅ gameStatus 감지됨:", gameStatus);
    if (gameStatus === 'playing') {
      console.log("게임 상태가 'playing' -> 게임 페이지로 2500ms 후 이동 예정");
      setTimeout(() => {
        console.log("🕹️ navigate(game) 실행됨");
        navigate(gameUrl(roomId));
      }, 1000);
    }
  }, [gameStatus, roomId, navigate]);

  // roomUpdated 이벤트 처리 수정
  useEffect(() => {
    // roomUpdated가 true이면 방 정보를 다시 가져옴
    if (roomUpdated) {
      console.log('방 업데이트 트리거 감지, 방 정보 새로고침');
      fetchRoomData();
      // 정보를 가져온 후 상태 초기화
      setRoomUpdated(false);
    }
  }, [roomUpdated]);

  // 추가: 주기적으로 웹소켓 연결 상태 확인
  useEffect(() => {
    const checkWebSocketConnection = () => {
      console.log("웹소켓 연결 상태 주기적 확인:", connected ? "연결됨" : "연결 안됨");

      // 연결이 끊어진 경우 재연결 시도
      if (!connected && connect) {
        console.log("웹소켓 연결 끊김 감지, 재연결 시도...");
        connect();
      }
    };

    // 10초마다 연결 상태 확인
    const intervalId = setInterval(checkWebSocketConnection, 10000);

    return () => clearInterval(intervalId);
  }, [connected, connect]);

  if (showRedirectMessage) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-white">
        <div className="text-center text-2xl font-extrabold text-red-500 animate-pulse leading-relaxed">
          잘못된 접근입니다. <br /> 게임페이지로 이동합니다...
        </div>
      </div>
    );
  }
  if (redirectingToGame) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-white">
        <div className="text-center text-2xl font-extrabold text-red-600 animate-pulse leading-relaxed">
          게임을 로딩중입니다 ... <br /><strong>끄아하러가요</strong>
        </div>
      </div>
    );
  }

  if (isLoading || loadingDelay) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-white">
        <div className="text-center text-2xl font-bold animate-pulse">
          로비로 이동합니다 <br />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-white flex flex-col items-center pt-5 relative overflow-y-auto">
      {/* 접속 상태, 나가기 버튼, 게임 정보 (통합) */}
      <div className="w-full px-6 py-4 bg-white border border-gray-300 rounded-md shadow-sm flex flex-col gap-2 mb-4">
        <div className="w-full flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-gray-700 font-semibold text-sm">접속됨</span>
          </div>
          <button
            onClick={handleClickExit}
            className={`px-4 py-2 ${isOwner ? 'bg-red-600' : 'bg-red-500'} text-white rounded-lg shadow hover:bg-red-700 transition-all`}
          >
            {isOwner ? '방 삭제' : '나가기'}
          </button>
        </div>
        <div className="w-full flex justify-center mt-4 mb-4">
          <div className="w-[30%] text-center text-base text-gray-700 font-semibold">
            게임 모드: {roomInfo?.game_mode === 'acade' || roomInfo?.game_mode === 'arcade' ? "아케이드" : roomInfo?.game_mode || "모드 없음"}
          </div>
          <div className="w-[30%] text-center text-base text-gray-700 font-semibold">
            방 제목: {roomInfo?.title || "제목 없음"}
          </div>
          <div className="w-[30%] text-center text-base text-gray-700 font-semibold">
            인원: {participants.length} / {roomInfo?.max_players || 8}
          </div>
        </div>
      </div>

      {/* Players */}
      <div className="flex flex-row flex-wrap justify-center gap-4 w-full px-4 mb-auto">
        {participants.map((player, index) => (
          <div
            key={player.guest_id || index}
            className={`w-[200px] h-[240px] ${
              player.is_creator
                ? 'bg-white'
                : player.status === 'READY' || player.status === 'ready'
                ? 'bg-[#fff0e0]'
                : 'bg-gray-100'
            } rounded-xl shadow flex flex-col items-center justify-center gap-2 p-4 border`}
          >
            <div className="w-[70px] h-[70px] bg-[#fde2e4] rounded-full flex items-center justify-center text-xl font-bold text-gray-700">
              {player.nickname?.charAt(0)?.toUpperCase() || 'G'}
            </div>
            <div className="font-bold text-sm text-gray-800">
              {player.nickname || `Guest_${player.guest_id}`}
            </div>
            {!player.is_creator && (
              <div
                className={`text-xs px-3 py-1 rounded-full font-semibold ${
                  player.status === 'READY' || player.status === 'ready'
                    ? 'bg-yellow-300 text-gray-800'
                    : player.status === 'PLAYING' || player.status === 'playing'
                    ? 'bg-blue-400 text-white'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                {(player.status === 'READY' || player.status === 'ready') && '준비완료'}
                {(player.status === 'PLAYING' || player.status === 'playing') && '게임중'}
                {(!player.status || player.status === 'WAITING' || player.status === 'waiting') && '대기중'}
              </div>
            )}
            {player.is_creator && (
              <div className="text-xs px-3 py-1 bg-red-200 text-red-700 font-semibold rounded-full">
                방장
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 준비 버튼 또는 게임 시작 버튼 (채팅창 바로 위로 이동) */}
      {isOwner ? (
        <div className="w-full text-center mt-8 mb-4">
          <div className="relative inline-block group">
            <button
              onClick={() => {
                const allNonOwnerPlayersReady = socketParticipants.every(player =>
                  player.is_creator || player.status === 'READY' || player.status === 'ready'
                );

                if (participants.length >= 2 && allNonOwnerPlayersReady) {
                  handleClickStartBtn();
                } else if (participants.length < 2) {
                  alert('게임 시작을 위해 최소 2명의 플레이어가 필요합니다.');
                } else {
                  alert('모든 플레이어가 준비 상태여야 합니다.');
                }
              }}
              className={`px-6 py-2 rounded-lg shadow transition-all font-bold ${participants.length >= 2
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-400 text-white cursor-not-allowed'
                }`}
            >
              게임 시작
            </button>
            {participants.length < 2 && (
              <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-black text-white text-sm px-4 py-2 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 shadow-md">
                2인 이상일 때 게임을 시작할 수 있습니다
              </div>
            )}
          </div>
        </div>
      ) : (
        !isOwner && (
          <button
            onClick={handleReady}
            className={`mt-8 mb-4 px-6 py-2 ${isReady
              ? 'bg-green-500 hover:bg-green-600'
              : 'bg-yellow-500 hover:bg-yellow-600'
              } text-white rounded-lg shadow transition-all`}
          >
            {isReady ? '준비완료' : '준비하기'}
          </button>
        )
      )}

      {/* 채팅 섹션 (고정 아님, 기존 스타일로 복원) */}
      <div className="w-full mt-4 border border-gray-300 rounded-lg bg-white flex flex-col h-[300px] overflow-hidden shadow-md">
        {/* 채팅 상단 바 */}
        <div className="bg-slate-900 text-white text-center py-2 font-bold">
          채팅
        </div>

        {/* 채팅 메시지 목록 */}
        <div className="flex-1 overflow-y-auto px-4 py-2 bg-gray-50 text-sm" ref={chatContainerRef}>
          {messages.length > 0 ? (
            messages.map((msg, i) => {
              const isSystem = msg.type === 'system';
              const isSelf = String(msg.guest_id) === String(guestStore.getState().guest_id);

              return (
                <div key={i} className={`mb-2 ${isSystem ? 'text-center text-gray-600' : ''}`}>
                  {isSystem ? (
                    <div>
                      <span className="text-blue-500 font-semibold">시스템</span>{' '}
                      <span className="text-xs text-gray-400 ml-1">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                      <div>{msg.message}</div>
                    </div>
                  ) : (
                    <div className={`w-full flex mb-2 ${isSelf ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex flex-col items-start max-w-[80%] text-sm ${isSelf ? 'items-end text-right' : 'items-start text-left'}`}>
                        <span className={`font-bold mb-1 ${isSelf ? 'text-orange-500' : 'text-blue-600'}`}>
                          {msg.nickname || `게스트_${msg.guest_id}`}
                        </span>
                        <div className="bg-white border rounded px-2 py-1 shadow text-black break-words">
                          {msg.message || ''}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center text-gray-400">아직 메시지가 없습니다</div>
          )}
        </div>

        {/* 채팅 입력창 */}
        <div className="flex border-t border-gray-300 p-2 bg-white">
          <input
            type="text"
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="채팅 메시지를 입력하세요..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none"
          />
          <button
            onClick={handleSendMessage}
            className="bg-blue-500 text-white px-4 py-2 rounded-r-md hover:bg-blue-600"
          >
            전송
          </button>
        </div>
      </div>

    </div>
  )
}

export default GameLobbyPage