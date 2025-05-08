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

// 1. 고양이 제한시간 시간 게이지 최대값 (상수) 
const time_gauge = 40; 

function InGame() {
  // 2. 방장 식별 헬퍼-> 참가자 배열 중 is_owner || is_creator가 true사람 구함  
  const getOwnerInfo = (participants) =>
    participants.find(p =>
      p.is_owner === true || p.is_owner === "true" ||
      p.is_creator === true || p.is_creator === "true"
    );
  // 3. 현재 턴의 유저 ID가 유효하면 상태에 반영 
  const updateCurrentTurn = (id) => {
    if (id !== undefined && id !== null) {
      setCurrentTurnGuestId(id);
    }
  };
  // 4. useRef(false) 소켓 중복연결 방지. 소켓이 이미 연결됐는지 체크  
  const hasConnectedRef = useRef(false);
  // 5. useState([]) 제출된 단어 상태 체크 
  const [itemList, setItemList] = useState([]); 
  // 6. 
  const [earnedItems, setEarnedItems] = useState([
    { id: 1, name: '🔥불꽃 아이템', desc: '4글자 단어 입력 보상' },
    { id: 2, name: '❄️얼음 아이템', desc: '빙결 공격' },
    { id: 3, name: '⚡번개 아이템', desc: '빠른 입력 보상' }
  ]); 

  // 7. quizMsg 현재 문제 단어 
  const [quizMsg, setQuizMsg] = useState('');
  
  // 8. useParams() 라우터 param를 써서 현재 url의 gameid를 추출 
  const { gameid } = useParams();

  // 9. useNavigate() 페이지 이동, 페이지 전환함수 
  const navigate = useNavigate();
  
  // 10. gameEnded gameStarted 게임의 시작함과 끝남 여부 관리 
  const [gameEnded, setGameEnded] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  // 11. 현재 턴 주인. 현재 단어를 입력할 차례인 유저의 guset_id 
  const [currentTurnGuestId, setCurrentTurnGuestId] = useState(null);

  // 12. socketParticipants + useEffect 소켓콜백 등에서 참조할 수 있도록 ref에 저장 
  const [socketParticipants, setSocketParticipants] = useState([]);
  const [gameStatus, setGameStatus] = useState('waiting');
  const socketParticipantsRef = useRef(setSocketParticipants);
  useEffect(() => {
    socketParticipantsRef.current = setSocketParticipants;
  }, [setSocketParticipants]);

  // 13. 게임 끝나면 최종결과 저장. 
  const [finalResults, setFinalResults] = useState([]);
  
  // 14. 게임 상태가 'playing'이고 턴 정보 있으면 gameStarted를 true로 설정 
  useEffect(() => {
    if (gameStatus === 'playing' && currentTurnGuestId !== null) {
      console.log('✅ 현재 방 상태가 playing이고, currentTurnGuestId도 있음! => gameStarted true로 세팅');
      setGameStarted(true);
    }
  }, [gameStatus, currentTurnGuestId]);

  // 15. 결과 모달 상태. 게임 종료시 모달을 띄울지 여부 
  const [showEndPointModal, setShowEndPointModal] = useState(false);

  // 16. 단어 리스트 중 하나를 무작위로 골라 퀴즈메세지 설정 
  const setRandomQuizWord = () => {
    if (itemList.length > 0) {
      const randomWord = itemList[Math.floor(Math.random() * itemList.length)].word;
      setQuizMsg(randomWord);
    }
  };

  useEffect(() => {
    // 17. 소켓연결 및 유저 식별용 쿠기가 없어도 게스트로그인 시도되도록  
    // kkua_guest_uuid 쿠키를 확인하고, 없으면 API로 게스트 로그인 → 쿠키 저장 → 재시도 (최대 2번)
    async function prepareGuestAndConnect() {
      try {
        let attempts = 0;
        let guestUuid = null;

        // 18. 쿠키확인 && 게스트로그인 
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

          // 19. 쿠키가 세팅되기까지 약간 대기 (300ms) 
          await new Promise(resolve => setTimeout(resolve, 300)); 
          attempts++;
        }

        // 19. 최종 guestUuid 다시 체크
        guestUuid = document.cookie
          .split('; ')
          .find(row => row.startsWith('kkua_guest_uuid='))
          ?.split('=')[1];

        if (!guestUuid) {
          throw new Error("🚫 쿠키 세팅 실패: guestUuid 없음");
        }

        // 20. 쿠키에 유효한 guestUuid 없으면 에러
        if (!guestUuid || guestUuid.length < 5) {
          throw new Error("🚫 guestUuid 최종 확인 실패: 쿠키에 값 없음");
        }

       // 21. 최초 연결 상태 아니고, guestUuid 있으면 소켓 연결
        if (!hasConnectedRef.current && guestUuid) {
          connectSocket(gameid);
          hasConnectedRef.current = true;
        }

        // 22. 참가자 정보 API 호출
        try {
          const res = await axiosInstance.get(ROOM_API.get_ROOMSUSER(gameid));
          if (res.data && Array.isArray(res.data)) {
            console.log('🌟 API로 참가자 정보 받아옴:', res.data);
            setSocketParticipants(res.data);
            socketParticipantsRef.current(res.data);
            console.log('🌟 참가자 정보 setSocketParticipants 호출됨 via API');
            // 23. 방장 정보 추출 및 currentTurnGuestId 업데이트
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

        // 24. 서버에서 보내는 소켓 메시지를 수신해서 처리하는 핸들러
        setReceiveWordHandler((data) => {
          console.log("🛬 소켓 데이터 수신:", data);
          switch (data.type) {
            case "user_joined":
              console.log("👤 user_joined 수신:", data.data);
              break;
            // 25. 참가자 목록이 생긴되었을 때 
            case "participants_update":
              console.log('✅ participants_update 수신:', data);
              console.log('🧩 참가자 목록:', data.participants);
              if (Array.isArray(data.participants)) {
                console.log('🎯 participants 배열 길이:', data.participants.length);
                console.table(data.participants);
                // 26. 참가자 상태 업데이트 
                setSocketParticipants(data.participants);
                socketParticipantsRef.current(data.participants);
                // 27. 방장정보 다시 찾고 턴정보 갱신. currentTurnGuestId 업데이트
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
            // 30. 끝말잇기 게임이 시작되었을 때 
            case "word_chain_started":
              console.log('✅ word_chain_started 수신:', data);
              if (data.first_word) {
                // 31. 첫 제시어 뜨도록 세팅  
                setQuizMsg(data.first_word);
              }

              // 32. 현재 턴 플레이어 설정  
              updateCurrentTurn(data.current_player_id);
              console.log("🎯 게임 시작 - 현재 턴 플레이어 ID 설정 (from word_chain_started):", data.current_player_id);
              
              // 33. 게임 상태를 'playing'으로 변경 
              setGameStatus('playing');

              // 34. 백엔드에 현재 턴 정보 재요청 (확인용?)
              requestCurrentTurn();
              break;

            // 35. 유저가 제출한 단어의 유효성 검사 결과 수신 
            case "word_chain_state":
              updateCurrentTurn(data.current_player_id);
              break;
            case "word_validation_result":
              if (data.valid) {
                // 36. 이미 등록된 단어가 아니라면 리스트에 추가 
                setItemList(prev => {
                  if (prev.find(item => item.word === data.word)) return prev;
                  return [{ word: data.word, desc: data.meaning || "유효한 단어입니다." }, ...prev];
                });
              }
              break;
              // 37. 누군가 단어를 제출했을 때 -> 턴전환 
              case "word_chain_word_submitted":
                console.log("✅ word_chain_word_submitted 수신:", data);
                updateCurrentTurn(data.next_turn_guest_id);
                break;
              //38. 게임 종료 알림 수신 
            case "word_chain_game_ended":
              // 39. 게임 종료 상태로 전환 
              setGameEnded(true);
              // 40. 결과모달 띄우기 
              setShowEndPointModal(true);
              // 41. 최종결과저장 
              setFinalResults(data.results || []);
              // 42. 게임 상태를 'ended'로 전환 
              setGameStatus('ended');
              // 43. 5초 뒤 로비 자동 이동 (?됐었나?)
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
        // 44. 소켓 안정화를 위해 1초 대기
        await new Promise(resolve => setTimeout(resolve, 1000));
        // ✅ 안전 전송 준비: 소켓 readyState 감시
        const waitForSocketConnection = (callback) => {
          const socket = getSocket();
           // 45. 소켓이 연결 완료 상태(OPEN)일 경우 → 콜백 실행
          if (!socket) return console.error("❌ 소켓 없음");
          if (socket.readyState === WebSocket.OPEN) {
            callback();
          } else {
             // 46. 아직 연결 안 됐으면 0.1초 후 재시도
            console.log('⏳ 소켓 연결 대기중...');
            setTimeout(() => waitForSocketConnection(callback), 100); // 0.1초 간격 재시도
          }
        };
        // 47. 소켓 연결 후 3초 대기 (딜레이를 3초 주는 코드)
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (error) {
        console.error("❌ 방 입장 또는 소켓 연결 실패:", error.response?.data || error.message);
        alert("방 입장 실패 또는 서버 연결 실패");
        navigate("/");
      }
    }

    // 48. gameid가 있을 때만 연결 시도 
    if (gameid) {
      prepareGuestAndConnect();
    }
  }, [gameid, navigate]);

  // 49. itemList 중 무작위 단어 하나를 선택하여 quizMsg로 설정 
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

  // 50. quizMsg.charAt(quizMsg.length - 1) 제시어의 마지막 글자를 추출 
  const lastChar = quizMsg.charAt(quizMsg.length - 1);
  const expectedMessage = `'${lastChar}'로 시작하는 단어를 입력하세요.`;

  // 51. 기존에 쓴 메세지와 다를 경우에만 갱신 
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
      // 51. 현재 게스트가 유효한 게스트인지 
      const result = await userIsTrue();
      if (!result) {
        alert("어멋 어딜들어오세요 Cut !");
        // 52. 게스트가 아니면 홈으로 튕김 
        navigate("/")
      }
    };
    checkGuest();
  }, []);


       // ---------------------------------------------------------------
       // ---------------------------------------------------------------
  
       
  //타임오버 boolean값
  const [timeOver, setTimeOver] = (false);
  //InputTimeLeft 시간 초과로 게임 종료 시 남은 전체 게임시간 고정 (필요하지않음 x) 
  const [frozenTime, setFrozenTime] = useState(null);
  //유저 채팅 입력시간
  const [inputTimeLeft, setInputTimeLeft] = useState(12);

  //전체 타이머 (고정 120초)
  const [timeLeft, setTimeLeft] = useState(120);
  // 고정타이머 초기화 함수
  const resetTimer = () => setTimeLeft(120);

  /* 전체 타임아웃 조건문
    게임종료되지않았을때 전체게임시간(120)에서 1초씩 줄어들기
  */
  useEffect(() => {
    if (gameEnded || timeLeft <= 0) return;
    const interval = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [timeLeft, gameEnded]);

  //개인 유저별 입력히스토리
  const [usedLog, setUsedLog] = useState([]);
  //현재 입력중인 유저를 담은값
  const [specialPlayer, setSpecialPlayer] = useState();

  //유저 입력창
  const [inputValue, setInputValue] = useState('');
  //상단 메세지(유저 입력 시 상단 박스에 뜨기)
  const [message, setMessage] = useState('');
  //전체 유저 입력값 히스토리 
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
        itemList={itemList}
        earnedItems={earnedItems}
        showCount={showCount}
        players={socketParticipants}
        specialPlayer={specialPlayer}
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