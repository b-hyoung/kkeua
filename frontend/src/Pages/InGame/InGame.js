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

import { connectSocket, getSocket, setReceiveWordHandler } from './Socket/mainSocket';

import { sendWordToServer } from './Socket/kdataSocket';

const time_gauge = 40;

function InGame() {
  const [itemList, setItemList] = useState([]);
  const [quizMsg, setQuizMsg] = useState('햄');
  const { gameid } = useParams();
  const navigate = useNavigate();

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
    // 단어 수신 핸들러 등록
    setReceiveWordHandler((data) => {
      console.log("💬 서버에서 단어 수신:", data);
      if (data && data.word) {
        setTypingText(data.word);  // 이건 예시야. 너 흐름에 맞게 사용해야 해.
        setPendingItem({ word: data.word });
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

  const [usedWords, setUsedWords] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [lastCharacter, setLastCharacter] = useState('');
  
  useEffect(() => {
    async function prepareGuestAndConnect() {
      try {
        let guestUuid = document.cookie
          .split('; ')
          .find(row => row.startsWith('kkua_guest_uuid='))
          ?.split('=')[1];
  
        if (!guestUuid) {
          const loginRes = await axiosInstance.post('/guests/login');
          guestUuid = loginRes.data.uuid;
          document.cookie = `kkua_guest_uuid=${guestUuid}; path=/`;
        }
  
        connectSocket(gameid);
  
        const socket = getSocket();
        if (socket) {
          socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log('📨 수신 데이터:', data);
  
            if (data.type === "word_chain_state") {
              console.log('✅ word_chain_state 수신:', data);
              setUsedWords(data.words_used || []);
              setCurrentPlayer(data.current_player || null);
              setLastCharacter(data.last_character || '');
            }
  
            if (data.type === "word_chain_word_submitted") {
              console.log('✅ word_chain_word_submitted 수신:', data);
              setUsedWords(prev => [...prev, data.word]);
              setCurrentPlayer(data.next_player);
              setLastCharacter(data.last_character);
            }
          };
        }
  
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
