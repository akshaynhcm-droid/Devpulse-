from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List, Optional
import json
import logging

logger = logging.getLogger("devpulse.websocket")

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_connections: Dict[str, List[WebSocket]] = {}  # user_id -> [ws]

    async def connect(self, websocket: WebSocket, user_id: Optional[str] = None):
        await websocket.accept()
        self.active_connections.append(websocket)
        if user_id:
            if user_id not in self.user_connections:
                self.user_connections[user_id] = []
            self.user_connections[user_id].append(websocket)
            logger.info(f"WebSocket connected for user {user_id}. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket, user_id: Optional[str] = None):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if user_id and user_id in self.user_connections:
            if websocket in self.user_connections[user_id]:
                self.user_connections[user_id].remove(websocket)
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]

    async def broadcast(self, message: dict):
        stale = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                stale.append(connection)
        for s in stale:
            if s in self.active_connections:
                self.active_connections.remove(s)

    async def send_to_user(self, user_id: str, message: dict):
        connections = self.user_connections.get(user_id, [])
        stale = []
        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception:
                stale.append(connection)
        for s in stale:
            self.disconnect(s, user_id)

    async def send_personal(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_json(message)
        except Exception:
            pass

    @property
    def connection_count(self) -> int:
        return len(self.active_connections)

manager = ConnectionManager()