import { useEffect, useState } from 'react';
import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axiosInstance from '../../apis/axiosInstance.js';
import { ROOM_API } from '../../apis/roomApi.js';
import { gameLobbyUrl } from '../../utils/urls';
import Layout from './components/Layout.js';
import useTopMsg from './components/TopMsg.js';
import userIsTrue from '../../utils/userIsTrue';
import guestStore from '../../store/guestStore';
import { requestCurrentTurn } from './Socket/mainSocket';
import { addIfNotExists } from '../../utils/arrayHelper.js';

import { connectSocket, getSocket, setReceiveWordHandler, submitWordChainWord, requestStartWordChainGame, requestEndWordChainGame, requestSkipTurn } from './Socket/mainSocket';
import useGameSocket from './hooks/useGameSocket';
import useWordSubmit from './hooks/useWordSubmit';

// 1. 고양이 제한시간 시간 게이지 최대값 (상수) 
const time_gauge = 40; 

function InGame() {
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

  // 소켓 및 참가자 초기화 로직 커스텀 훅으로 이동
  const { prepareGuestAndConnect } = useGameSocket({
    gameid,
    setSocketParticipants,
    setCurrentTurnGuestId,
    setQuizMsg,
    setGameStatus,
    setGameEnded,
    setShowEndPointModal,
    setFinalResults,
    setItemList,
    setMessage,
    setEarnedItems,
    setGameStarted,
    navigate,
    handleMoveToLobby,
  });
  useEffect(() => {
    if (gameid) {
      prepareGuestAndConnect();
    }
    // eslint-disable-next-line
  }, [gameid, navigate]);

  // 49. itemList 중 무작위 단어 하나를 선택하여 quizMsg로 설정 
  useEffect(() => {
    setRandomQuizWord();
  }, []);

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
        alert("가입된 유저가 아닙니다");
        // 52. 게스트가 아니면 홈으로 이동
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

  // 단어 제출 및 타이핑 완료 로직 커스텀 훅으로 이동
  const { handleSubmitWord, handleTypingDone } = useWordSubmit({
    gameStarted,
    inputValue,
    setInputValue,
    socketParticipants,
    currentTurnGuestId,
    itemList,
    setItemList,
    setEarnedItems,
    setUsedLog,
    setQuizMsg,
    setSpecialPlayer,
    setTypingText,
    setPendingItem,
    setInputTimeLeft,
    pendingItem,
    usedLog,
  });
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
    </>
  );
}

export default InGame;