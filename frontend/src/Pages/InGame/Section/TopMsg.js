import msgData from './MsgData';

export default function useTopMsg({
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
}) {
  const crashMessage = () => {
    const trim = inputValue.trim();
    if (!trim) return;

    // 중복 검사
    if (usedLog.includes(trim)) {
      setMessage(`이미 입력된 단어입니다: ${trim}`);
      setTimeout(() => setMessage(''), 2000);
      setInputValue('');
      return;
    }

    // msgData 내 존재하는 단어인지 확인
    const found = msgData.find(item => item.word === trim);
    if (!found) {
      setMessage(`잘못된 단어입니다: ${trim}`);
      setTimeout(() => setMessage(''), 2000);
      setInputValue('');
      return;
    }

    // 끝말잇기 규칙 검사
    const prevLastChar = quizMsg.charAt(quizMsg.length - 1);
    const inputFirstChar = trim[0];
    if (prevLastChar !== inputFirstChar) {
      setMessage(`시작 글자가 잘못 되었습니다! 제시어는 '${quizMsg}'`);
      setTimeout(() => setMessage(''), 2000);
      setInputValue('');
      return;
    }

    // 정답 처리
    setPendingItem({ word: trim, desc: found.desc });
    setTypingText(trim);
    setMessage('');
    setInputValue('');

    // 업데이트: 제시어를 입력 단어의 마지막 문자로 설정
    const nextQuizChar = trim.charAt(trim.length - 1);
    if (quizMsg !== nextQuizChar) {
      setQuizMsg(nextQuizChar);
    }
  };

  return { crashMessage };
}
