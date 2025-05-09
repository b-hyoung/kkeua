import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './Lobby.css';
import { gameLobbyUrl, /* gameUrl, */ lobbyUrl } from '../../utils/urls';
import AddRoomModal from './Section/AddRoomModal';
import axiosInstance from '../../apis/axiosInstance';
import { ROOM_API } from '../../apis/roomApi';
import guestStore from '../../store/guestStore'
import userIsTrue from '../../utils/userIsTrue';
import { USER_API } from '../../apis/userApi';
import Cookies from 'js-cookie';
import { addCatImg, refreshImg } from '../../utils/imgUrl';

function Lobby() {
  const navigate = useNavigate();

  const [activeIndex, setActiveIndex] = useState(0);
  const intervalRef = useRef(null); // 인터벌 참조 생성
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [roomsData, setRoomsData] = useState([
    {
      title: "",
      room_type: "",
      participant_count: "",
      max_people: "",
      playing: "",
    }
  ])
  const [isLoading, setIsLoading] = useState(false);
  const [isEntering, setIsEntering] = useState(false);

  const { uuid, nickname,guest_id } = guestStore.getState();
  const [RoomFilter, setRoomFilter] = useState(false);

  const guestProfileImg = nickname === '특정닉네임' 
  ? '/imgs/gameBanner.png' 
  : '/imgs/blogBanner.png';

  // 페이지 로드 시 게스트 정보 확인
  useEffect(() => {
    const checkGuestInfo = async () => {
      // 쿠키에서 UUID 가져오기
      const guestUuid = Cookies.get('kkua_guest_uuid');

      // 쿠키에 UUID가 있으면 로그인 시도
      if (guestUuid) {
        try {
          // 로그인 요청 
          const response = await axiosInstance.post(USER_API.GET_GUEST, {
            guest_uuid: guestUuid,
            nickname: null,
            device_info: navigator.userAgent
          });

          const data = response.data;
        } catch (error) {
          console.error("게스트 로그인 실패:", error);
          // 로그인 페이지로 리디렉션
          alert("로그인에 실패했습니다. 메인 페이지로 이동합니다.");
          navigate('/');
        }
      } else {
        // UUID가 없으면 로그인 페이지로
        alert("로그인이 필요합니다. 메인 페이지로 이동합니다.");
        navigate('/');
      }
    };
    checkGuestInfo();
  }, [navigate]);

  // api 를 통해 방정보 받아오기
  {/* 방 제목 / 게임 타입 / 진행중인 인원 */ }
  useEffect(() => {
    fetchRoom();
  }, [])

  const fetchRoom = async () => {
    try {
      setIsLoading(true);
      const res = await axiosInstance.get(ROOM_API.get_ROOMS);

      // API 응답 구조 확인 - rooms 배열에 접근
      if (res.data && Array.isArray(res.data.rooms)) {
        setRoomsData(res.data.rooms.filter(room => room.status !== "finished"));
      } else {
        console.error("API 응답 형식이 예상과 다릅니다:", res.data);
        setRoomsData([]);
      }
      console.log(res.data)
    } catch (error) {
      console.log("방 요청 실패 " + error);
      setRoomsData([]);
    } finally {
      setIsLoading(false);
    }
  }

  const handleRandomEnter = async () => {
    try {
      setIsLoading(true);
      await fetchRoom(); // 최신 데이터 요청

      const availableRooms = roomsData.filter(
        (room) => room.status === "waiting" && room.participant_count < room.max_players
      );
      console.log("data ", roomsData)

      if (availableRooms.length === 0) {
        alert("입장 가능한 방이 없습니다.");
        return;
      }

      const randomRoom = availableRooms[Math.floor(Math.random() * availableRooms.length)];
      setIsEntering(true);
      setTimeout(() => {
        handleClickEnterGame(randomRoom.room_id);
      }, 700);
    } catch (err) {
      console.error("랜덤 입장 실패:", err);
      alert("랜덤 입장 중 문제가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }
  // uuid가 변경될 때마다 상태 확인 로직 실행되도록 의존성 추가
  useEffect(() => {
    if (!uuid) return;

    const fetchGuestStatus = async () => {
      // 유효한 UUID가 있을 때만 API 호출
      const guestUuid = Cookies.get('kkua_guest_uuid');
      if (guestUuid) {
        try {
          const res = await axiosInstance.get(USER_API.GET_GUEST_STATUS, {
            headers: {
              'guest_uuid_str': guestUuid
            }
          });
          const roomId = res?.data?.room_id;
          if (roomId) {
            // 진행 중인 게임이 있으면 해당 방으로 이동
            alert("기존 방에 재입장합니다.");
            navigate(gameLobbyUrl(roomId));
          }
        } catch (err) {
          console.error("게스트 상태 확인 실패:", err);
        }
      } else {
        console.log("UUID가 없어 게스트 상태 확인을 건너뜁니다.");
      }
    };
    fetchGuestStatus();
  }, [uuid, navigate]); // uuid와 navigate를 의존성으로 추가

  {/* 배너 이미지 */ }
  const slides = [
    { color: `rgb(175, 142, 235)` },
    { color: `rgb(241, 69, 79)` },
    { color: `rgb(163, 235, 142)` },
    { color: `rgb(46, 45, 213)` },
    { color: `rgb(213, 128, 45)` },
  ];

  // url 이동
  const handleClickEnterGame = async (room_id) => {
    try {
      setIsEntering(true); // 입장 중 상태 설정
      await new Promise((resolve) => setTimeout(resolve, 800)); // 살짝 딜레이 후 실제 입장
      await axiosInstance.post(ROOM_API.JOIN_ROOMS(room_id));
      navigate(gameLobbyUrl(room_id));
    } catch (err) {
      console.log(err);
      alert(err.data);
    } finally {
      setIsEntering(false); // 입장 중 상태 해제
    }
  }

  {/* 슬라이드 인터벌 초기화 함수 */ }
  const resetInterval = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      setActiveIndex((prevIndex) => (prevIndex + 1) % slides.length);
    }, 3000);
  };

  {/* 슬라이드 자동 전환 */ }
  useEffect(() => {
    resetInterval();
    return () => clearInterval(intervalRef.current); // 컴포넌트 언마운트 시 인터벌 제거
  }, [slides.length]);

  {/* 좌우 버튼 기능 추가 */ }
  const handlePrevSlide = () => {
    setActiveIndex((prevIndex) => (prevIndex === 0 ? slides.length - 1 : prevIndex - 1));
    resetInterval(); // 버튼 클릭 시 인터벌 초기화
  }

  const handleNextSlide = () => {
    setActiveIndex((prevIndex) => (prevIndex + 1) % slides.length);
    resetInterval(); // 버튼 클릭 시 인터벌 초기화
  }

  {/* 점 클릭 시 슬라이드 이동 */ }
  const handleDotClick = (index) => {
    setActiveIndex(index);
    resetInterval(); // 클릭 시 인터벌 초기화
  }
  //모달 열기
  const handleClickOpenModal = () => {
    setModalIsOpen(true)
  }
  //Refresh BTN
  const handleClickRefresh = () => {
    fetchRoom()
  }

  return (
    <div className="w-full h-screen flex justify-center bg-[#F2F2F2]">
      
      <div className="hidden md:flex items-center justify-center mr-8 ml-8">
        <a href="https://cokathtml.vercel.app/" target="_blank" rel="noopener noreferrer">
          <img
            src="/imgs/gameBanner.png"
            alt="게임 배너"
            className="w-32 h-auto object-contain hover:scale-105 transition-transform"
          />
        </a>
      </div>
      
      
      <div className="flex flex-col w-full max-w-4xl bg-[#ffffff] relative" style={{ boxShadow: '0px 0px 4px rgba(0, 0, 0, 0.3)'}}>
        {isEntering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
            <div className="bg-white px-6 py-3 rounded-lg shadow-md text-gray-700 font-semibold text-lg">
              입장 중...
            </div>
          </div>
        )}
        {/* 중앙 원형 이미지 + 게스트 아이디 */}
        <div className="w-full flex flex-col items-center mt-6 mb-2">
          <img src={guestProfileImg} alt="게스트 프로필"
            className="w-[50px] h-[50px] bg-white rounded-full object-cover mb-2 border border-gray-300"
          />
          <p className="text-lg font-semibold text-gray-700">{nickname || '게스트'}</p>

        </div>
      
        
        {/* 상단 슬라이더 
        
        {window.innerWidth < 768 && (
          
          <div
            className="relative w-full h-[30vh] mt-5 flex items-center justify-center transition-all duration-500"
            style={{ backgroundColor: slides[activeIndex].color }} >
            <button onClick={handlePrevSlide} className="absolute left-2 bg-gray-300 text-black w-8 h-8 rounded-full shadow-md"></button>
            <button onClick={handleNextSlide} className="absolute right-2 bg-gray-300 text-black w-8 h-8 rounded-full shadow-md"></button>

            <div className="absolute bottom-2 flex space-x-2">
              {slides.map((_, index) => (
                <div
                  key={index}
                  onClick={() => handleDotClick(index)}
                  className={`w-2 h-2 rounded-full cursor-pointer ${activeIndex === index ? 'bg-white' : 'bg-gray-400'}`}
                ></div>
              ))}
            </div>
          </div>
        )}
        */}
        
        <div className="flex justify-end px-4 md:px-10 pb-5 mt-2 gap-3 items-center">

        <button
          className={`text-sm px-4 py-2 rounded-full border font-semibold ${RoomFilter ? 'bg-orange-300 text-white' : 'bg-white text-gray-600'}`}
          onClick={() => setRoomFilter(prev => !prev)}
        >
          입장 가능
        </button>


          {/* 랜덤 입장 버튼 */}
          <button
            className="text-white border border-[#595C86] bg-blue-500 hover:bg-blue-600 font-bold py-3 px-6 rounded-full shadow-md text-base"
            onClick={handleRandomEnter}
          >
            🎲 랜덤 입장
          </button>

          {/* 새로고침 버튼 */}
          <div
            className="w-[44px] h-[44px] rounded-full flex items-center justify-center cursor-pointer bg-white border border-gray-300 shadow-sm"
            onClick={handleClickRefresh}
          >
            <img src={refreshImg} alt="새로고침 아이콘" className="w-5 h-5" />
          </div>

        </div>
        {/* 방 목록 */}
        {roomsData.length === 0 || !roomsData[0] || roomsData[0].title === "" ? (
          <>
            <div className="flex items-center justify-center bg-white min-h-[20vh] border rounded-md mx-4 mt-6 mb-2 shadow-md">
              <p className="text-gray-500 text-center text-lg">방을 생성해주세요.</p>
            </div>
            <div className="flex-1" />
          </>
        ) : null}
        {roomsData.length > 0 && roomsData[0].title !== "" && (
          <div className="flex-1 overflow-y-auto bg-gray-50 md:pt-16 text-left space-y-4 px-2 md:px-10 pb-24 mobile-scroll-hide">
          {(RoomFilter
            ? [...roomsData].sort((a, b) => {
                const aAvailable = a.status === "waiting" && a.participant_count < a.max_players;
                const bAvailable = b.status === "waiting" && b.participant_count < b.max_players;
                return bAvailable - aAvailable; // 입장 가능 방 먼저
              })
            : roomsData
          ).map((room, index) => (
            /* 게임리스트 컨테이너 조건부 박스 색상 */
            <div
             key={room.room_id || index}
             className="rounded-xl p-4 md:p-8 min-h-[12vh] md:min-h-[16vh] border-b flex items-center justify-between"
             style={{
               backgroundColor:
                 room.status === 'waiting'
                   ? (room.participant_count < room.max_players ? '#FFF5ED' : '#EDEDED')
                   : '#EDEDED',
               boxShadow: '2px 2px 3px rgba(0, 0, 0, 0.2)',
             }}
           >           

                <div>
                  <h3 className="font-bold mb-0.5 tracking-widest text-lg md:text-xl">{room?.title || '제목 없음'}</h3>
                  <p className="text-sm md:text-lg font-bold">{room?.game_mode || '알 수 없음'} [ {room?.participant_count || 0} / {room?.max_players || 0} ]</p>
                </div>
                { /* 게임리스트 버튼 조건부 색상 */ }
                {room.status === 'waiting' ? (
                  room.participant_count >= room.max_players ? (
                    <button className="text-white px-3 py-1 rounded bg-gray-500 cursor-not-allowed" disabled>
                      인원 초과
                    </button>
                  ) : (
                    <button
                      className="text-white px-3 py-1 rounded bg-[#FF9234] hover:bg-[#FF7676]"
                      onClick={async () => {
                        try {
                          // 최신 방 데이터 가져오기
                          const response = await axiosInstance.get(ROOM_API.get_ROOMS);
                          console.log("방 정보 확인:", response.data);

                          // API 응답 구조 확인
                          let rooms = [];
                          if (response.data && Array.isArray(response.data.rooms)) {
                            rooms = response.data.rooms;
                          } else if (Array.isArray(response.data)) {
                            rooms = response.data;
                          } else {
                            console.error("예상과 다른 API 응답 형식:", response.data);
                            alert("방 정보를 가져오는 중 오류가 발생했습니다.");
                            return;
                          }

                          // 현재 방 ID와 일치하는 방 찾기
                          const updatedRoom = rooms.find(r => r.room_id === room.room_id);

                          // 방이 없거나 인원이 가득 찼는지 확인
                          if (!updatedRoom) {
                            alert('존재하지 않는 방입니다.');
                            await fetchRoom(); // 방 목록 새로고침
                            return;
                          }

                          if (updatedRoom.participant_count >= updatedRoom.max_players) {
                            alert('인원이 초과되었습니다.');
                            await fetchRoom(); // 방 목록 새로고침
                            return;
                          }

                          // 모든 검증 통과 시 입장
                          handleClickEnterGame(room.room_id);
                        } catch (error) {
                          console.error("방 입장 전 검증 실패:", error);
                          alert("요청 처리 중 오류가 발생했습니다.");
                        }
                      }}
                    >
                      입장하기
                    </button>
                  )
                ) : (
                  <button className="text-white px-3 py-1 rounded bg-gray-500" disabled>
                    끄아 중
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 모바일: 방 생성하기 버튼 */}
        {!modalIsOpen && (
          <button
            className="w-[280px] h-[48px] flex items-center justify-center gap-2 text-red-400 border-2 rounded-full px-4 py-2 bg-white z-10 fixed bottom-4 left-1/2 transform -translate-x-1/2"
            style={{ boxShadow: '2px 2px 3px rgba(0, 0, 0, 0.2)' }}
            onClick={handleClickOpenModal}
          >
            <img src={addCatImg} className="w-8 h-8" />
            방 생성하기
          </button>
        )}

        {/* 모달 */}
        {modalIsOpen && (
          <AddRoomModal isOpen={modalIsOpen} isClose={setModalIsOpen} />
        )}

      </div >
      
    <div className="hidden md:flex items-center justify-center mr-8 ml-8">
      <a href="https://blog.naver.com/catoo_4" target="_blank" rel="noopener noreferrer">
        <img
          src="/imgs/blogBanner.png"
          alt="블로그 배너"
          className="w-32 h-auto object-contain hover:scale-105 transition-transform"
        />
      </a>
    </div>

        
    </div >
  );
}

export default Lobby;
