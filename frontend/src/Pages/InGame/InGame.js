import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axiosInstance from '../../Api/axiosInstance';
import { ROOM_API } from '../../Api/roomApi';
import { gameLobbyUrl } from '../../Component/urls';
import Layout from './Section/Layout';
import Timer from './Section/Timer';
import useTopMsg from './Section/TopMsg';
import TopMsgAni from './Section/TopMsg_Ani';
import EndPointModal from './Section/EndPointModal';
import useGameRoomSocket from '../../hooks/useGameRoomSocket';
import userIsTrue from '../../Component/userIsTrue';
import guestStore from '../../store/guestStore';
import { getCurrentTurnGuestId } from './Socket/mainSocket';

import { connectSocket, getSocket, setReceiveWordHandler, submitWordChainWord, requestStartWordChainGame, requestEndWordChainGame, requestSkipTurn } from './Socket/mainSocket';
import { sendWordToServer } from './Socket/kdataSocket';
// import { submitWordChainWord, requestStartWordChainGame } from './Socket/mainSocket'; // ✅ 끝말잇기 소켓 헬퍼 불러오기

const time_gauge = 40;

function InGame() {
  const [itemList, setItemList] = useState([]);
  const [quizMsg, setQuizMsg] = useState('햄');
  const { gameid } = useParams();
  const navigate = useNavigate();
  const [gameEnded, setGameEnded] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  const [currentTurnGuestId, setCurrentTurnGuestId] = useState(null);

  // 퀴즈 제시어 

  const {
    participants: socketParticipants,
    gameStatus,
    finalResults,
  } = useGameRoomSocket(gameid);

  useEffect(() => {
    if (gameStatus === 'playing' && currentTurnGuestId !== null) {
      console.log('✅ 현재 방 상태가 playing이고, currentTurnGuestId도 있음! => gameStarted true로 세팅');
      setGameStarted(true);
    }
  }, [gameStatus, currentTurnGuestId]);

  const [showEndPointModal, setShowEndPointModal] = useState(false);

  const setRandomQuizWord = () => {
    if (itemList.length > 0) {
      const randomWord = itemList[Math.floor(Math.random() * itemList.length)].word;
      setQuizMsg(randomWord);
    }
  };

useEffect(() => {
  setReceiveWordHandler((data) => {
    setGameStarted(true);
    console.log("🛬 소켓 데이터 수신:", data);
    console.log("💬 서버에서 수신:", data);
    // ✅ 오직 'word_validation_result' + valid: true 인 경우만 처리
    if (data.type === "word_validation_result" && data.valid) {
      console.log('✅ 유효한 단어 수신:', data.word);

      setItemList(prev => {
        if (prev.find(item => item.word === data.word)) return prev;
        const updated = [{ word: data.word, desc: data.meaning || "유효한 단어입니다." }, ...prev];
        console.log('🆕 [수정] 업데이트된 itemList:', updated);
        return updated;
      });
      // Note: The frontend expects the server to send a "word_chain_word_submitted" event
      // with 'next_turn_guest_id' to properly update the turn after a valid word submission.
    }

    // 🔄 word_chain_started 처리 (업데이트)
    if (data.type === "word_chain_started") {
      console.log('✅ [InGame] word_chain_started 처리 완료 - 현재 턴은:', getCurrentTurnGuestId());
      setCurrentTurnGuestId(getCurrentTurnGuestId());
    }

    // ✅ 서버에서 현재 턴 정보 응답 시 처리
    if (data.type === "word_chain_state" && data.current_player_id !== undefined && data.current_player_id !== null) {
      console.log('✅ [InGame] word_chain_state로 현재 턴 정보 수신:', data.current_player_id);
      setCurrentTurnGuestId(data.current_player_id);
    }

    if (data.type === "word_chain_word_submitted") {
      if (data.next_turn_guest_id !== undefined && data.next_turn_guest_id !== null) {
        console.log('🎯 단어 제출 완료 - 다음 턴:', data.next_turn_guest_id);
        setCurrentTurnGuestId(data.next_turn_guest_id);
      } else {
        console.error('🚫 [word_chain_word_submitted] next_turn_guest_id 없음!');
      }
    }

    // 🔥 추가: 게임 종료 브로드캐스트 받으면 모달 열기
    if (data.type === "word_chain_game_ended") {
      console.log('🏁 게임 종료 알림 수신:', data);
      setGameEnded(true);
      setShowEndPointModal(true);
      setTimeout(() => {
        handleMoveToLobby();
      }, 5000);
    }
  });
}, []);

  useEffect(() => {
    setRandomQuizWord();
  }, []);
  
  useEffect(() => {
    const checkGuest = async () => {
      const result = await userIsTrue();
      if (!result) {
        alert("어멋 어딜들어오세요 Cut !");
        navigate("/")
      }
    };
    checkGuest();
  }, []);

  const [timeOver, setTimeOver] = useState(false);
  const [frozenTime, setFrozenTime] = useState(null);
  const [inputTimeLeft, setInputTimeLeft] = useState(12);

  const [timeLeft, setTimeLeft] = useState(120);
  const resetTimer = () => setTimeLeft(120);

  const [catActive, setCatActive] = useState(true);

  useEffect(() => {
    if (gameEnded || timeLeft <= 0) return;
    const interval = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [timeLeft, gameEnded]);

  const [usedLog, setUsedLog] = useState([]);
  const [specialPlayer, setSpecialPlayer] = useState('부러');

  const [inputValue, setInputValue] = useState('');
  const [message, setMessage] = useState('');
  const [showCount, setShowCount] = useState(5);

  // 애니메이션 상태
  const [typingText, setTypingText] = useState('');
  const [pendingItem, setPendingItem] = useState(null);

  const [reactionTimes, setReactionTimes] = useState([]);

  const { crashMessage } = useTopMsg({
    inputValue,
    itemList,
    usedLog,
    setItemList,
    setUsedLog,
    setMessage,
    setInputValue,
    setTypingText,
    setPendingItem,
    quizMsg,
    setQuizMsg
  });

  const [usedWords, setUsedWords] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [lastCharacter, setLastCharacter] = useState('');
  
useEffect(() => {
  async function prepareGuestAndConnect() {
    try {
      let attempts = 0;
      let guestUuid = null;

      while (attempts < 2) {
        guestUuid = document.cookie
          .split('; ')
          .find(row => row.startsWith('kkua_guest_uuid='))
          ?.split('=')[1];

        if (guestUuid) break; // ✅ 쿠키 있으면 바로 탈출

        // ✨ 쿠키 없으면 게스트 로그인 시도
        const loginRes = await axiosInstance.post('/guests/login');
        guestUuid = loginRes.data.uuid;
        document.cookie = `kkua_guest_uuid=${guestUuid}; path=/`;

        // 약간 대기 시간 주기
        await new Promise(resolve => setTimeout(resolve, 100));

        attempts++;
      }

      // 최종 guestUuid 다시 체크
      guestUuid = document.cookie
        .split('; ')
        .find(row => row.startsWith('kkua_guest_uuid='))
        ?.split('=')[1];

      if (!guestUuid) {
        throw new Error("🚫 쿠키 세팅 실패: guestUuid 없음");
      }

      connectSocket(gameid);
      await new Promise(resolve => setTimeout(resolve, 1000)); 
      getCurrentTurnGuestId();
      // 소켓 연결 후 3초 대기 (딜레이를 3초 주는 코드)
      await new Promise(resolve => setTimeout(resolve, 3000));

        // ✅ 안전 전송 준비: 소켓 readyState 감시
        const waitForSocketConnection = (callback) => {
          const socket = getSocket();
          if (!socket) return console.error("❌ 소켓 없음");

          if (socket.readyState === WebSocket.OPEN) {
            callback();
          } else {
            console.log('⏳ 소켓 연결 대기중...');
            setTimeout(() => waitForSocketConnection(callback), 100); // 0.1초 간격 재시도
          }
        };

    } catch (error) {
      console.error("❌ 방 입장 또는 소켓 연결 실패:", error.response?.data || error.message);
      alert("방 입장 실패 또는 서버 연결 실패");
      navigate("/");
    }
  }

  if (gameid) {
    prepareGuestAndConnect();
  }
}, [gameid, navigate]);
  

  // 나머지 게임 로직은 기존 그대로 ↓↓↓

  const handleTypingDone = () => {
    if (!pendingItem) return;

    setUsedLog(prev => (!prev.includes(pendingItem.word) ? [...prev, pendingItem.word] : prev));
    setItemList(prev => (!prev.find(item => item.word === pendingItem.word) ? [...prev, pendingItem] : prev));
    setQuizMsg(pendingItem.word.charAt(pendingItem.word.length - 1));

    setSpecialPlayer(prev => {
      const currentIndex = socketParticipants.map(p => p.nickname).indexOf(prev);
      return socketParticipants.map(p => p.nickname)[(currentIndex + 1) % socketParticipants.length];
    });

    sendWordToServer({
      user: specialPlayer,
      word: pendingItem.word,
      itemUsed: false,
    });

    setTypingText('');
    setPendingItem(null);
    setInputTimeLeft(12);
    setCatActive(true);
  };

  useEffect(() => {
    // 모바일은 3개, PC는 4개 보여주게 함
    const updateCount = () => {
      setShowCount(window.innerWidth >= 400 ? 4 : 3);
    };
    updateCount();
    window.addEventListener('resize', updateCount);
    return () => window.removeEventListener('resize', updateCount);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setInputTimeLeft(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (inputTimeLeft === 0 && inputValue.trim() === '' && typingText === '') {
      setTimeout(() => {
        setMessage('게임종료!');
        setFrozenTime(timeLeft);
        setRandomQuizWord();
        setCatActive(false);
        resetTimer();
      }, 500);
    }
  }, [inputTimeLeft, inputValue, typingText, timeLeft, resetTimer]);

  // ✅ 단어 제출 함수 (더 안전하게 participant/turn 체크)
  const handleSubmitWord = () => {
    if (!gameStarted) {
      alert('⛔ 게임이 아직 시작되지 않았습니다.');
      return;
    }
    console.log("🚥 내 guest_id:", guestStore.getState().guest_id);
    console.log("🚥 현재 currentTurnGuestId:", currentTurnGuestId);

    if (socketParticipants.length === 0) {
      alert('⛔ 참가자 정보가 아직 없습니다.');
      return;
    }

    if (currentTurnGuestId === null) {
      alert('⛔ 아직 게임 시작 전이거나 턴 정보가 없습니다.');
      return;
    }

    if (guestStore.getState().guest_id !== currentTurnGuestId) {
      alert('⛔ 현재 당신 차례가 아닙니다.');
      return;
    }

    if (inputValue.trim() !== '') {
      submitWordChainWord(inputValue.trim(), guestStore.getState().guest_id, currentTurnGuestId);
      setInputValue('');
    }
  };

  const crashKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSubmitWord();
    }
  };

  const handleClickFinish = async () => {
    try {
      await axiosInstance.post(ROOM_API.END_ROOMS(gameid));
      requestEndWordChainGame();
      setShowEndPointModal(false);
      setTimeout(() => setShowEndPointModal(true), 100); // 결과 모달 강제 띄우기
      setTimeout(() => {
        handleMoveToLobby();
      }, 5000);
    } catch (error) {
      console.log(error)
      alert("종료된 게임이 아닙니다.");
    }
  };

  const handleMoveToLobby = () => {
    const sock = getSocket();
    if (sock && sock.readyState === WebSocket.OPEN) {
      sock.close();
      console.log('✅ 로비 이동 전에 소켓 정상 종료');
    }
    navigate(gameLobbyUrl(gameid));
  };

useEffect(() => {
  // ✅ 참가자 없으면 2초 후 자동 갱신 재요청
  if (socketParticipants.length === 0) {
    const retry = setTimeout(() => {
      const socket = getSocket();
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "request_participants" }));
        console.log('🔄 참가자 리스트 갱신 요청 보냄');
      }
    }, 2000);
    return () => clearTimeout(retry);
  }
}, [socketParticipants]);

// ✅ 방장 기준으로 currentTurnGuestId 강제 세팅 (최적화)
useEffect(() => {
  if (!gameStarted && socketParticipants.length > 0 && currentTurnGuestId === null) {
    const owner = socketParticipants.find(p => p.is_owner);
    if (owner) {
      console.log("🚀 [최적화] 방장 guest_id를 currentTurnGuestId로 강제 세팅:", owner.guest_id);
      setCurrentTurnGuestId(owner.guest_id);
      setGameStarted(true); // 게임 시작 플래그도 함께 세팅
    }
  }
}, [socketParticipants, currentTurnGuestId, gameStarted]);

  // 소켓 언마운트 정리 useEffect 추가
  useEffect(() => {
    return () => {
      const socket = getSocket();
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
        console.log('✅ [InGame] 언마운트 시 소켓 정상 종료');
      }
    };
  }, []);

  return (
    <>
      <Layout
        typingText={typingText}
        handleTypingDone={handleTypingDone}
        quizMsg={quizMsg}
        message={timeOver ? '시간 초과!' : message}
        timeLeft={frozenTime ?? timeLeft}
        timeOver={timeOver}
        itemList={itemList}
        showCount={showCount}
        players={socketParticipants.map(p => p.nickname)}
        specialPlayer={specialPlayer}
        setSpecialPlayer={setSpecialPlayer}
        inputValue={inputValue}
        setInputValue={setInputValue}
        crashKeyDown={crashKeyDown}
        crashMessage={crashMessage}
        time_gauge={time_gauge}
        inputTimeLeft={inputTimeLeft}
        setInputTimeLeft={setInputTimeLeft}
        socketParticipants={socketParticipants}
        finalResults={finalResults}
        usedLog={usedLog}
        reactionTimes={reactionTimes}
        handleClickFinish={handleClickFinish}
        catActive={catActive}
        frozenTime={frozenTime}
        isPlaying={gameStatus === 'playing'}
        isGameEnded={gameEnded}
        gameid={gameid}
        currentTurnGuestId={currentTurnGuestId}
        myGuestId={guestStore.getState().guest_id}
      />
      <div className="w-full max-w-md mx-auto mt-4 p-2 bg-gray-100 rounded-lg shadow">
        <h2 className="text-center font-bold mb-2">📤 전송한 메시지</h2>
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {itemList.length > 0 && (
            <div className="p-4 rounded-2xl border shadow-lg bg-white border-gray-300 drop-shadow-md mx-auto">
              <div className="flex items-center space-x-4 ml-2">
                <div className="w-8 h-8 bg-blue-400 rounded-full"></div>
                <span className="font-semibold text-lg text-black">
                  {itemList[0].word.slice(0, -1)}
                  <span className="text-red-500">{itemList[0].word.charAt(itemList[0].word.length - 1)}</span>
                </span>
              </div>
              <div className="text-gray-500 text-sm ml-2 mt-2 break-words max-w-md text-left">
                {itemList[0].desc}
              </div>
            </div>
          )}
        </div>
      </div>
      {socketParticipants.length > 0 && guestStore.getState().guest_id === socketParticipants.find(p => p.is_owner)?.guest_id && (
        <div className="fixed top-10 left-4 z-50 flex space-x-2">
          <button
            onClick={() => requestStartWordChainGame("끝말잇기")}
            className="bg-green-500 text-white px-4 py-2 rounded-lg shadow hover:bg-green-600 transition"
          >
            게임 시작
          </button>
          <button
  onClick={() => {
    requestSkipTurn();  // ✅ 소켓으로 턴 넘기기 요청
  }}
  className="bg-yellow-400 text-black px-4 py-2 rounded-lg shadow hover:bg-yellow-500 transition"
>
  턴 넘기기
</button>
        </div>
      )}
      {socketParticipants.length > 0 && guestStore.getState().guest_id !== socketParticipants.find(p => p.is_owner)?.guest_id && (
        <div className="fixed bottom-4 left-4 z-50">
          <button
            onClick={handleMoveToLobby}
            className="bg-gray-500 text-white px-4 py-2 rounded-lg shadow hover:bg-gray-600 transition"
          >
            로비 이동
          </button>
        </div>
      )}
      {showEndPointModal && (
        <div className="absolute top-0 left-0 w-full flex flex-col items-center justify-center z-50">
          <EndPointModal
            players={socketParticipants.length > 0 ? socketParticipants.map(p => p.nickname) : []}
            onClose={() => setShowEndPointModal(false)}
            usedLog={usedLog}
            reactionTimes={reactionTimes}
          />
          <button
            onClick={handleMoveToLobby}
            className="mt-4 bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition"
          >
            로비로 이동
          </button>
        </div>
      )}
    </>
  );
}

export default InGame;
