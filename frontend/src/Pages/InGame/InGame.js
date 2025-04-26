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

import { connectSocket } from './Socket/mainSocket';
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
      {socketParticipants.length > 0 && (
        <div className="fixed bottom-4 left-4 z-50">
          {guestStore.getState().guest_id === socketParticipants.find(p => p.is_owner)?.guest_id ? (
            <button
              onClick={handleClickFinish}
              className="bg-red-500 text-white px-4 py-2 rounded-lg shadow hover:bg-red-600 transition"
            >
              게임 종료
            </button>
          ) : (
            <button
              onClick={() => navigate(gameLobbyUrl(gameid))}
              className="bg-gray-500 text-white px-4 py-2 rounded-lg shadow hover:bg-gray-600 transition"
            >
              로비 이동
            </button>
          )}
        </div>
      )}
    </>
  );
}

export default InGame;
