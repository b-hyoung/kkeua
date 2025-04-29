from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
import uuid
import json
from datetime import datetime
import traceback
from typing import Tuple, Optional, Dict, Any

from db.postgres import get_db
from repositories.gameroom_repository import GameroomRepository
from repositories.guest_repository import GuestRepository
from models.gameroom_model import ParticipantStatus, GameroomParticipant
from models.guest_model import Guest
from services.gameroom_service import ws_manager
from schemas.gameroom_ws_schema import WebSocketMessage, ChatMessage

router = APIRouter(
    prefix="/ws/gamerooms",
    tags=["websockets"],
)

# 게스트 및 참가자 검증 함수
async def validate_connection(
    websocket: WebSocket,
    room_id: int,
    guest_uuid_str: str,
    db: Session
) -> Tuple[Optional[Guest], Optional[GameroomParticipant]]:
    try:
        guest_uuid_obj = uuid.UUID(guest_uuid_str)
    except ValueError:
        await websocket.close(code=4000, reason="유효하지 않은 UUID 형식입니다")
        return None, None
    guest_repo = GuestRepository(db)
    guest = guest_repo.find_by_uuid(guest_uuid_obj)
    if not guest:
        await websocket.close(code=4001, reason="유효하지 않은 게스트 UUID입니다")
        return None, None
    gameroom_repo = GameroomRepository(db)
    room = gameroom_repo.find_by_id(room_id)
    if not room:
        await websocket.close(code=4002, reason="게임룸이 존재하지 않습니다")
        return None, None
    participant = gameroom_repo.find_participant(room_id, guest.guest_id)
    is_participant = participant is not None
    is_creator = room.created_by == guest.guest_id
    if not (is_participant or is_creator):
        await websocket.close(code=4003, reason="게임룸에 참가하지 않은 게스트입니다")
        return None, None
    if is_creator and not is_participant:
        participant = gameroom_repo.add_participant(room_id, guest.guest_id)
    return guest, participant

# 메시지 처리 함수
async def process_message(
    message_data: Dict[str, Any],
    websocket: WebSocket,
    room_id: int,
    guest: Guest,
    participant: GameroomParticipant,
    gameroom_repo: GameroomRepository
):
    message_type = message_data.get("type")
    if message_type == "chat":
        nickname = guest.nickname if guest.nickname else f"게스트_{guest.uuid.hex[:8]}"
        await ws_manager.broadcast_to_room(
            room_id,
            {
                "type": "chat",
                "guest_id": guest.guest_id,
                "nickname": nickname,
                "message": message_data.get("message", ""),
                "timestamp": message_data.get("timestamp", "")
            }
        )
    elif message_type == "toggle_ready":
        if not participant:
            await ws_manager.send_personal_message({
                "type": "error",
                "message": "준비 상태 변경 실패: 참가자 정보가 없습니다"
            }, websocket)
            return
        current_status = participant.status
        if current_status == ParticipantStatus.WAITING:
            new_status = ParticipantStatus.READY
            is_ready = True
        elif current_status == ParticipantStatus.READY:
            new_status = ParticipantStatus.WAITING
            is_ready = False
        else:
            await ws_manager.send_personal_message({
                "type": "error",
                "message": "게임 중에는 준비 상태를 변경할 수 없습니다"
            }, websocket)
            return
        updated = gameroom_repo.update_participant_status(room_id, participant.participant_id, new_status)
        if not updated:
            await ws_manager.send_personal_message({
                "type": "error",
                "message": "DB 상태 업데이트 실패"
            }, websocket)
            return
        await ws_manager.broadcast_ready_status(
            room_id,
            guest.guest_id,
            is_ready,
            guest.nickname
        )
        await ws_manager.send_personal_message({
            "type": "ready_status_updated",
            "is_ready": is_ready
        }, websocket)
    elif message_type == "status_update":
        status = message_data.get("status", "WAITING")
        try:
            status_enum = ParticipantStatus[status]
        except KeyError:
            await ws_manager.send_personal_message({
                "type": "error",
                "message": f"유효하지 않은 상태 값: {status}"
            }, websocket)
            return
        if participant:
            updated = gameroom_repo.update_participant_status(participant.id, status_enum)
            status_value = updated.status.value if hasattr(updated.status, 'value') else updated.status
            await ws_manager.broadcast_room_update(
                room_id,
                "status_changed",
                {
                    "guest_id": guest.guest_id,
                    "nickname": guest.nickname,
                    "status": status_value
                }
            )
        else:
            await ws_manager.send_personal_message({
                "type": "error",
                "message": "상태 업데이트 실패: 참가자 정보가 없습니다"
            }, websocket)
    elif message_type == "word_chain":
        await process_word_chain_message(message_data, websocket, room_id, guest, participant, gameroom_repo)

# 끝말잇기 메시지 처리
async def process_word_chain_message(
    message_data: Dict[str, Any],
    websocket: WebSocket,
    room_id: int,
    guest: Guest,
    participant: GameroomParticipant,
    gameroom_repo: GameroomRepository
):
    action = message_data.get("action")
    if action == "initialize_game":
        room = gameroom_repo.find_by_id(room_id)
        if room.created_by != guest.guest_id:
            await ws_manager.send_personal_message({
                "type": "error",
                "message": "방장만 게임을 초기화할 수 있습니다."
            }, websocket)
            return
        participants = gameroom_repo.find_room_participants(room_id)
        participant_data = [
            {
                "guest_id": p.guest.guest_id,
                "nickname": p.guest.nickname,
                "status": p.status.value if hasattr(p.status, 'value') else p.status,
                "is_creator": p.guest.guest_id == p.gameroom.created_by
            }
            for p in participants if p.left_at is None
        ]
        ws_manager.initialize_word_chain_game(room_id, participant_data)
        await ws_manager.broadcast_room_update(
            room_id,
            "word_chain_initialized",
            {
                "message": "끝말잇기 게임이 초기화되었습니다.",
                "participants": participant_data
            }
        )
    elif action == "start_game":
        room = gameroom_repo.find_by_id(room_id)
        if room.created_by != guest.guest_id:
            await ws_manager.send_personal_message({
                "type": "error",
                "message": "방장만 게임을 시작할 수 있습니다."
            }, websocket)
            return
        first_word = message_data.get("first_word", "끝말잇기")
        result = ws_manager.start_word_chain_game(room_id, first_word)
        if result:
            game_state = ws_manager.get_game_state(room_id)
            if game_state:
                await ws_manager.broadcast_room_update(
                    room_id,
                    "word_chain_started",
                    {
                        "message": "끝말잇기 게임이 시작되었습니다!",
                        "first_word": first_word,
                        "current_player_id": game_state["current_player_id"],
                        "current_player_nickname": game_state["nicknames"][game_state["current_player_id"]]
                    }
                )
                await ws_manager.broadcast_word_chain_state(room_id)
                await ws_manager.start_turn_timer(room_id, game_state.get("time_limit", 15))
        else:
            await ws_manager.send_personal_message({
                "type": "error",
                "message": "게임 시작에 실패했습니다."
            }, websocket)
    elif action == "submit_word":
        word = message_data.get("word", "").strip()
        if not word:
            await ws_manager.send_personal_message({
                "type": "error",
                "message": "단어를 입력해주세요."
            }, websocket)
            return
        result = ws_manager.submit_word(room_id, word, guest.guest_id)
        if result["success"]:
            await ws_manager.broadcast_room_update(
                room_id,
                "word_chain_word_submitted",
                {
                    "word": word,
                    "submitted_by": {
                        "id": guest.guest_id,
                        "nickname": guest.nickname
                    },
                    "next_player": result["next_player"],
                    "last_character": result["last_character"]
                }
            )
            await ws_manager.broadcast_word_chain_state(room_id)
            game_state = ws_manager.get_game_state(room_id)
            if game_state:
                await ws_manager.start_turn_timer(room_id, game_state.get("time_limit", 15))
        else:
            await ws_manager.send_personal_message({
                "type": "word_chain_error",
                "message": result["message"]
            }, websocket)
    elif action == "end_game":
        room = gameroom_repo.find_by_id(room_id)
        if room.created_by != guest.guest_id:
            await ws_manager.send_personal_message({
                "type": "error",
                "message": "방장만 게임을 종료할 수 있습니다."
            }, websocket)
            return
        result = ws_manager.end_word_chain_game(room_id)
        if result:
            await ws_manager.broadcast_room_update(
                room_id,
                "word_chain_game_ended",
                {
                    "message": "게임이 종료되었습니다.",
                    "ended_by": {
                        "id": guest.guest_id,
                        "nickname": guest.nickname
                    }
                }
            )
        else:
            await ws_manager.send_personal_message({
                "type": "error",
                "message": "게임 종료에 실패했습니다."
            }, websocket)
    elif action == "validate_word":
        word = message_data.get("word", "").strip()
        if not word:
            await ws_manager.send_personal_message({
                "type": "word_validation_result",
                "valid": False,
                "message": "단어를 입력해주세요."
            }, websocket)
            return
        game_state = ws_manager.get_game_state(room_id) or {}
        is_valid = True
        message = "유효한 단어입니다."
        last_char = game_state.get("last_character", "")
        used_words = game_state.get("used_words", [])
        if not used_words:
            pass
        elif word[0] != last_char:
            is_valid = False
            message = f"'{last_char}'로 시작하는 단어를 입력해야 합니다."
        elif word in used_words:
            is_valid = False
            message = "이미 사용된 단어입니다."
        elif len(word) < 2:
            is_valid = False
            message = "단어는 2글자 이상이어야 합니다."
        word_meaning = f"'{word}'의 임시 의미: {word}(은)는 한국어 단어입니다."
        nickname = guest.nickname
        guest_id = guest.guest_id
        validation_result = {
            "type": "word_validation_result",
            "valid": is_valid,
            "message": message,
            "word": word,
            "meaning": word_meaning,
            "submitted_by": {
                "nickname": nickname,
                "guest_id": guest_id
            },
            "timestamp": datetime.now().isoformat()
        }
        await ws_manager.broadcast_to_room(room_id, validation_result)
        if is_valid:
            if room_id not in ws_manager.word_chain_games:
                ws_manager.word_chain_games[room_id] = {
                    "current_word": word,
                    "last_character": word[-1],
                    "used_words": [word],
                    "nicknames": {guest_id: nickname}
                }
            else:
                ws_manager.word_chain_games[room_id]["current_word"] = word
                ws_manager.word_chain_games[room_id]["last_character"] = word[-1]
                ws_manager.word_chain_games[room_id]["used_words"].append(word)

@router.websocket("/{room_id}/{guest_uuid}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: int,
    guest_uuid: str,
    db: Session = Depends(get_db)
):
    guest = None
    try:
        await websocket.accept()
        guest, participant = await validate_connection(websocket, room_id, guest_uuid, db)
        if not guest:
            return
        gameroom_repo = GameroomRepository(db)
        await ws_manager.connect(websocket, room_id, guest.guest_id)
        participants = gameroom_repo.find_room_participants(room_id)
        participant_data = [
            {
                "guest_id": p.guest.guest_id,
                "nickname": p.guest.nickname,
                "status": p.status.value if hasattr(p.status, 'value') else p.status,
                "is_owner": p.guest.guest_id == p.gameroom.created_by
            }
            for p in participants
        ]
        await ws_manager.broadcast_to_room(room_id, {
            "type": "participants_update",
            "participants": participant_data,
            "message": f"{guest.nickname}님이 입장했습니다."
        })
        await ws_manager.send_personal_message({
            "type": "connected",
            "message": "게임룸 웹소켓에 연결되었습니다",
            "guest_id": guest.guest_id,
            "room_id": room_id,
            "timestamp": datetime.utcnow().isoformat()
        }, websocket)
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    message_data = json.loads(data)
                    action = message_data.get("action", "")
                    await process_message(message_data, websocket, room_id, guest, participant, gameroom_repo)
                except Exception as e:
                    if guest:
                        await ws_manager.disconnect(websocket, room_id, guest.guest_id)
        except WebSocketDisconnect:
            await ws_manager.disconnect(websocket, room_id, guest.guest_id)
            await ws_manager.broadcast_room_update(
                room_id,
                "user_left",
                {
                    "guest_id": guest.guest_id,
                    "nickname": guest.nickname
                }
            )
        except Exception as e:
            try:
                await websocket.close(code=4003, reason=f"오류 발생: {str(e)}")
            except:
                pass
    except Exception as e:
        try:
            await websocket.close(code=4003, reason=f"오류 발생: {str(e)}")
        except:
            pass

@router.get("/documentation", tags=["websockets"])
def websocket_documentation():
    """
    # 웹소켓 API 문서
    ## 연결 URL
    - `ws://서버주소/ws/gamerooms/{room_id}/{guest_uuid}`
    ## 메시지 형식
    모든 메시지는 JSON 형식이며 다음 구조를 따릅니다:
    ```json
    {
        "type": "메시지_타입",
        "data": { /* 메시지별 데이터 */ }
    }
    ```
    ## 지원하는 메시지 유형
    1. **chat**: 채팅 메시지
       - 송신: `{"type": "chat", "data": {"message": "내용"}}`
       - 수신: `{"type": "chat", "guest_id": 123, "nickname": "사용자", "message": "내용", "timestamp": "..."}`
    2. **toggle_ready**: 준비 상태 변경
       - 송신: `{"type": "toggle_ready"}`
       - 수신: `{"type": "ready_status_changed", "guest_id": 123, "is_ready": true}`
    3. **user_joined**: 사용자 입장 (서버에서만 전송)
       - 수신: `{"type": "user_joined", "data": {"guest_id": 123}}`
    4. **user_left**: 사용자 퇴장 (서버에서만 전송)
       - 수신: `{"type": "user_left", "data": {"guest_id": 123, "nickname": "사용자"}}`
    5. **word_chain**: 끝말잇기 게임
       - 초기화: `{"type": "word_chain", "action": "initialize_game"}`
       - 시작: `{"type": "word_chain", "action": "start_game", "first_word": "끝말잇기"}`
       - 단어 제출: `{"type": "word_chain", "action": "submit_word", "word": "단어"}`
       - 종료: `{"type": "word_chain", "action": "end_game"}`
    """
    return {
        "message": "위 문서를 참고하세요.",
        "websocket_url": "/ws/gamerooms/{room_id}/{guest_uuid}"
    }