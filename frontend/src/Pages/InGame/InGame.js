import { useEffect, useState } from 'react';
import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axiosInstance from '../../Api/axiosInstance';
import { ROOM_API } from '../../Api/roomApi';
import { gameLobbyUrl } from '../../Component/urls';
import Layout from './Section/Layout';
import Timer from './Section/Timer';
import useTopMsg from './Section/TopMsg';
import TopMsgAni from './Section/TopMsg_Ani';
import EndPointModal from './Section/EndPointModal';
import userIsTrue from '../../Component/userIsTrue';
import guestStore from '../../store/guestStore';
import { getCurrentTurnGuestId, requestCurrentTurn } from './Socket/mainSocket';

import { connectSocket, getSocket, setReceiveWordHandler, submitWordChainWord, requestStartWordChainGame, requestEndWordChainGame, requestSkipTurn } from './Socket/mainSocket';
import { sendWordToServer } from './Socket/kdataSocket';
// import { submitWordChainWord, requestStartWordChainGame } from './Socket/mainSocket'; // ✅ 끝말잇기 소켓 헬퍼 불러오기

const time_gauge = 40;

function InGame() {
  // Helper to get owner info from participants
  const getOwnerInfo = (participants) =>
    participants.find(p =>
      p.is_owner === true || p.is_owner === "true" ||
      p.is_creator === true || p.is_creator === "true"
    );
  // Helper to update current turn
  const updateCurrentTurn = (id) => {
    if (id !== undefined && id !== null) {
      setCurrentTurnGuestId(id);
    }
  };
  const hasConnectedRef = useRef(false);
  const [itemList, setItemList] = useState([]); // submitted word history
  const [earnedItems, setEarnedItems] = useState([
    { id: 1, name: '🔥불꽃 아이템', desc: '4글자 단어 입력 보상' },
    { id: 2, name: '❄️얼음 아이템', desc: '빙결 공격' },
    { id: 3, name: '⚡번개 아이템', desc: '빠른 입력 보상' }
  ]); // earned items (not word history)
  const [quizMsg, setQuizMsg] = useState('');
  const { gameid } = useParams();
  const navigate = useNavigate();
  const [gameEnded, setGameEnded] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  const [currentTurnGuestId, setCurrentTurnGuestId] = useState(null);


  const [socketParticipants, setSocketParticipants] = useState([]);
  const [gameStatus, setGameStatus] = useState('waiting');
  const socketParticipantsRef = useRef(setSocketParticipants);
  useEffect(() => {
    socketParticipantsRef.current = setSocketParticipants;
  }, [setSocketParticipants]);
  const [finalResults, setFinalResults] = useState([]);
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

          // 약간 대기 시간 주기 (300ms로 증가)
          await new Promise(resolve => setTimeout(resolve, 300)); // Increased wait to ensure cookie is set

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

        // ⛔ 최종 guestUuid 유효성 확인
        if (!guestUuid || guestUuid.length < 5) {
          throw new Error("🚫 guestUuid 최종 확인 실패: 쿠키에 값 없음");
        }

        if (!hasConnectedRef.current && guestUuid) {
          connectSocket(gameid);
          hasConnectedRef.current = true;
        }

        // 🌟 참가자 정보 API 호출
        try {
          const res = await axiosInstance.get(ROOM_API.get_ROOMSUSER(gameid));
          if (res.data && Array.isArray(res.data)) {
            console.log('🌟 API로 참가자 정보 받아옴:', res.data);
            setSocketParticipants(res.data);
            socketParticipantsRef.current(res.data);
            console.log('🌟 참가자 정보 setSocketParticipants 호출됨 via API');
            // 👑 방장 정보 추출 및 currentTurnGuestId 업데이트
            const ownerInfo = getOwnerInfo(res.data);
            if (ownerInfo) {
              console.log('👑 방장 정보:', ownerInfo);
              setCurrentTurnGuestId(ownerInfo.guest_id);
            } else {
              console.warn('⚠️ 방장 정보 없음 (is_owner/is_creator가 true인 참가자 없음)', res.data);
            }
          } else {
            console.error('❌ 참가자 API 응답이 예상과 다름:', res.data);
          }
        } catch (error) {
          console.error('❌ 참가자 API 호출 실패:', error.response?.data || error.message);
        }

        setReceiveWordHandler((data) => {
          console.log("🛬 소켓 데이터 수신:", data);
          switch (data.type) {
            case "user_joined":
              console.log("👤 user_joined 수신:", data.data);
              break;
            case "participants_update":
              console.log('✅ participants_update 수신:', data);
              console.log('🧩 참가자 목록:', data.participants);
              if (Array.isArray(data.participants)) {
                console.log('🎯 participants 배열 길이:', data.participants.length);
                console.table(data.participants);
                setSocketParticipants(data.participants);
                socketParticipantsRef.current(data.participants);
                // 👑 [참가자 갱신] 방장 정보 추출 및 currentTurnGuestId 업데이트
                const updatedOwnerInfo = getOwnerInfo(data.participants);
                if (updatedOwnerInfo) {
                  console.log('👑 [참가자 갱신] 방장 정보:', updatedOwnerInfo);
                  setCurrentTurnGuestId(updatedOwnerInfo.guest_id);
                } else {
                  console.warn('⚠️ [참가자 갱신] 방장 정보 없음', data.participants);
                }
                const myGuestId = guestStore.getState().guest_id;
                const myInfo = data.participants.find(p => p.guest_id === myGuestId);
                if (!myInfo) {
                  console.warn("⚠️ 현재 사용자 정보를 참가자 목록에서 찾을 수 없습니다. guest_id:", myGuestId);
                } else {
                  console.log("✅ 현재 사용자 정보:", myInfo);
                }
              } else {
                console.error("❌ participants가 배열이 아님!", data.participants);
              }
              break;
            case "connected":
              console.log("✅ connected 수신:", data);
              break;
            case "word_chain_started":
              console.log('✅ word_chain_started 수신:', data);
              if (data.first_word) {
                setQuizMsg(data.first_word);
              }
              updateCurrentTurn(data.current_player_id);
              console.log("🎯 게임 시작 - 현재 턴 플레이어 ID 설정 (from word_chain_started):", data.current_player_id);
              setGameStatus('playing');
              requestCurrentTurn();
              break;
            case "word_chain_state":
              updateCurrentTurn(data.current_player_id);
              break;
            case "word_validation_result":
              if (data.valid) {
                setItemList(prev => {
                  if (prev.find(item => item.word === data.word)) return prev;
                  return [{ word: data.word, desc: data.meaning || "유효한 단어입니다." }, ...prev];
                });
              }
              break;
            case "word_chain_game_ended":
              setGameEnded(true);
              setShowEndPointModal(true);
              setFinalResults(data.results || []);
              setGameStatus('ended');
              setTimeout(() => {
                handleMoveToLobby();
              }, 5000);
              break;
            case "user_left":
              console.log("👋 user_left 수신:", data);
              break;
            case "error":
              console.error("❌ 에러 수신:", data.message);
              break;
            default:
              console.warn('📭 처리하지 않는 타입 수신:', data.type, data);
          }
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
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
        // 소켓 연결 후 3초 대기 (딜레이를 3초 주는 코드)
        await new Promise(resolve => setTimeout(resolve, 3000));

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

  useEffect(() => {
    setRandomQuizWord();
  }, []);


  // 테스트용 하드코딩
  // --------------------------------
  useEffect(() => {
    // ✅ 소켓 연결 실패 시 강제로 시작 상태 세팅 (임시 테스트용)
    if (process.env.NODE_ENV === 'development' && !gameStarted) {
      console.warn("⚠️ [개발모드] 강제 게임 시작 상태로 진입");
      setGameStarted(true);
      setGameStatus('playing');
      setCurrentTurnGuestId(guestStore.getState().guest_id); // 자신을 턴 주인으로
    }
  }, []);

  //----------------------------------

useEffect(() => {
  if (!quizMsg) return;
  const lastChar = quizMsg.charAt(quizMsg.length - 1);
  const expectedMessage = `'${lastChar}'로 시작하는 단어를 입력하세요.`;

  setMessage((prevMsg) => {
    if (prevMsg !== expectedMessage) {
      console.log(`✅ 시작 안내 메시지 세팅: ${expectedMessage}`);
      return expectedMessage;
    }
    return prevMsg;
  });
}, [quizMsg]);

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

    // Example: handle earned item logic here if needed
    // setEarnedItems(...) if earned items are awarded on typing done

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

      // ------------------------------
      // [Mock] 아이템 드랍 및 UI 업데이트 로직
      const submittedWord = inputValue.trim();
      if (submittedWord.length >= 4) {
        const chance = Math.random();
        const dropRate = 0.3; // 30% 확률 예시
        if (chance < dropRate) {
          const newItem = {
            id: Date.now(), // 임시 ID
            name: '🔥불꽃 아이템',
            desc: `${submittedWord.length}글자 단어 입력 보상`,
          };
          console.log('🎁 아이템 획득!', newItem);
          setEarnedItems(prev => {
            const updatedList = [newItem, ...prev];
            return updatedList.slice(0, 4); // 최대 4개까지만 유지
          }); // 유저 프로필에 해당 아이템 추가
        }
      }
      // ------------------------------

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



// 🚫 비활성화: 백엔드에서 word_chain_started 받아야 하므로 강제 세팅 제거
/*
useEffect(() => {
  if (!gameStarted && socketParticipants.length > 0 && currentTurnGuestId === null) {
    const owner = socketParticipants.find(p =>
      p.is_owner === true || p.is_owner === "true" ||
      p.is_creator === true || p.is_creator === "true"
    );
    if (owner) {
      console.log("🚀 [최적화] 방장 guest_id를 currentTurnGuestId로 강제 세팅:", owner.guest_id);
      setCurrentTurnGuestId(owner.guest_id);
      setGameStarted(true);
    }
  }
}, [socketParticipants, currentTurnGuestId, gameStarted]);
*/

useEffect(() => {
  const timer = setTimeout(() => {
    const isOwner = socketParticipants.find(p => p.is_owner || p.is_creator)?.guest_id === guestStore.getState().guest_id;
    if (isOwner && gameStatus === 'waiting') {
      console.log("⏱️ [자동 시작] 5초 경과, 방장이므로 게임 시작 요청 보냄");
      requestStartWordChainGame("끝말잇기");
    }
  }, 5000);
  return () => clearTimeout(timer);
}, [socketParticipants, gameStatus]);

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
        earnedItems={earnedItems}
        showCount={showCount}
        players={socketParticipants}
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
        gameEnded={gameEnded}
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
          {/** 테스트용 턴넘기기 */}
            {/** ---------------------------- */}
          <button
            onClick={() => {
              const currentIdx = socketParticipants.findIndex(p => p.guest_id === currentTurnGuestId);
              const nextIdx = (currentIdx + 1) % socketParticipants.length;
              const nextTurnGuestId = socketParticipants[nextIdx].guest_id;
              setCurrentTurnGuestId(nextTurnGuestId);
              console.log("⏩ 강제로 턴 넘김 → 다음 guest_id:", nextTurnGuestId);
            }}
            className="fixed bottom-32 right-4 bg-purple-500 text-white px-4 py-2 rounded-lg shadow-md z-[999]"
          >
            다음 턴 넘기기 (테스트용)
          </button>
           {/** ---------------------------- */}
        </div>
      </div>
      {socketParticipants.length > 0 && guestStore.getState().guest_id === socketParticipants.find(p => p.is_owner || p.is_creator)?.guest_id && (
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
      {socketParticipants.length > 0 && guestStore.getState().guest_id !== socketParticipants.find(p => p.is_owner || p.is_creator)?.guest_id && (
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