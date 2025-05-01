from typing import Dict, List, Set, Optional
from fastapi import WebSocket
import json
import asyncio
from datetime import datetime

class ConnectionManager:
    def __init__(self):
        # 활성 연결 관리: {room_id: {guest_id: WebSocket}}
        self.active_connections: Dict[int, Dict[int, WebSocket]] = {}
        self.user_connections: Dict[int, Dict] = {}  # guest_id: {room_id, websocket}
        
        # 끝말잇기 게임 상태 관리
        self.word_chain_games: Dict[int, Dict] = {}  # room_id: 게임 상태
        self.turn_timers: Dict[int, asyncio.Task] = {}  # room_id: 타이머 태스크
        
    async def connect(self, websocket, room_id, guest_id):
        """웹소켓 연결을 관리합니다."""
        # 게스트 생성 로직 제거
        if room_id not in self.active_connections:
            self.active_connections[room_id] = {}
        
        self.active_connections[room_id][guest_id] = websocket
        print(f"웹소켓 연결 등록: room_id={room_id}, guest_id={guest_id}")
        
        # 방 참가자 업데이트 브로드캐스트 (필요시)
        await self.broadcast_room_update(room_id, "user_joined", {
            "guest_id": guest_id
        })
        
    async def disconnect(self, websocket: WebSocket, room_id: int, guest_id: int):
        """웹소켓 연결 제거"""
        print(f"웹소켓 연결 해제: room_id={room_id}, guest_id={guest_id}")
        
        if room_id in self.active_connections and guest_id in self.active_connections[room_id]:
            del self.active_connections[room_id][guest_id]
            
            # 방에 더 이상 연결이 없으면 방 삭제
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
        
        # 사용자 연결 정보 제거
        if guest_id in self.user_connections:
            del self.user_connections[guest_id]
            
        # 사용자 퇴장 알림
        await self.broadcast_to_room(
            room_id, 
            {"type": "user_left", "guest_id": guest_id, "timestamp": datetime.utcnow().isoformat()}
        )
    
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """특정 웹소켓에 메시지 전송"""
        await websocket.send_text(json.dumps(message))
    
    async def broadcast_to_room(self, room_id: int, message: dict):
        """방의 모든 사용자에게 메시지 전송"""
        # 타입 변환 시도 (문자열로 들어온 경우 처리)
        try:
            room_id_key = int(room_id)
        except (ValueError, TypeError):
            room_id_key = room_id
            
        print(f"브로드캐스트 시도: room_id={room_id_key}, 메시지 타입={message.get('type', 'unknown')}")
        
        # active_connections에 room_id가 있는지 확인
        if room_id_key not in self.active_connections:
            print(f"방 ID {room_id_key}에 대한 활성 연결이 없습니다.")
            return
            
        # active_connections[room_id]가 딕셔너리인지 확인
        room_connections = self.active_connections[room_id_key]
        if not isinstance(room_connections, dict):
            print(f"방 {room_id_key}의 연결 정보가 예상 형식이 아닙니다: {type(room_connections)}")
            # 딕셔너리가 아닌 경우 초기화
            self.active_connections[room_id_key] = {}
            return
        
        # 메시지 형식 확인 및 누락된, 중요 필드 기본값 설정
        if 'type' not in message:
            message['type'] = 'message'
        if 'timestamp' not in message:
            message['timestamp'] = datetime.utcnow().isoformat()
        
        # 디버깅용 로그
        print(f"브로드캐스트 메시지: {json.dumps(message)}")
        print(f"방 {room_id_key}의 연결 상태: {len(room_connections)}개 연결")
        
        # 닫힌 연결 추적
        closed_connections = []
        
        for guest_id, connection in room_connections.items():
            try:
                # 웹소켓 상태 확인
                if connection and hasattr(connection, 'client_state') and connection.client_state.CONNECTED:
                    await connection.send_text(json.dumps(message))
                else:
                    print(f"연결이 이미 닫힘: room_id={room_id_key}, guest_id={guest_id}")
                    closed_connections.append(guest_id)
            except Exception as e:
                print(f"메시지 전송 오류: {str(e)} - room_id={room_id_key}, guest_id={guest_id}")
                closed_connections.append(guest_id)
        
        # 닫힌 연결 제거
        for guest_id in closed_connections:
            room_connections.pop(guest_id, None)
            print(f"닫힌 연결 제거됨: room_id={room_id_key}, guest_id={guest_id}")
    
    async def broadcast_room_update(self, room_id: int, update_type: str, data: dict = None):
        """방 상태 업데이트 알림"""
        message = {
            "type": update_type,
            "room_id": room_id,
            "timestamp": datetime.utcnow().isoformat()
        }
        if data:
            message.update({"data": data})
        await self.broadcast_to_room(room_id, message)
        
    def get_user_connection(self, guest_id: int):
        """특정 사용자의 연결 정보 조회"""
        if guest_id in self.user_connections:
            return self.user_connections[guest_id]
        return None 

    async def broadcast_ready_status(self, room_id: int, guest_id: int, is_ready: bool, nickname: str = None):
        """게스트의 준비 상태 변경을 브로드캐스트합니다."""
        message = {
            "type": "ready_status_changed",
            "guest_id": guest_id,
            "nickname": nickname,
            "is_ready": is_ready,
            "timestamp": datetime.utcnow().isoformat()
        }
        await self.broadcast_to_room(room_id, message)
    
    # 끝말잇기 게임 관련 메서드
    def initialize_word_chain_game(self, room_id: int, participants: List[Dict]):
        """끝말잇기 게임 초기화"""
        # 참가자 ID 목록
        participant_ids = [p["guest_id"] for p in participants]
        participant_nicknames = {p["guest_id"]: p["nickname"] for p in participants}
        
        # 게임 상태 초기화
        self.word_chain_games[room_id] = {
            "participants": participant_ids,
            "nicknames": participant_nicknames,
            "current_player_index": 0,
            "current_player_id": participant_ids[0],
            "current_word": "",
            "last_character": "",
            "used_words": [],
            "turn_number": 0,
            "game_started": False,
            "time_limit": 15,  # 기본 15초
            "is_game_over": False
        }
        print(f"끝말잇기 게임 초기화: room_id={room_id}, 참가자 수={len(participant_ids)}")
    
    def get_game_state(self, room_id: int) -> Dict:
        """현재 게임 상태 반환"""
        if room_id not in self.word_chain_games:
            return None
        return self.word_chain_games[room_id]
    
    def start_word_chain_game(self, room_id: int, first_word: str = "끝말잇기"):
        """게임 시작"""
        if room_id not in self.word_chain_games:
            return False
            
        game_state = self.word_chain_games[room_id]
        game_state["current_word"] = first_word
        game_state["last_character"] = first_word[-1]
        game_state["game_started"] = True
        game_state["used_words"] = [first_word]
        
        # 첫 플레이어 설정
        game_state["current_player_index"] = 0
        game_state["current_player_id"] = game_state["participants"][0]
        
        print(f"끝말잇기 게임 시작: room_id={room_id}, 첫 단어={first_word}")
        return True
    
    def validate_word(self, room_id: int, word: str, guest_id: int) -> bool:
        """단어 유효성 검사"""
        if room_id not in self.word_chain_games:
            return False
            
        game_state = self.word_chain_games[room_id]
        
        # 현재 플레이어 확인
        if game_state["current_player_id"] != guest_id:
            print(f"차례가 아닌 플레이어의 단어 제출: {guest_id}")
            return False
            
        # 이미 사용된 단어인지 확인
        if word in game_state["used_words"]:
            print(f"이미 사용된 단어: {word}")
            return False
            
        # 첫 글자가 이전 단어의 마지막 글자인지 확인
        if not word.startswith(game_state["last_character"]):
            print(f"이전 단어의 마지막 글자로 시작하지 않음: {word}")
            return False
            
        # 한글 단어인지 확인 (간단한 검증)
        if not all('\uAC00' <= char <= '\uD7A3' for char in word):
            print(f"유효한 한글 단어가 아님: {word}")
            return False
            
        return True
    
    def submit_word(self, room_id: int, word: str, guest_id: int) -> Dict:
        """단어 제출 처리"""
        if room_id not in self.word_chain_games:
            return {"success": False, "message": "게임이 초기화되지 않았습니다."}
            
        game_state = self.word_chain_games[room_id]
        
        # 게임이 시작되었는지 확인
        if not game_state["game_started"]:
            return {"success": False, "message": "게임이 아직 시작되지 않았습니다."}
            
        # 게임이 끝났는지 확인
        if game_state["is_game_over"]:
            return {"success": False, "message": "게임이 이미 종료되었습니다."}
            
        # 단어 유효성 검사
        is_valid = self.validate_word(room_id, word, guest_id)
        if not is_valid:
            return {"success": False, "message": "유효하지 않은 단어입니다."}
            
        # 타이머 취소
        if room_id in self.turn_timers:
            self.turn_timers[room_id].cancel()
            
        # 단어 등록
        game_state["current_word"] = word
        game_state["last_character"] = word[-1]
        game_state["used_words"].append(word)
        game_state["turn_number"] += 1
        
        # 다음 플레이어로 턴 넘기기
        game_state["current_player_index"] = (game_state["current_player_index"] + 1) % len(game_state["participants"])
        game_state["current_player_id"] = game_state["participants"][game_state["current_player_index"]]
        
        print(f"단어 제출 성공: room_id={room_id}, 단어={word}, 다음 플레이어={game_state['current_player_id']}")
        
        return {
            "success": True,
            "message": "단어가 성공적으로 제출되었습니다.",
            "word": word,
            "next_player": {
                "id": game_state["current_player_id"],
                "nickname": game_state["nicknames"][game_state["current_player_id"]]
            },
            "last_character": game_state["last_character"]
        }
    
    async def broadcast_word_chain_state(self, room_id: int):
        """현재 끝말잇기 게임 상태 브로드캐스트"""
        if room_id not in self.word_chain_games:
            return
            
        game_state = self.word_chain_games[room_id]
        
        await self.broadcast_room_update(
            room_id,
            "word_chain_state",
            {
                "current_word": game_state["current_word"],
                "current_player_id": game_state["current_player_id"],
                "current_player_nickname": game_state["nicknames"][game_state["current_player_id"]],
                "last_character": game_state["last_character"],
                "used_words": game_state["used_words"],
                "turn_number": game_state["turn_number"],
                "is_game_over": game_state["is_game_over"]
            }
        )
    
    def end_word_chain_game(self, room_id: int):
        """끝말잇기 게임 종료"""
        if room_id in self.word_chain_games:
            # 게임 상태 정리
            if room_id in self.turn_timers:
                self.turn_timers[room_id].cancel()
                del self.turn_timers[room_id]
                
            del self.word_chain_games[room_id]
            print(f"끝말잇기 게임 종료: room_id={room_id}")
            return True
        return False 