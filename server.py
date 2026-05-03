import asyncio
import json
import websockets
import logging
import os
import mimetypes
from http import HTTPStatus

logging.basicConfig(level=logging.INFO)

async def process_request(path, request_headers):
    if path == "/ws":
        return None  # Let websockets handle this connection

    if path == "/":
        path = "/index.html"
    
    public_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')
    filepath = os.path.join(public_dir, path.lstrip("/"))
    
    # Prevent directory traversal
    if not os.path.abspath(filepath).startswith(public_dir):
        return (HTTPStatus.FORBIDDEN, [], b"Forbidden\n")
        
    if not os.path.exists(filepath) or not os.path.isfile(filepath):
        return (HTTPStatus.NOT_FOUND, [], b"Not Found\n")
        
    mime_type, _ = mimetypes.guess_type(filepath)
    if not mime_type:
        mime_type = "application/octet-stream"
        
    with open(filepath, "rb") as f:
        body = f.read()
        
    headers = [
        ("Content-Type", mime_type),
        ("Content-Length", str(len(body)))
    ]
    
    return (HTTPStatus.OK, headers, body)

# Store connected clients and rooms
# Format: { room_id: { websocket1, websocket2 } }
rooms = {}

async def handle_client(websocket):
    room_id = None
    try:
        async for message in websocket:
            data = json.loads(message)
            action = data.get("action")

            if action == "join":
                room_id = data.get("room")
                if not room_id:
                    continue

                if room_id not in rooms:
                    rooms[room_id] = set()

                if len(rooms[room_id]) >= 2:
                    await websocket.send(json.dumps({"action": "error", "message": "Room is full"}))
                    return

                rooms[room_id].add(websocket)
                logging.info(f"User joined room: {room_id}. Total: {len(rooms[room_id])}")

                # If room has 2 users, notify them to start connection
                if len(rooms[room_id]) == 2:
                    clients = list(rooms[room_id])
                    await clients[0].send(json.dumps({"action": "ready", "initiator": True}))
                    await clients[1].send(json.dumps({"action": "ready", "initiator": False}))
            
            elif action in ["offer", "answer", "ice-candidate"]:
                # Relay to the other peer in the room
                if room_id and room_id in rooms:
                    for client in rooms[room_id]:
                        if client != websocket:
                            await client.send(json.dumps(data))

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        if room_id and room_id in rooms:
            if websocket in rooms[room_id]:
                rooms[room_id].remove(websocket)
                logging.info(f"User left room: {room_id}. Total: {len(rooms[room_id])}")
                # Notify remaining user
                for client in rooms[room_id]:
                    await client.send(json.dumps({"action": "peer-disconnected"}))
            
            if len(rooms[room_id]) == 0:
                del rooms[room_id]

async def main():
    async with websockets.serve(handle_client, "0.0.0.0", 8000, process_request=process_request):
        logging.info("Server listening on http://0.0.0.0:8000 (and ws://0.0.0.0:8000/ws)")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
