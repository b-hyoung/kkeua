import guestStore from '../../../store/guestStore';
import './Layout.css';
import { useEffect, useState } from 'react';
import TopMsgAni from './TopMsg_Ani';
import Timer from './Timer';
import msgData from './MsgData';
import { workingCatImg } from '../../../Component/imgUrl';
import EndPointModal from './EndPointModal';

function Layout({
  quizMsg, 
  typingText,
  handleTypingDone,
  message,
  itemList,
  showCount,
  players,
  specialPlayer,
  setSpecialPlayer,
  inputValue,
  setInputValue,
  crashKeyDown,
  crashMessage,
  timeLeft, // Added timeLeft prop
  inputTimeLeft, // Added inputTimeLeft prop
  setInputTimeLeft,
  setRandomQuizWord,
  setPendingItem, // Added setter here
  catActive, // Added catActive prop
  frozenTime, // add this line
  socketParticipants, // Added socketParticipants prop
  finalResults, // Added finalResults prop
  usedLog, // Added usedLog prop
  reactionTimes, // Added reactionTimes prop
  handleClickFinish // <-- Add this line
}) {
  useEffect(() => {
    window.setInputTimeLeftFromSocket = (time) => {
      setInputTimeLeft(time);
    };

    return () => {
      delete window.setInputTimeLeftFromSocket;
    };
  }, []);

  const [showEndPointModal, setShowEndPointModal] = useState(false);
  const [catRun, setCatRun] = useState(false);

  const randomWords = ['햄 스 터', '고 양 이', '강 아 지', '너 구 리', '사 자 상'];
  const [randomWord, setRandomWord] = useState('');

  useEffect(() => {
    const pickRandomWord = () => {
      const word = randomWords[Math.floor(Math.random() * randomWords.length)];
      setRandomWord(word);
    };
    pickRandomWord();
  }, []);

  return (
    
    <div className="w-screen flex justify-center bg-white lg:pb-[100px] px-4">
      <div className="min-h-screen py-4 flex flex-col md:flex-row md:space-x-8 md:justify-center md:items-start w-full max-w-[1920px]">


        {/* 중앙 타이핑 영역 */}
      <div className="w-full flex flex-col items-center space-y-4 px-[5%]">
        
        {/* 남은 시간 */}
        <h1 className="text-3xl font-extrabold mt-4 mb-2">{frozenTime ?? timeLeft}초</h1>
        <div className="text-xl font-bold text-orange-400 mb-2">{randomWord}</div>

        <div className="w-full max-w-sm p-4 border-4 border-orange-400 rounded-full text-center font-bold shadow-lg bg-white text-xl leading-tight h-16 flex flex-col justify-center">
          {/* 항상 보이는 제시어 */}
          <div className="text-orange-500 text-lg">
            {quizMsg.length > 1 && !msgData.find(item => item.word === quizMsg)
              ? quizMsg
              : quizMsg.charAt(quizMsg.length - 1)}
          </div>

          {/* 애니메이션 메시지 */}
          {typingText && <TopMsgAni text={typingText} onDone={handleTypingDone} />}

          {/* 피드백 메시지 (중복 등) */}
          {message && !typingText && (
            <div className="text-red-500 text-sm font-normal">
              {message}
            </div>
          )}
        </div>

          <div className="w-full md:w-[750px] px-2 md:px-4 space-y-4 tracking-wide">
            <div className="bg-gray-100 p-6 rounded-xl space-y-4 pb-10 mb-2 min-h-[480px]">
              {itemList.slice(-showCount).map((item, index) => (
                <div key={index} className="p-4 rounded-2xl border shadow-lg bg-white border-gray-300 drop-shadow-md">
                  <div className="flex items-center space-x-4 ml-2">
                    <div className={`w-8 h-8 ${index === 0 ? 'bg-blue-400' : index === 1 ? 'bg-green-400' : 'bg-purple-400'} rounded-full`}></div>
                    <span className="font-semibold text-lg text-black">
                      {item.word.slice(0, -1)}<span className="text-red-500">{item.word.charAt(item.word.length - 1)}</span>
                    </span>
                  </div>
                  <div className="text-gray-500 text-sm ml-2 mt-2 break-words max-w-md text-left">
                    {item.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 오른쪽 유저들 */}
        <div className="flex justify-center md:justify-end mt-[100px] pr-4">
          <div className="grid grid-cols-2 md:grid-cols-1 gap-6 place-items-center max-w-fit">
            {players.map((player, index) => {
              const currentGuest = guestStore.getState();
              const isMyself = currentGuest.nickname === player;
              return (
                <div key={index} className="flex flex-col items-center space-y-2">
                  <div className={`flex flex-col items-center w-[220px] px-2 py-2 rounded-lg border-[3px] font-bold text-base space-y-2 ${
                    player === specialPlayer
                      ? 'bg-orange-100 border-orange-400 text-orange-500'
                      : 'bg-gray-100 border-gray-300 text-black'
                  }`}>
                    <div className="flex flex-col items-center space-y-2">
                      <div className="relative w-[50px] h-[50px]">
                        <div className="w-full h-full bg-gray-300 rounded-full"></div> {/* Circle image placeholder */}
                        {isMyself && (
                          <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-xs flex items-center justify-center rounded-full border-2 border-white shadow-md">
                            나
                          </div>
                        )}
                      </div>
                      <div className="text-center">
                        {player}
                      </div>
                    </div>
                    <div className="flex gap-2 justify-center">
                      {[0, 1, 2, 3].map((slot) => (
                        <div
                          key={slot}
                          className="w-6 h-6 rounded-[6px] border-2 border-orange-300 shadow-md"
                        ></div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ height: "70" }}></div>
        <br /><br /><br />

        {/* 테스트용 결과 보기 버튼 */}
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={() => {
              setShowEndPointModal(false);
              setTimeout(() => setShowEndPointModal(true), 100); // 항상 새로 띄우게 강제 리셋
            }}
            className="px-4 py-2 bg-orange-400 text-white font-bold rounded-lg shadow-md"
          >
            결과 보기
          </button>
          <button
            onClick={() => setCatRun(true)}
            className="mt-2 px-4 py-2 bg-blue-400 text-white font-bold rounded-lg shadow-md"
          >
            고양이 달리기
          </button>
        </div>

        {showEndPointModal && (
          <div className="absolute top-0 left-0 w-full flex justify-center items-center z-50">
            <EndPointModal
              players={(socketParticipants.length > 0 ? socketParticipants.map(p => p.nickname) : players)}
              onClose={() => setShowEndPointModal(false)}
              usedLog={usedLog}
              reactionTimes={reactionTimes}
            />
          </div>
        )}

        {/* 하단 입력창 */}
        <div className="w-full fixed bottom-0 bg-white z-50 border-t border-gray">
          {/* 게이지 bar */}
          <div className={`relative h-1.5 w-full bg-gray-200`}>
            <div
              className={`absolute top-0 left-0 h-full ${inputTimeLeft <= 3 ? 'bg-red-400' : 'bg-orange-400'} rounded-r-full ${inputTimeLeft === 120 ? '' : 'transition-all duration-1000'}`}
              style={{
                width: `${(inputTimeLeft / 120) * 100}%`,
                transition: inputTimeLeft === 120 ? 'none' : 'width 1s linear',
              }}
            ></div>
            <img
              src={workingCatImg}
              alt="고양이22"
              className={`absolute top-1/2 w-6 h-6 z-10 ${inputTimeLeft === 120 ? '' : 'transition-[left] ease-linear duration-1000'}`}
              style={{
                left: `${inputTimeLeft === 120 ? '100%' : (inputTimeLeft / 120) * 100 + '%'}`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>

          {/* 입력창 */}
          <div className="w-full px-[5%] flex items-center space-x-2 py-4">
            <span className="font-bold">⇈</span>
            <input
              type="text"
              className="flex-1 p-2 h-12 border rounded-lg focus:outline-none text-lg"
              placeholder="즐거운 끄아와"
              value={inputValue}
              onChange={(e) => {
                if (!typingText) {
                  setInputValue(e.target.value);
                }
              }}
              onKeyDown={crashKeyDown}
            />
            <span className="font-bold" onClick={crashMessage}>전송</span>
          </div>
        </div>
      </div>
      {catRun && (
        <div className="fixed top-0 left-0 w-screen h-screen z-[1000] bg-transparent overflow-hidden">
          <img
            src={workingCatImg}
            alt="달리는 고양이"
            className="absolute top-0 left-0 w-full h-full animate-runCat object-contain"
            style={{ zIndex: 9999 }}
            onAnimationEnd={() => setCatRun(false)}
          />
        </div>
      )}

    
    </div>
  );
}

export default Layout;
