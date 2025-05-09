import React, { useEffect, useState } from 'react';

function EndPointModal({ players, onClose, usedLog, reactionTimes }) {
  const [ranks, setRanks] = useState([]);

  useEffect(() => {
    if (players.length > 0 && ranks.length === 0) {
      const sortedPlayers = [...players].map((player) => {
        const nickname = typeof player === 'string' ? player : player.nickname; // ✅ 문자열/객체 구분
        return {
          nickname,
          score: Math.floor(Math.random() * 100), // 임시 점수
        };
      })
        .sort((a, b) => b.score - a.score)
        .map((player, index) => ({
          ...player,
          rank: index + 1,
        }));
      setRanks(sortedPlayers);
    }
  }, [players, ranks.length]);

  return (
    <>
      <style>{`
        @keyframes spinZoom {
          0% { transform: scale(0) rotate(-360deg); opacity: 0; }
          50% { transform: scale(1.2) rotate(-10deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        .animate-spinZoom {
          animation: spinZoom 1s ease-in-out forwards;
        }
      `}</style>
      <div className="absolute top-0 left-0 right-0 mx-auto bg-gradient-to-b from-orange-50 to-white rounded-2xl p-10 w-[92%] max-w-md shadow-2xl animate-spinZoom h-[650px] border-4 border-orange-200 z-50 mt-20">
        <h2 className="text-2xl font-bold mb-6 text-center text-orange-500">🎉 최종 결과 🎉</h2>
        <div className="space-y-4">
          {ranks.map((player, index) => (
            <div
              key={index}
              className={`flex items-center justify-between p-4 rounded-2xl shadow-lg transition transform hover:scale-105 animate-slideUp ${
                index === 0
                  ? 'bg-yellow-300'
                  : index === 1
                  ? 'bg-gray-200'
                  : index === 2
                  ? 'bg-amber-400'
                  : 'bg-gray-400'
              }`}
            >
              <span className="font-bold text-lg flex items-center">
                {player.rank}위
                {player.rank === 1 && ' 🏆'}
                {player.rank === 2 && ' 🥈'}
                {player.rank === 3 && ' 🥉'}
                {player.rank === 4 && ' 🐣'}
              </span>
              <span className="text-md">{player.nickname}</span>
              <span className="font-semibold">{player.score}점</span>
            </div>
          ))}
        </div>
        {/* 내 기록 section */}
        <div className="mt-10 mb-6">
          <h3 className="text-xl font-bold text-gray-700 mb-2">내 기록</h3>
          <ul className="space-y-1 text-gray-600 font-medium">
            <li>고양이 이동 거리: {usedLog.length * 5}m</li>
            <li>총 입력한 단어 수: {usedLog.length}개</li>
            <li>평균 반응 속도: {reactionTimes.length > 0 ? (reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length).toFixed(1) : 0}초</li>
          </ul>
        </div>
        <div className="flex justify-center mt-6">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-orange-400 text-white font-bold rounded-full shadow-md"
          >
            닫기
          </button>
        </div>
      </div>
    </>
  );
}

export default EndPointModal;
