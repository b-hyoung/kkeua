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