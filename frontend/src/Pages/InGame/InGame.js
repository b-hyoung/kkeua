import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axiosInstance from '../../Api/axiosInstance';
import { ROOM_API } from '../../Api/roomApi';
import { gameLobbyUrl } from '../../Component/urls';
import Layout from './Section/Layout';
import Timer from './Section/Timer';
import useTopMsg from './Section/TopMsg';
import TopMsgAni from './Section/TopMsg_Ani';

import useGameRoomSocket from '../../hooks/useGameRoomSocket';
import userIsTrue from '../../Component/userIsTrue';
import guestStore from '../../store/guestStore';

import { connectSocket, getSocket } from './Socket/mainSocket';
import { sendWordChainMessage as originalSendWordChainMessage } from './Socket/mainSocket';
import { sendWordToServer } from './Socket/kdataSocket';



const time_gauge = 40;

function InGame() {
  const [itemList, setItemList] = useState([]);
  const [quizMsg, setQuizMsg] = useState('햄');
  const { gameid } = useParams();
  const navigate = useNavigate();

  const [sentMessages, setSentMessages] = useState([]);

  function sendWordChainMessageAndLog(word = '') {
    originalSendWordChainMessage(word);
    setSentMessages(prev => [...prev, { word, timestamp: new Date().toISOString() }]);
  }

  // 퀴즈 제시어 

  const {
    participants: socketParticipants,
    gameStatus,
    isReady,
    sendMessage,
    toggleReady,
    updateStatus,
    roomUpdated,
    setRoomUpdated,
    finalResults,
    setFinalResults
  } = useGameRoomSocket(gameid);

  const setRandomQuizWord = () => {
    if (itemList.length > 0) {
      const randomWord = itemList[Math.floor(Math.random() * itemList.length)].word;
      setQuizMsg(randomWord);
    }
  };

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
    if (timeLeft <= 0) return;
    const interval = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  const [usedLog, setUsedLog] = useState([]);
  const [specialPlayer, setSpecialPlayer] = useState('부러');

  const [inputValue, setInputValue] = useState('');
  const [message, setMessage] = useState('');
  const [showCount, setShowCount] = useState(3);

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

  useEffect(() => {
    async function prepareGuestAndConnect() {
      try {
        let guestUuid = document.cookie
          .split('; ')
          .find(row => row.startsWith('kkua_guest_uuid='))
          ?.split('=')[1];

        if (!guestUuid) {
          console.log("✅ 게스트 UUID 없음 -> 로그인 요청");
          const loginRes = await axiosInstance.post('/guests/login');
          guestUuid = loginRes.data.uuid;

          // 수동으로 쿠키 저장 (테스트용. 서버가 Set-Cookie 하면 생략)
          document.cookie = `kkua_guest_uuid=${guestUuid}; path=/`;
        }

        console.log("✅ 게스트 인증 성공, 방 입장 시도");

        console.log("✅ 방 입장 성공, 소켓 연결 시도");
        connectSocket(gameid);

      } catch (error) {
        console.error("❌ 준비 실패:", error);
        alert("방 입장 실패 또는 서버 연결 실패ㅁㅁㅁ");
      }
    }

    if (gameid) {
      prepareGuestAndConnect();
    }
  }, [gameid, navigate]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleSocketMessage = (event) => {
      const data = JSON.parse(event.data);
      if (!data.type) return;

      switch (data.type) {
        case 'connected':
          console.log('✅ 연결 완료 (서버 등록 완료):', data);
          break;
        case 'game_started':
          console.log('🎮 게임 시작됨');
          resetTimer();
          setRandomQuizWord();
          break;
        case 'word_accepted':
          console.log('✅ [word_accepted] 서버로부터 받은 데이터:', data);
          if (data.word) {
            const word = data.word;
            setQuizMsg(word.charAt(word.length - 1));
            setUsedLog(prev => (!prev.includes(word) ? [...prev, word] : prev));
            setItemList(prev => {
              if (!prev.find(item => item.word === word)) {
                return [...prev, { word: word, desc: `${word}가 등록되었습니다.` }];
              }
              return prev;
            });
            setSpecialPlayer(prev => {
              const currentIndex = socketParticipants.map(p => p.nickname).indexOf(prev);
              const nextIndex = (currentIndex + 1) % socketParticipants.length;
              return socketParticipants[nextIndex]?.nickname || prev;
            });
            setSentMessages(prev => [...prev, {
              result: '성공',
              word: data.word,
              timestamp: new Date().toISOString()
            }]);
          }
          break;
        case 'word_rejected':
          if (data.reason) {
            setMessage(`❌ 단어 거절: ${data.reason}`);
          } else {
            setMessage('❌ 단어가 거절되었습니다.');
          }
          if (data.word) {
            setSentMessages(prev => [...prev, {
              result: '실패',
              word: data.word,
              timestamp: new Date().toISOString()
            }]);
          }
          break;
        case 'game_over':
          break;
        default:
          console.warn('Unknown message type:', data.type);
      }
    };

    socket.addEventListener('message', handleSocketMessage);

    return () => {
      socket.removeEventListener('message', handleSocketMessage);
    };
  }, [gameid, navigate, socketParticipants]);

  // 나머지 게임 로직은 기존 그대로 ↓↓↓


  const handleTypingDone = () => {
    if (!pendingItem) return;

    sendWordChainMessageAndLog(pendingItem.word);

    setTypingText('');
    setPendingItem(null);
    setInputTimeLeft(12);
    setCatActive(true);
  };

  const sendCustomBroadcast = (content) => {
    const socket = getSocket();
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "custom_broadcast",
        content: content
      }));
    } else {
      console.error("WebSocket이 열려있지 않아 broadcast를 보낼 수 없습니다.");
    }
  };

  useEffect(() => {
    const updateCount = () => setShowCount(window.innerWidth >= 1024 ? 4 : 3);
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

  const crashKeyDown = (e) => {
    if (e.key === 'Enter') {
      crashMessage();
    }
  };

  const handleClickFinish = async () => {
    try{
      await axiosInstance.post(ROOM_API.END_ROOMS(gameid))
      navigate(gameLobbyUrl(gameid))
    }catch(error){
      console.log(error)
      alert("종료된 게임이 아닙니다.");
    }
  };

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
      />
      <div className="w-full max-w-md mx-auto mt-4 p-2 bg-gray-100 rounded-lg shadow">
        <h2 className="text-center font-bold mb-2">📤 전송한 메시지</h2>
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {sentMessages.map((msg, index) => (
            <div key={index} className="p-2 bg-white rounded shadow text-sm">
              <div className={msg.result === '성공' ? 'text-green-500 font-bold' : 'text-red-500 font-bold'}>
                📝 {msg.result} - {msg.word || 'N/A'}
              </div>
              <div className="text-xs text-gray-400">{new Date(msg.timestamp).toLocaleTimeString()}</div>
            </div>
          ))}
        </div>
      </div>
      {socketParticipants.length > 0 && (
        <div className="fixed bottom-4 left-4 z-50">
          {guestStore.getState().guest_id === socketParticipants.find(p => p.is_owner)?.guest_id ? (
            <>
              <button
                onClick={handleClickFinish}
                className="bg-red-500 text-white px-4 py-2 rounded-lg shadow hover:bg-red-600 transition"
              >
                게임 종료
              </button>
              <button
                onClick={() => sendCustomBroadcast("🔥 긴급 브로드캐스트 테스트")}
                className="bg-purple-500 text-white px-4 py-2 rounded-lg shadow hover:bg-purple-600 transition mt-2"
              >
                브로드캐스트 테스트
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate(gameLobbyUrl(gameid))}
                className="bg-gray-500 text-white px-4 py-2 rounded-lg shadow hover:bg-gray-600 transition"
              >
                로비 이동
              </button>
              <button
                onClick={() => sendCustomBroadcast("🔥 긴급 브로드캐스트 테스트")}
                className="bg-purple-500 text-white px-4 py-2 rounded-lg shadow hover:bg-purple-600 transition mt-2"
              >
                브로드캐스트 테스트
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default InGame;
