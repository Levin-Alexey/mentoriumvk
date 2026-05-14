import requests
import sys
import json
import os
from pathlib import Path

# Load .env from project root
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

token = os.environ["VK_SK"]
photo_path = "/home/levin/Загрузки/p1.jpg"
peer_id = int(os.environ["VK_PEER_ID"])  # VK user ID for upload context

# 1. Get upload server
upload_server_res = requests.post("https://api.vk.com/method/photos.getMessagesUploadServer", params={
    "access_token": token,
    "peer_id": peer_id,
    "v": "5.199"
}).json()

if "error" in upload_server_res:
    print(f"getMessagesUploadServer error: {json.dumps(upload_server_res['error'])}", file=sys.stderr)
    sys.exit(1)

upload_url = upload_server_res["response"]["upload_url"]

# 2. Upload file
with open(photo_path, "rb") as f:
    upload_res = requests.post(upload_url, files={"photo": f}).json()

if "photo" not in upload_res or upload_res.get("photo") == "[]":
    print(f"Upload failed: {json.dumps(upload_res)}", file=sys.stderr)
    sys.exit(1)

# 3. Save photo
save_res = requests.post("https://api.vk.com/method/photos.saveMessagesPhoto", params={
    "access_token": token,
    "v": "5.199",
    "photo": upload_res["photo"],
    "server": upload_res["server"],
    "hash": upload_res["hash"]
}).json()

if "error" in save_res:
    print(f"saveMessagesPhoto error: {json.dumps(save_res['error'])}", file=sys.stderr)
    sys.exit(1)

photo = save_res["response"][0]
owner_id = photo["owner_id"]
photo_id = photo["id"]
access_key = photo.get("access_key", "")

attachment = f"photo{owner_id}_{photo_id}_{access_key}" if access_key else f"photo{owner_id}_{photo_id}"
print(attachment)
