import { useEffect, useState } from 'react';
import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axiosInstance from '../../Api/axiosInstance';
import { ROOM_API } from '../../Api/roomApi';
import { gameLobbyUrl } from '../../utils/urls';
import Layout from './Section/Layout';
import Timer from './Section/Timer';
import useTopMsg from './Section/TopMsg';
import TopMsgAni from './Section/TopMsg_Ani';
import EndPointModal from './Section/EndPointModal';
import userIsTrue from '../../utils/userIsTrue';
import guestStore from '../../store/guestStore';
import { requestCurrentTurn } from './Socket/mainSocket';
import { addIfNotExists } from '../../utils/arrayHelper.js';

import { connectSocket, getSocket, setReceiveWordHandler, submitWordChainWord, requestStartWordChainGame, requestEndWordChainGame, requestSkipTurn } from './Socket/mainSocket';
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
  
// =======================================
// [A] 타이머   [B] 유저 입력 
// =======================================

//            === [A] 타이머  ===
  // A1. 게임종료시 남은 전체시간
  const [frozenTime, setFrozenTime] = useState(null);
  // A2. 유저 입력 타이머
  const [inputTimeLeft, setInputTimeLeft] = useState(12);
  // A3. 전체 게임 종료시간
  const [timeLeft, setTimeLeft] = useState(120);
  
//            === [B] 유저 입력 ===
  // B1. 유저 개인입력히스토리(점수판 계산용)
  const [usedLog, setUsedLog] = useState([]);
  // B2. 현재 입력해야할 유저 정보
  const [specialPlayer, setSpecialPlayer] = useState();
  // B3. 유저 입력 인풋관리
  const [inputValue, setInputValue] = useState('');
  // B4. 상단 메뉴바 메세지 관리
  const [message, setMessage] = useState('');
  // B5. 전체유저 입력히스토리
  const [showCount, setShowCount] = useState(5);
  // B6. 유저 입력 시 텍스트 애니메이션화로 띄워주기위한 변수
  const [typingText, setTypingText] = useState('');
  // B7. 유저 현재입력값 저장해서 마지막 단어 추출용
  const [pendingItem, setPendingItem] = useState(null);
  // B8. 점수판기재용 유저 입력시간 저장
  const [reactionTimes, setReactionTimes] = useState([]);
  // B9. 입력된 단어에 대한 유효성 검사 및 상태 업데이트 로직 제공 (끝말잇기 규칙 포함)
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

  // F1. 타이머 리셋함수
  const resetTimer = () => setTimeLeft(120);

 // F2. 정답 처리 후 상태 업데이트: 사용 단어 목록 갱신, 다음 제시어 설정, 다음 유저로 스페셜유저 변경
  //      + 서버에 현재 유저의 단어 전송, 타이머/입력값 초기화
  const handleTypingDone = () => {
    if (!pendingItem) return;

    // 유효단어 현재로그에 있는지 확인 후 추가
    setUsedLog(prev => addIfNotExists(prev, pendingItem, 'word'));
    // 
    setItemList(prev => addIfNotExists(prev, pendingItem, 'word'));
    // 탑메세지에 마지막 글자 전달
    setQuizMsg(pendingItem.word.charAt(pendingItem.word.length - 1));

    // 스페셜유저 다음턴으로 넘기기
    setSpecialPlayer(prev => {
      const currentIndex = socketParticipants.map(p => p.nickname).indexOf(prev);
      return socketParticipants.map(p => p.nickname)[(currentIndex + 1) % socketParticipants.length];
    });
    // 현재유저 , 마지막 단어 , 아이템사용 여부 전달
    submitWordChainWord(
      pendingItem.word,
      guestStore.getState().guest_id,
      currentTurnGuestId
    );

    //유후 타이핑 텍스트 초기화
    setTypingText('');
    //마지막입력값 지우기
    setPendingItem(null);
    //타이머시간 다시 12초로 리셋
    setInputTimeLeft(12);
  };
  
  //F3. 유저 입력 후 소켓전송
  const handleSubmitWord = () => {
    //게임 미시작시 알림
    if (!gameStarted) {
      alert('⛔ 게임이 아직 시작되지 않았습니다.');
      return;
    }
    //현재 유저의 id와 입력해야할 차례의 유저 id입력
    console.log("🚥 내 guest_id:", guestStore.getState().guest_id);
    console.log("🚥 현재 currentTurnGuestId:", currentTurnGuestId);
    //참가자 인원확인
    if (socketParticipants.length === 0) {
      alert('⛔ 참가자 정보가 아직 없습니다.');
      return;
    }
    //현재 턴 유저 확인
    if (currentTurnGuestId === null) {
      alert('⛔ 아직 게임 시작 전이거나 턴 정보가 없습니다.');
      return;
    }
    // 차례가 아닌 유저가 입력 시 예외처리
    if (guestStore.getState().guest_id !== currentTurnGuestId) {
      alert('⛔ 현재 당신 차례가 아닙니다.');
      return;
    }
    //유저 입력시 빈값이 아닐 경우
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
  //F4. 엔터 입력 시  F3번 실행( 소켓에 유저입력값 전송 )
  const crashKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSubmitWord();
    }
  };

  // F5 결과 종료
  /** 현재는 클릭으로 인한 종료이지만
   * 추후 3라운드 진행 후 마지막라운드 종료 시 실행
   */
  const handleClickFinish = async () => {
    try {
      //게임종료 API 서버에 전달
      await axiosInstance.post(ROOM_API.END_ROOMS(gameid));
      //성공 시 소켓에 전송
      requestEndWordChainGame();
      //모달 1초뒤 생성
      setTimeout(() => setShowEndPointModal(true), 100); // 결과 모달 강제 띄우기
      // 이후 5초뒤 로비로 이동하기
      setTimeout(() => {
        handleMoveToLobby();
      }, 5000);
    } catch (error) {
      console.log(error)
      alert("종료된 게임이 아닙니다.");
    }
  };

  // F6 소켓 종료 후 로비이동
  const handleMoveToLobby = () => {
    navigate(gameLobbyUrl(gameid));
  };


  // E1. 최대시간에서 1초씩 감소
  useEffect(() => {
    // 게임이 종료되었거나 시간이 모두 소진되었으면 타이머 중단
    if (gameEnded || timeLeft <= 0) return;
    // 1초마다 timeLeft를 1씩 감소
    const interval = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    // 클린업: 타이머 제거
    // setInterval을 사용할떈 항상 clearInterval를 사용해야 메모리 누수를 막을수있다. 
    return () => clearInterval(interval);
    // 유저입력시간 또는 게임 종료여부에 따른 함수 재실행 여부
  }, [timeLeft, gameEnded]);

  // E2. 화면에 따른 히스토리 개수 보여주기
  useEffect(() => {
    // 모바일은 3개, PC는 4개 보여주게 함
    const updateCount = () => {
      setShowCount(window.innerWidth >= 400 ? 4 : 3);
    };
    // 처음 렌더링될 때 한 번 실행
    updateCount();
    // 브라우저 크기 바뀔 때마다 다시 실행
    window.addEventListener('resize', updateCount);
    return () => window.removeEventListener('resize', updateCount); // 클린업
  }, []);

  // E3. 유저입력 타이머
  useEffect(() => {
    //초당 1초씩 줄어들기 
    const timer = setInterval(() => setInputTimeLeft(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);
  

  // E4. 입력 타이머가 0초일 때 아무 입력 없이 지나가면 게임 종료 처리
  useEffect(() => {
    //시간이 남아있지않거나 유저가 입력 후 애니메이션 중이라면 리턴
    if (inputTimeLeft !== 0 || typingText !== '') return;

    // 게임 종료 처리
    setMessage('게임종료!');
    setFrozenTime(timeLeft);
    setRandomQuizWord();  // 다음 제시어 미리 준비
    resetTimer();
  }, [inputTimeLeft]);

  // E5. 게임시작
  useEffect(() => {
    const timer = setTimeout(() => {
      //소켓에서 방장값 가져오기
      const isOwner = socketParticipants.find(p => p.is_owner || p.is_creator)?.guest_id === guestStore.getState().guest_id;
      //방장이면서 gameStatus가 준비중이면 5초뒤 게임 자동시작
      if (isOwner && gameStatus === 'waiting') {
        console.log("⏱️ [자동 시작] 5초 경과, 방장이므로 게임 시작 요청 보냄");
        //소켓으로 게임시작 전송
        requestStartWordChainGame("끝말잇기");
      }
    }, 5000);
    return () => clearTimeout(timer);
    //소켓값이 바뀌었을때 , 게임현재 상태가 변경되면 게임시작
  }, [socketParticipants, gameStatus]);

  //E6. 소켓종료
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
        message={message}
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
        inputTimeLeft={inputTimeLeft}
        setInputTimeLeft={setInputTimeLeft}
        showEndPointModal={showEndPointModal}
        setShowEndPointModal={setShowEndPointModal}
        socketParticipants={socketParticipants}
        usedLog={usedLog}
        reactionTimes={reactionTimes}
        handleClickFinish={handleClickFinish}
        frozenTime={frozenTime}
        currentTurnGuestId={currentTurnGuestId}
        myGuestId={guestStore.getState().guest_id}
        gameEnded={gameEnded}
      />
      {socketParticipants.length > 0 && guestStore.getState().guest_id === socketParticipants.find(p => p.is_owner || p.is_creator)?.guest_id && (
        <div className="fixed top-10 left-4 z-50 flex space-x-2">
          <button
            onClick={() => requestStartWordChainGame("끝말잇기")}
            className="bg-green-500 text-white px-4 py-2 rounded-lg shadow hover:bg-green-600 transition"
          >
            게임 시작
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
      {/* EndPointModal is rendered in Layout.js, do not render here to avoid overlap */}
    </>
  );
}

export default InGame;