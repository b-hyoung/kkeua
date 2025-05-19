import { useEffect, useRef } from 'react';
import axiosInstance from '../../../apis/axiosInstance.js';
import { ROOM_API } from '../../../apis/roomApi.js';
import guestStore from '../../../store/guestStore';
import { connectSocket, getSocket, setReceiveWordHandler, requestCurrentTurn } from '../Socket/mainSocket';

/**
 * useGameSocket
 * @param {Object} params
 * @param {string} params.gameid
 * @param {function} params.setSocketParticipants
 * @param {function} params.setCurrentTurnGuestId
 * @param {function} params.setQuizMsg
 * @param {function} params.setGameStatus
 * @param {function} params.setGameEnded
 * @param {function} params.setShowEndPointModal
 * @param {function} params.setFinalResults
 * @param {function} params.setItemList
 * @param {function} params.setMessage
 * @param {function} params.setEarnedItems
 * @param {function} params.setGameStarted
 * @param {function} params.navigate
 * @param {function} params.handleMoveToLobby
 * @returns {Object}
 */
function useGameSocket({
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
  handleMoveToLobby
}) {
  // 4. useRef(false) 소켓 중복연결 방지. 소켓이 이미 연결됐는지 체크  
  const hasConnectedRef = useRef(false);
  // 12. socketParticipants + useEffect 소켓콜백 등에서 참조할 수 있도록 ref에 저장 
  const socketParticipantsRef = useRef(setSocketParticipants);
  useEffect(() => {
    socketParticipantsRef.current = setSocketParticipants;
  }, [setSocketParticipants]);

  // 2. 방장 식별 헬퍼
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
          // 참가자 정보 받아옴
          setSocketParticipants(res.data);
          socketParticipantsRef.current(res.data);
          // 23. 방장 정보 추출 및 currentTurnGuestId 업데이트
          const ownerInfo = getOwnerInfo(res.data);
          if (ownerInfo) {
            setCurrentTurnGuestId(ownerInfo.guest_id);
          }
        }
      } catch (error) {
        // 참가자 API 호출 실패
      }

      // 24. 서버에서 보내는 소켓 메시지를 수신해서 처리하는 핸들러
      setReceiveWordHandler((data) => {
        switch (data.type) {
          case "user_joined":
            break;
          // 25. 참가자 목록이 생긴되었을 때 
          case "participants_update":
            if (Array.isArray(data.participants)) {
              setSocketParticipants(data.participants);
              socketParticipantsRef.current(data.participants);
              // 27. 방장정보 다시 찾고 턴정보 갱신. currentTurnGuestId 업데이트
              const updatedOwnerInfo = getOwnerInfo(data.participants);
              if (updatedOwnerInfo) {
                setCurrentTurnGuestId(updatedOwnerInfo.guest_id);
              }
            }
            break;
          case "connected":
            break;
          // 30. 끝말잇기 게임이 시작되었을 때 
          case "word_chain_started":
            if (data.first_word) {
              // 31. 첫 제시어 뜨도록 세팅  
              setQuizMsg(data.first_word);
            }
            // 32. 현재 턴 플레이어 설정  
            updateCurrentTurn(data.current_player_id);
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
              if (handleMoveToLobby) handleMoveToLobby();
            }, 5000);
            break;
          case "user_left":
            break;
          case "error":
            break;
          default:
            break;
        }
      });
      // 44. 소켓 안정화를 위해 1초 대기
      await new Promise(resolve => setTimeout(resolve, 1000));
      // ✅ 안전 전송 준비: 소켓 readyState 감시
      const waitForSocketConnection = (callback) => {
        const socket = getSocket();
        // 45. 소켓이 연결 완료 상태(OPEN)일 경우 → 콜백 실행
        if (!socket) return;
        if (socket.readyState === WebSocket.OPEN) {
          callback();
        } else {
          // 46. 아직 연결 안 됐으면 0.1초 후 재시도
          setTimeout(() => waitForSocketConnection(callback), 100); // 0.1초 간격 재시도
        }
      };
      // 47. 소켓 연결 후 3초 대기 (딜레이를 3초 주는 코드)
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
      // ❌ 방 입장 또는 소켓 연결 실패
      if (navigate) navigate("/");
    }
  }

  return { prepareGuestAndConnect };
}

export default useGameSocket;
