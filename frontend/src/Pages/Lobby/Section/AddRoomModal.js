import React, { useState } from 'react';
import Modal from 'react-modal';
import './AddRoomModal.css';
import axiosInstance from '../../../Api/axiosInstance';
import { ROOM_API } from '../../../Api/roomApi';
import { gameLobbyUrl, gameUrl } from '../../../Component/urls';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import guestStore from '../../../store/guestStore';

Modal.setAppElement('#root');

function AddRoomModal({ isOpen, isClose }) {
    const navigate = useNavigate();
    const [roomTitle, setRoomTitle] = useState('');
    const [maxPlayers, setMaxPlayers] = useState(2);
    const [gameMode, setGameMode] = useState('arcade');
    const [timeLimit, setTimeLimit] = useState(120);

    const handleSubmit = async (e) => {
        e.preventDefault();

        // 쿠키에서 UUID 가져오기
        const guestUuid = Cookies.get('kkua_guest_uuid');

        // UUID가 없으면 로그인 페이지로 이동
        if (!guestUuid) {
            alert("로그인이 필요합니다");
            navigate('/');
            return;
        }

        try {
            console.log("방 생성 요청 경로:", ROOM_API.CREATE_ROOMS);
            console.log("전송 데이터:", {
                title: roomTitle,
                max_players: maxPlayers,
                game_mode: gameMode,
                time_limit: timeLimit
            });

            const response = await axiosInstance.post(ROOM_API.CREATE_ROOMS, {
                title: roomTitle,
                max_players: maxPlayers,
                game_mode: gameMode,
                time_limit: timeLimit
            });

            console.log("방 생성 응답:", response.data);
            alert("방이 생성되었습니다!");
            navigate(gameLobbyUrl(response.data.room_id));
        } catch (error) {
            console.error("방 생성 오류:", error);
            console.error("오류 상세:", error.response?.data);
            alert("방 생성에 실패했습니다.");
        }
    };

    return (
        <div className="modal-app">
            <Modal
                isOpen={isOpen}
                onRequestClose={() => isClose(false)}
                contentLabel="Add Room Modal"
                style={{
                    overlay: { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
                    content: { border: 'none', background: 'none', padding: 0 }
                }}
            >
                <div className="modal-container">
                    <div className="modal-ears">
                        <div className="ear left"></div>
                        <div className="ear right"></div>
                    </div>
                    <div className="modal-content">
                        <button className="close-btn" onClick={() => isClose(false)}>×</button>
                        <h2 className="modal-title">끄아 방 만들기</h2>

                        {/* 방 제목 입력 */}
                        <input
                            type="text"
                            placeholder="방 제목"
                            value={roomTitle}
                            onChange={(e) => setRoomTitle(e.target.value)}
                            className="room-title-input"
                        />

                        {/* 게임 설정 */}
                        <div className="game-settings">
                            <div className="game-mode-section">
                                <div className="label">게임 모드</div>
                                <div className="mode-buttons">
                                    <button
                                        className={`mode-btn active`}
                                        onClick={() => setGameMode('arcade')}
                                    >
                                        아케이드
                                    </button>
                                    <button
                                        className={`mode-btn boss`}
                                        onClick={() => alert("wating for Update v0.2 ~")}
                                    >
                                        보스전
                                    </button>
                                </div>
                            </div>

                            <div className="game-size-section">
                                <div className="label">인원</div>
                                <div className="size-buttons">
                                    {[2, 3, 4].map((num) => (
                                        <label key={num}>
                                            <input
                                                type="radio"
                                                name="size"
                                                value={num}
                                                checked={maxPlayers === num}
                                                onChange={() => setMaxPlayers(num)}
                                            />{' '}
                                            {num}인
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* 생성 버튼 */}
                        <button
                            className={roomTitle.length >= 2 && gameMode !== "" ? 'create-btn' : 'create-btn-fasle'}
                            onClick={handleSubmit}
                            disabled={roomTitle.length >= 2 && gameMode !== "" ? false : true}
                        >
                            생성하기
                        </button>
                        <button
                            className="cancel-btn"
                            onClick={() => isClose(false)}
                        >
                            취소하기
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

export default AddRoomModal;
