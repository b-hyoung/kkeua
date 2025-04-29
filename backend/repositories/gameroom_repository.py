from sqlalchemy.orm import Session
from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime
import uuid
from sqlalchemy import text

from models.gameroom_model import Gameroom, GameStatus, GameroomParticipant, ParticipantStatus
from models.guest_model import Guest

class GameroomRepository:
    def __init__(self, db: Session):
        self.db = db
    
    def get_all(self) -> List[Gameroom]:
        rooms = self.db.query(Gameroom).filter(Gameroom.status == GameStatus.WAITING).all()
        return rooms
    
    def find_all_active(self) -> List[Gameroom]:
        """활성화된 모든 게임룸을 가져옵니다."""
        return self.get_all()  # 기존 get_all 메서드를 재사용
    
    def find_by_id(self, room_id: int) -> Optional[Gameroom]:
        """ID로 게임룸을 찾습니다."""
        try:
            room = self.db.query(Gameroom).filter(Gameroom.room_id == room_id).first()
            
            # 디버깅 로그 추가
            if room:
                # print(f"게임룸 조회: ID={room.room_id}, 제목={room.title}, 상태={room.status}")
                if isinstance(room.status, str):
                    # print(f"상태 타입: 문자열, 값: {room.status}")
                    pass
                else:
                    print(f"상태 타입: Enum, 값: {room.status.value if hasattr(room.status, 'value') else room.status}")
            else:
                print(f"게임룸 ID={room_id} 조회 결과: 없음")
            
            return room
        except Exception as e:
            print(f"게임룸 조회 오류: {str(e)}")
            import traceback
            traceback.print_exc()
            return None
    
    def find_active_by_creator(self, guest_id: int) -> Optional[Gameroom]:
        """특정 게스트가 생성하고 아직 종료되지 않은 게임룸을 조회합니다."""
        return self.db.query(Gameroom).filter(
            Gameroom.created_by == guest_id,
            Gameroom.status != GameStatus.FINISHED
        ).first()
    
    def create(self, data: Dict[str, Any]) -> Gameroom:
        """게임룸을 생성합니다."""
        now = datetime.now()
        
        new_room = Gameroom(
            title=data.get("title", "새 게임"),
            max_players=data.get("max_players", 8),
            game_mode=data.get("game_mode", "standard"),
            time_limit=data.get("time_limit", 300),
            status=GameStatus.WAITING,
            created_by=data.get("created_by"),
            created_at=now,
            updated_at=now,
            participant_count=0,
            room_type=data.get("room_type", "normal")
        )
        
        self.db.add(new_room)
        self.db.flush()  # room_id를 얻기 위해 flush
        
        return new_room
    
    def update(self, room_id: int, data: Dict[str, Any]) -> Optional[Gameroom]:
        """게임룸을 업데이트합니다."""
        room = self.find_by_id(room_id)
        if not room:
            return None
        
        # 값이 제공된 경우에만 업데이트
        for key, value in data.items():
            if hasattr(room, key) and value is not None:
                setattr(room, key, value)
        
        room.updated_at = datetime.now()
        self.db.commit()
        self.db.refresh(room)
        return room
    
    def delete(self, room_id: int) -> bool:
        """게임룸을 삭제합니다 (실제로는 상태만 FINISHED로 변경)."""
        room = self.find_by_id(room_id)
        if not room:
            return False
            
        room.status = GameStatus.FINISHED
        self.db.commit()
        return True
    
    def find_participant(self, room_id: int, guest_id: int) -> Optional[GameroomParticipant]:
        """방 ID와 게스트 ID로 특정 참가자를 찾습니다."""
        try:
            print(f"참가자 조회: 방ID={room_id}, 게스트ID={guest_id}")
            
            # left_at이 NULL인 참가자만 조회 (현재 참가 중인 사용자)
            participant = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.room_id == room_id,
                GameroomParticipant.guest_id == guest_id,
                GameroomParticipant.left_at.is_(None)  # 중요: 나가지 않은 참가자만 확인
            ).first()
            
            if participant:
                print(f"참가자 조회 결과: 참가자 발견! ID={participant.participant_id}, 상태={participant.status}")
            else:
                # 디버깅용 - 나간 참가자가 있는지 확인
                left_participant = self.db.query(GameroomParticipant).filter(
                    GameroomParticipant.room_id == room_id,
                    GameroomParticipant.guest_id == guest_id,
                    GameroomParticipant.left_at.isnot(None)  # 나간 참가자 확인
                ).first()
                
                if left_participant:
                    print(f"참가자 조회 결과: 이전에 참가했으나 나간 상태. left_at={left_participant.left_at}")
                else:
                    print(f"참가자 조회 결과: 해당 방에 참가한 적 없음")
            
            return participant
        except Exception as e:
            print(f"참가자 조회 오류: {str(e)}")
            import traceback
            traceback.print_exc()
            return None
    
    def find_other_participation(self, guest_id: int, excluding_room_id: int) -> Optional[GameroomParticipant]:
        """특정 게스트가 다른 게임룸에 참여 중인지 확인합니다."""
        return self.db.query(GameroomParticipant).filter(
            GameroomParticipant.guest_id == guest_id,
            GameroomParticipant.room_id != excluding_room_id,
            GameroomParticipant.left_at.is_(None)
        ).first()
    
    def add_participant(self, room_id: int, guest_id: int, is_creator: bool = False) -> Optional[GameroomParticipant]:
        """게임룸에 참가자를 추가합니다."""
        participant = GameroomParticipant(
            room_id=room_id,
            guest_id=guest_id,
            joined_at=datetime.now(),
            status=ParticipantStatus.READY.value if is_creator else ParticipantStatus.WAITING.value,
            is_creator=is_creator
        )
        
        self.db.add(participant)
        self.db.flush()
        
        # 참가자 수 업데이트
        room = self.find_by_id(room_id)
        if room:
            room.participant_count += 1
            self.db.commit()
        
        return participant
    
    def remove_participant(self, room_id: int, guest_id: int) -> bool:
        """게임룸에서 참가자를 제거합니다."""
        participant = self.find_participant(room_id, guest_id)
        if not participant:
            return False
            
        participant.left_at = datetime.now()
        participant.status = ParticipantStatus.LEFT
        self.db.commit()
        return True
    
    def update_game_status(self, room: Gameroom, status: GameStatus) -> Gameroom:
        """게임 상태를 업데이트합니다."""
        room.status = status
        
        # 참가자 상태 업데이트
        participant_status = None
        if status == GameStatus.PLAYING:
            participant_status = ParticipantStatus.PLAYING
        elif status == GameStatus.WAITING:
            participant_status = ParticipantStatus.WAITING
        
        if participant_status:
            participants = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.room_id == room.room_id,
                GameroomParticipant.left_at.is_(None)
            ).all()
            
            for participant in participants:
                participant.status = participant_status
        
        self.db.commit()
        self.db.refresh(room)
        return room
    
    def find_room_participants(self, room_id: int) -> List[GameroomParticipant]:
        """특정 게임룸의 모든 참가자를 조회합니다."""
        return self.db.query(GameroomParticipant).filter(
            GameroomParticipant.room_id == room_id,
            GameroomParticipant.left_at.is_(None)
        ).all()
    
    def check_active_game(self, guest_uuid: uuid.UUID) -> Tuple[bool, Optional[int]]:
        """게스트가 현재 참여 중인 게임이 있는지 확인합니다."""
        guest = self.db.query(Guest).filter(Guest.uuid == guest_uuid).first()
        if not guest:
            return False, None
        
        return GameroomParticipant.should_redirect_to_game(self.db, guest.guest_id)
        
    def update_participant_status(self, room_id:int, participant_id: int, status: str) :
        """참가자의 상태를 업데이트합니다."""
        try:
            print(f"참가자 상태 업데이트: 참가자ID={participant_id}, 새 상태={status}")
            
            # 참가자 조회
            participant = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.participant_id == participant_id
            ).first()
            
            if not participant:
                print(f"참가자 ID={participant_id} 조회 실패")
                return False
            
            # 상태 업데이트
            participant.status = status
            participant.updated_at = datetime.now()
            
            self.db.commit()
            print(f"참가자 상태 업데이트 완료: 참가자ID={participant_id}, 상태={status}")
            return participant
        except Exception as e:
            self.db.rollback()
            print(f"참가자 상태 업데이트 오류: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def find_by_uuid(self, guest_uuid: uuid.UUID) -> Optional[Guest]:
        """UUID로 게스트를 조회합니다."""
        return self.db.query(Guest).filter(Guest.uuid == guest_uuid).first()
    
    def count_participants(self, room_id: int) -> int:
        """방의 현재 참가자 수를 반환합니다."""
        try:
            count = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.room_id == room_id
            ).count()
            print(f"방 ID {room_id}의 참가자 수: {count}")
            return count
        except Exception as e:
            print(f"참가자 수 조회 오류 - room_id: {room_id}, 오류: {str(e)}")
            # 오류 발생 시 0 반환 (None 대신)
            return 0
    
    def is_participant(self, room_id: int, guest_id: int) -> bool:
        """게스트가 게임룸의 참가자인지 확인합니다."""
        try:
            participant = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.room_id == room_id,
                GameroomParticipant.guest_id == guest_id
            ).first()
            print(participant.status)
            return participant is not None
        except Exception as e:
            print(f"참가자 확인 오류: {str(e)}")
            return False

    def get_participants(self, room_id: int) -> List[Dict[str, Any]]:
        """게임룸 참여자 목록을 가져옵니다."""
        # 게임룸 정보 가져오기
        gameroom = self.find_by_id(room_id)
        if not gameroom:
            return []
        
        # 생성자 ID
        creator_id = gameroom.created_by
        
        # 참가자 정보 조회 쿼리 - status 필드 추가
        query = """
            SELECT gp.guest_id, g.nickname, gp.joined_at, gp.status
            FROM gameroom_participants gp
            JOIN guests g ON gp.guest_id = g.guest_id
            WHERE gp.room_id = :room_id AND gp.left_at IS NULL
            ORDER BY gp.joined_at ASC
        """
        
        try:
            result = self.db.execute(text(query), {"room_id": room_id}).fetchall()
            
            # 결과를 딕셔너리 리스트로 변환 - status 필드 추가
            participants = [
                {
                    "guest_id": row[0],
                    "nickname": row[1],
                    "is_creator": (row[0] == creator_id),
                    "joined_at": row[2],
                    "status": row[3]  # 상태 정보 추가
                }
                for row in result
            ]
            
            # 생성자가 먼저 오도록 정렬
            participants.sort(key=lambda p: (not p["is_creator"], p["joined_at"]))
            
            return participants
        except Exception as e:
            print(f"참가자 목록 조회 오류: {str(e)}")
            return []

    def check_participation(self, room_id: int, guest_id: int) -> Optional[GameroomParticipant]:
        """게스트가 게임룸에 참여 중인지 확인하고 참가자 객체를 반환합니다."""
        return self.db.query(GameroomParticipant).filter(
            GameroomParticipant.room_id == room_id,
            GameroomParticipant.guest_id == guest_id,
            GameroomParticipant.left_at.is_(None)  # 아직 나가지 않은 상태
        ).first()

    def find_all(self, limit=10, offset=0, filter_args=None) -> Tuple[List[Gameroom], int]:
        """
        모든 게임룸을 조회합니다. 종료된 방은 항상 제외합니다.
        
        Args:
            limit (int): 페이지당 게임룸 수
            offset (int): 오프셋 (페이지네이션용)
            filter_args (dict): 필터링 조건
        """
        # 기본 쿼리 생성
        query = self.db.query(Gameroom).filter(Gameroom.status != GameStatus.FINISHED)
        
        # 추가 필터링 적용
        if filter_args:
            for key, value in filter_args.items():
                if hasattr(Gameroom, key) and value is not None:
                    query = query.filter(getattr(Gameroom, key) == value)
        
        # 총 개수 계산
        total = query.count()
        
        # 기본 정렬: 생성일시 기준 내림차순
        query = query.order_by(Gameroom.created_at.desc())
        
        # 페이지네이션 적용
        rooms = query.offset(offset).limit(limit).all()
        
        return rooms, total

    def find_active_participants(self, guest_id: int) -> List[GameroomParticipant]:
        """특정 게스트가 참여 중인 활성 게임룸의 참가 정보를 조회합니다."""
        return self.db.query(GameroomParticipant).filter(
            GameroomParticipant.guest_id == guest_id,
            GameroomParticipant.left_at.is_(None),
            GameroomParticipant.status != ParticipantStatus.LEFT.value
        ).all()

    def update_participant_count(self, room_id: int) -> bool:
        """게임룸의 참가자 수를 업데이트합니다."""
        try:
            # 현재 활성 참가자 수 계산
            count_query = """
                SELECT COUNT(*) FROM gameroom_participants
                WHERE room_id = :room_id AND left_at IS NULL
            """
            count = self.db.execute(text(count_query), {"room_id": room_id}).scalar()
            
            # 게임룸 정보 조회
            room = self.find_by_id(room_id)
            if not room:
                return False
            
            # 참가자 수 업데이트
            room.participant_count = count
            self.db.commit()
            return True
        except Exception as e:
            self.db.rollback()
            print(f"참가자 수 업데이트 오류: {str(e)}")
            return False

    def remove_all_participants(self, room_id: int) -> bool:
        """게임룸의 모든 참가자를 퇴장 처리합니다."""
        try:
            print(f"모든 참가자 퇴장 처리: 방ID={room_id}")
            now = datetime.now()
            
            # 모든 활성 참가자 퇴장 처리
            participants = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.room_id == room_id,
                GameroomParticipant.left_at.is_(None)
            ).all()
            
            for participant in participants:
                participant.left_at = now
                participant.status = ParticipantStatus.LEFT.value if isinstance(ParticipantStatus.LEFT.value, str) else ParticipantStatus.LEFT
                participant.updated_at = now
            
            # 참가자 수 업데이트
            room = self.find_by_id(room_id)
            if room:
                room.participant_count = 0
                room.updated_at = now
            
            self.db.commit()
            print(f"모든 참가자 퇴장 처리 완료: 방ID={room_id}, 처리된 참가자 수={len(participants)}")
            return True
        except Exception as e:
            self.db.rollback()
            print(f"참가자 일괄 퇴장 처리 오류: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

    def delete_gameroom(self, room_id: int) -> bool:
        """게임룸을 삭제합니다 (상태를 FINISHED로 변경)."""
        try:
            print(f"게임룸 삭제: ID={room_id}")
            
            # 게임룸 조회
            room = self.find_by_id(room_id)
            if not room:
                print(f"게임룸 ID={room_id} 조회 실패")
                return False
            
            # 상태를 FINISHED로 변경 (DELETED가 아닌 FINISHED 사용)
            room.status = GameStatus.FINISHED.value if isinstance(GameStatus.FINISHED.value, str) else GameStatus.FINISHED
            room.ended_at = datetime.now()
            room.updated_at = datetime.now()
            
            self.db.commit()
            print(f"게임룸 삭제 완료: ID={room_id}")
            return True
        except Exception as e:
            self.db.rollback()
            print(f"게임룸 삭제 오류: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

    def update_participant_left(self, participant_id: int, left_at: datetime, status: str) -> bool:
        """참가자의 퇴장 상태를 직접 업데이트합니다."""
        try:
            print(f"참가자 퇴장 상태 업데이트: 참가자ID={participant_id}")
            
            # 직접 SQL 쿼리로 업데이트 (확실하게 처리하기 위함)
            query = """
                UPDATE gameroom_participants 
                SET left_at = :left_at, status = :status 
                WHERE participant_id = :participant_id
            """
            
            self.db.execute(text(query), {
                "participant_id": participant_id,
                "left_at": left_at,
                "status": status
            })
            
            self.db.commit()
            print(f"참가자 퇴장 처리 완료: 참가자ID={participant_id}")
            return True
        except Exception as e:
            self.db.rollback()
            print(f"참가자 퇴장 처리 오류: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

    def start_game(self, room_id: int) -> bool:
        """게임을 시작 상태로 변경합니다."""
        try:
            print(f"게임 시작: 방ID={room_id}")
            
            # 게임룸 조회
            room = self.find_by_id(room_id)
            if not room:
                print(f"게임룸 ID={room_id} 조회 실패")
                return False
            
            # 게임 상태 변경
            room.status = GameStatus.PLAYING.value if isinstance(GameStatus.PLAYING.value, str) else GameStatus.PLAYING
            room.started_at = datetime.now()
            room.updated_at = datetime.now()
            
            # 모든 참가자 상태를 PLAYING으로 변경
            participants = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.room_id == room_id,
                GameroomParticipant.left_at.is_(None)
            ).all()
            
            for participant in participants:
                participant.status = ParticipantStatus.PLAYING.value
                participant.updated_at = datetime.now()
            
            self.db.commit()
            print(f"게임 시작 완료: 방ID={room_id}, 참가자 수={len(participants)}")
            return True
        except Exception as e:
            self.db.rollback()
            print(f"게임 시작 오류: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

    def check_all_ready(self, room_id: int) -> bool:
        """모든 참가자가 준비 상태인지 확인합니다."""
        try:
            print(f"모든 참가자 준비 상태 확인: 방ID={room_id}")
            
            # 방장 정보 조회
            room = self.find_by_id(room_id)
            if not room:
                return False
            
            creator_id = room.created_by
            
            # 참가자 조회 (방장 제외)
            participants = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.room_id == room_id,
                GameroomParticipant.guest_id != creator_id,
                GameroomParticipant.left_at.is_(None)
            ).all()
            
            # 참가자가 없으면 시작 불가
            if not participants:
                print(f"방ID={room_id}에 방장 외 참가자가 없습니다.")
                return False
            
            # 모든 참가자가 READY 상태인지 확인
            all_ready = all(p.status == ParticipantStatus.READY.value for p in participants)
            
            print(f"모든 참가자 준비 상태: {all_ready}")
            return all_ready
        except Exception as e:
            print(f"준비 상태 확인 오류: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

    def end_game(self, room_id: int) -> bool:
        """게임을 종료 상태로 변경하고 참가자들은 대기 상태로 되돌립니다."""
        try:
            print(f"게임 종료: 방ID={room_id}")
            
            # 게임룸 조회
            room = self.find_by_id(room_id)
            if not room:
                print(f"게임룸 ID={room_id} 조회 실패")
                return False
            
            # 게임룸 상태를 WAITING으로 변경 (새 게임을 위해)
            room.status = GameStatus.WAITING.value if isinstance(GameStatus.WAITING.value, str) else GameStatus.WAITING
            room.ended_at = datetime.now()
            room.updated_at = datetime.now()
            
            # 모든 참가자 상태를 WAITING으로 변경
            participants = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.room_id == room_id,
                GameroomParticipant.left_at.is_(None)
            ).all()
            
            for participant in participants:
                # 방장은 항상 READY 상태로, 나머지는 WAITING으로
                if participant.is_creator:
                    participant.status = ParticipantStatus.READY.value
                else:
                    participant.status = ParticipantStatus.WAITING.value
                participant.updated_at = datetime.now()
            
            self.db.commit()
            print(f"게임 종료 완료: 방ID={room_id}, 참가자 수={len(participants)}")
            return True
        except Exception as e:
            self.db.rollback()
            print(f"게임 종료 오류: {str(e)}")
            import traceback
            traceback.print_exc()
            return False 
from sqlalchemy.orm import Session
from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime
import uuid
from sqlalchemy import text

from models.gameroom_model import Gameroom, GameStatus, GameroomParticipant, ParticipantStatus
from models.guest_model import Guest

class GameroomRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self) -> List[Gameroom]:
        rooms = self.db.query(Gameroom).filter(Gameroom.status == GameStatus.WAITING).all()
        return rooms

    def find_all_active(self) -> List[Gameroom]:
        return self.get_all()

    def find_by_id(self, room_id: int) -> Optional[Gameroom]:
        try:
            room = self.db.query(Gameroom).filter(Gameroom.room_id == room_id).first()
            return room
        except Exception:
            return None

    def find_active_by_creator(self, guest_id: int) -> Optional[Gameroom]:
        return self.db.query(Gameroom).filter(
            Gameroom.created_by == guest_id,
            Gameroom.status != GameStatus.FINISHED
        ).first()

    def create(self, data: Dict[str, Any]) -> Gameroom:
        now = datetime.now()
        new_room = Gameroom(
            title=data.get("title", "새 게임"),
            max_players=data.get("max_players", 8),
            game_mode=data.get("game_mode", "standard"),
            time_limit=data.get("time_limit", 300),
            status=GameStatus.WAITING,
            created_by=data.get("created_by"),
            created_at=now,
            updated_at=now,
            participant_count=0,
            room_type=data.get("room_type", "normal")
        )
        self.db.add(new_room)
        self.db.flush()
        return new_room

    def update(self, room_id: int, data: Dict[str, Any]) -> Optional[Gameroom]:
        room = self.find_by_id(room_id)
        if not room:
            return None
        for key, value in data.items():
            if hasattr(room, key) and value is not None:
                setattr(room, key, value)
        room.updated_at = datetime.now()
        self.db.commit()
        self.db.refresh(room)
        return room

    def delete(self, room_id: int) -> bool:
        room = self.find_by_id(room_id)
        if not room:
            return False
        room.status = GameStatus.FINISHED
        self.db.commit()
        return True

    def find_participant(self, room_id: int, guest_id: int) -> Optional[GameroomParticipant]:
        try:
            participant = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.room_id == room_id,
                GameroomParticipant.guest_id == guest_id,
                GameroomParticipant.left_at.is_(None)
            ).first()
            return participant
        except Exception:
            return None

    def find_other_participation(self, guest_id: int, excluding_room_id: int) -> Optional[GameroomParticipant]:
        return self.db.query(GameroomParticipant).filter(
            GameroomParticipant.guest_id == guest_id,
            GameroomParticipant.room_id != excluding_room_id,
            GameroomParticipant.left_at.is_(None)
        ).first()

    def add_participant(self, room_id: int, guest_id: int, is_creator: bool = False) -> Optional[GameroomParticipant]:
        participant = GameroomParticipant(
            room_id=room_id,
            guest_id=guest_id,
            joined_at=datetime.now(),
            status=ParticipantStatus.READY.value if is_creator else ParticipantStatus.WAITING.value,
            is_creator=is_creator
        )
        self.db.add(participant)
        self.db.flush()
        room = self.find_by_id(room_id)
        if room:
            room.participant_count += 1
            self.db.commit()
        return participant

    def remove_participant(self, room_id: int, guest_id: int) -> bool:
        participant = self.find_participant(room_id, guest_id)
        if not participant:
            return False
        participant.left_at = datetime.now()
        participant.status = ParticipantStatus.LEFT
        self.db.commit()
        return True

    def update_game_status(self, room: Gameroom, status: GameStatus) -> Gameroom:
        room.status = status
        participant_status = None
        if status == GameStatus.PLAYING:
            participant_status = ParticipantStatus.PLAYING
        elif status == GameStatus.WAITING:
            participant_status = ParticipantStatus.WAITING
        if participant_status:
            participants = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.room_id == room.room_id,
                GameroomParticipant.left_at.is_(None)
            ).all()
            for participant in participants:
                participant.status = participant_status
        self.db.commit()
        self.db.refresh(room)
        return room

    def find_room_participants(self, room_id: int) -> List[GameroomParticipant]:
        return self.db.query(GameroomParticipant).filter(
            GameroomParticipant.room_id == room_id,
            GameroomParticipant.left_at.is_(None)
        ).all()

    def check_active_game(self, guest_uuid: uuid.UUID) -> Tuple[bool, Optional[int]]:
        guest = self.db.query(Guest).filter(Guest.uuid == guest_uuid).first()
        if not guest:
            return False, None
        return GameroomParticipant.should_redirect_to_game(self.db, guest.guest_id)

    def update_participant_status(self, room_id:int, participant_id: int, status: str):
        try:
            participant = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.participant_id == participant_id
            ).first()
            if not participant:
                return False
            participant.status = status
            participant.updated_at = datetime.now()
            self.db.commit()
            return participant
        except Exception:
            self.db.rollback()
            return False

    def find_by_uuid(self, guest_uuid: uuid.UUID) -> Optional[Guest]:
        return self.db.query(Guest).filter(Guest.uuid == guest_uuid).first()

    def count_participants(self, room_id: int) -> int:
        try:
            count = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.room_id == room_id
            ).count()
            return count
        except Exception:
            return 0

    def is_participant(self, room_id: int, guest_id: int) -> bool:
        try:
            participant = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.room_id == room_id,
                GameroomParticipant.guest_id == guest_id
            ).first()
            return participant is not None
        except Exception:
            return False

    def get_participants(self, room_id: int) -> List[Dict[str, Any]]:
        gameroom = self.find_by_id(room_id)
        if not gameroom:
            return []
        creator_id = gameroom.created_by
        query = """
            SELECT gp.guest_id, g.nickname, gp.joined_at, gp.status
            FROM gameroom_participants gp
            JOIN guests g ON gp.guest_id = g.guest_id
            WHERE gp.room_id = :room_id AND gp.left_at IS NULL
            ORDER BY gp.joined_at ASC
        """
        try:
            result = self.db.execute(text(query), {"room_id": room_id}).fetchall()
            participants = [
                {
                    "guest_id": row[0],
                    "nickname": row[1],
                    "is_creator": (row[0] == creator_id),
                    "joined_at": row[2],
                    "status": row[3]
                }
                for row in result
            ]
            participants.sort(key=lambda p: (not p["is_creator"], p["joined_at"]))
            return participants
        except Exception:
            return []

    def check_participation(self, room_id: int, guest_id: int) -> Optional[GameroomParticipant]:
        return self.db.query(GameroomParticipant).filter(
            GameroomParticipant.room_id == room_id,
            GameroomParticipant.guest_id == guest_id,
            GameroomParticipant.left_at.is_(None)
        ).first()

    def find_all(self, limit=10, offset=0, filter_args=None) -> Tuple[List[Gameroom], int]:
        query = self.db.query(Gameroom).filter(Gameroom.status != GameStatus.FINISHED)
        if filter_args:
            for key, value in filter_args.items():
                if hasattr(Gameroom, key) and value is not None:
                    query = query.filter(getattr(Gameroom, key) == value)
        total = query.count()
        query = query.order_by(Gameroom.created_at.desc())
        rooms = query.offset(offset).limit(limit).all()
        return rooms, total

    def find_active_participants(self, guest_id: int) -> List[GameroomParticipant]:
        return self.db.query(GameroomParticipant).filter(
            GameroomParticipant.guest_id == guest_id,
            GameroomParticipant.left_at.is_(None),
            GameroomParticipant.status != ParticipantStatus.LEFT.value
        ).all()

    def update_participant_count(self, room_id: int) -> bool:
        try:
            count_query = """
                SELECT COUNT(*) FROM gameroom_participants
                WHERE room_id = :room_id AND left_at IS NULL
            """
            count = self.db.execute(text(count_query), {"room_id": room_id}).scalar()
            room = self.find_by_id(room_id)
            if not room:
                return False
            room.participant_count = count
            self.db.commit()
            return True
        except Exception:
            self.db.rollback()
            return False

    def remove_all_participants(self, room_id: int) -> bool:
        try:
            now = datetime.now()
            participants = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.room_id == room_id,
                GameroomParticipant.left_at.is_(None)
            ).all()
            for participant in participants:
                participant.left_at = now
                participant.status = ParticipantStatus.LEFT.value if isinstance(ParticipantStatus.LEFT.value, str) else ParticipantStatus.LEFT
                participant.updated_at = now
            room = self.find_by_id(room_id)
            if room:
                room.participant_count = 0
                room.updated_at = now
            self.db.commit()
            return True
        except Exception:
            self.db.rollback()
            return False

    def delete_gameroom(self, room_id: int) -> bool:
        try:
            room = self.find_by_id(room_id)
            if not room:
                return False
            room.status = GameStatus.FINISHED.value if isinstance(GameStatus.FINISHED.value, str) else GameStatus.FINISHED
            room.ended_at = datetime.now()
            room.updated_at = datetime.now()
            self.db.commit()
            return True
        except Exception:
            self.db.rollback()
            return False

    def update_participant_left(self, participant_id: int, left_at: datetime, status: str) -> bool:
        try:
            query = """
                UPDATE gameroom_participants
                SET left_at = :left_at, status = :status
                WHERE participant_id = :participant_id
            """
            self.db.execute(text(query), {
                "participant_id": participant_id,
                "left_at": left_at,
                "status": status
            })
            self.db.commit()
            return True
        except Exception:
            self.db.rollback()
            return False

    def start_game(self, room_id: int) -> bool:
        try:
            room = self.find_by_id(room_id)
            if not room:
                return False
            room.status = GameStatus.PLAYING.value if isinstance(GameStatus.PLAYING.value, str) else GameStatus.PLAYING
            room.started_at = datetime.now()
            room.updated_at = datetime.now()
            participants = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.room_id == room_id,
                GameroomParticipant.left_at.is_(None)
            ).all()
            for participant in participants:
                participant.status = ParticipantStatus.PLAYING.value
                participant.updated_at = datetime.now()
            self.db.commit()
            return True
        except Exception:
            self.db.rollback()
            return False

    def check_all_ready(self, room_id: int) -> bool:
        try:
            room = self.find_by_id(room_id)
            if not room:
                return False
            creator_id = room.created_by
            participants = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.room_id == room_id,
                GameroomParticipant.guest_id != creator_id,
                GameroomParticipant.left_at.is_(None)
            ).all()
            if not participants:
                return False
            all_ready = all(p.status == ParticipantStatus.READY.value for p in participants)
            return all_ready
        except Exception:
            return False

    def end_game(self, room_id: int) -> bool:
        try:
            room = self.find_by_id(room_id)
            if not room:
                return False
            room.status = GameStatus.WAITING.value if isinstance(GameStatus.WAITING.value, str) else GameStatus.WAITING
            room.ended_at = datetime.now()
            room.updated_at = datetime.now()
            participants = self.db.query(GameroomParticipant).filter(
                GameroomParticipant.room_id == room_id,
                GameroomParticipant.left_at.is_(None)
            ).all()
            for participant in participants:
                if participant.is_creator:
                    participant.status = ParticipantStatus.READY.value
                else:
                    participant.status = ParticipantStatus.WAITING.value
                participant.updated_at = datetime.now()
            self.db.commit()
            return True
        except Exception:
            self.db.rollback()
            return False