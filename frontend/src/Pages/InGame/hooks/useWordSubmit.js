import guestStore from '../../../store/guestStore';
import { submitWordChainWord } from '../Socket/mainSocket';
import { addIfNotExists } from '../../../utils/arrayHelper.js';

/**
 * useWordSubmit
 * @param {Object} params
 * @param {boolean} params.gameStarted
 * @param {string} params.inputValue
 * @param {function} params.setInputValue
 * @param {Array} params.socketParticipants
 * @param {string|number|null} params.currentTurnGuestId
 * @param {Array} params.itemList
 * @param {function} params.setItemList
 * @param {function} params.setEarnedItems
 * @param {function} params.setUsedLog
 * @param {function} params.setQuizMsg
 * @param {function} params.setSpecialPlayer
 * @param {function} params.setTypingText
 * @param {function} params.setPendingItem
 * @param {function} params.setInputTimeLeft
 * @param {any} params.pendingItem
 * @param {Array} params.usedLog
 * @returns {Object}
 */
function useWordSubmit({
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
}) {
  // F2. 정답 처리 후 상태 업데이트: 사용 단어 목록 갱신, 다음 제시어 설정, 다음 유저로 스페셜유저 변경
  //      + 서버에 현재 유저의 단어 전송, 타이머/입력값 초기화
  const handleTypingDone = () => {
    if (!pendingItem) return;

    // 유효단어 현재로그에 있는지 확인 후 추가
    setUsedLog(prev => addIfNotExists(prev, pendingItem, 'word'));
    setItemList(prev => addIfNotExists(prev, pendingItem, 'word'));
    setQuizMsg(pendingItem.word.charAt(pendingItem.word.length - 1));
    setSpecialPlayer(prev => {
      const currentIndex = socketParticipants.map(p => p.nickname).indexOf(prev);
      return socketParticipants.map(p => p.nickname)[(currentIndex + 1) % socketParticipants.length];
    });
    submitWordChainWord(
      pendingItem.word,
      guestStore.getState().guest_id,
      currentTurnGuestId
    );
    setTypingText('');
    setPendingItem(null);
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
          setEarnedItems(prev => {
            const updatedList = [newItem, ...prev];
            return updatedList.slice(0, 4); // 최대 4개까지만 유지
          });
        }
      }
      // ------------------------------
      setInputValue('');
    }
  };

  return { handleSubmitWord, handleTypingDone };
}

export default useWordSubmit;
