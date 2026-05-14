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

token = os.environ["VK_USER_TOKEN"]
group_id = int(os.environ["VK_GROUP_ID"])
video_path = "/home/levin/Загрузки/personal.mp4"

# 1. video.save
save_res = requests.post("https://api.vk.com/method/video.save", params={
    "group_id": group_id,
    "wallpost": 0,
    "is_private": 0,
    "v": "5.199",
    "access_token": token
}).json()

if "error" in save_res:
    print(f"video.save error: {json.dumps(save_res['error'])}", file=sys.stderr)
    sys.exit(1)

res = save_res["response"]
upload_url = res["upload_url"]
owner_id = res["owner_id"]
video_id = res["video_id"]
access_key = res.get("access_key", "")

# 2. Upload file
with open(video_path, "rb") as f:
    files = {"video_file": f}
    upload_res = requests.post(upload_url, files=files).json()

# 3. Format attachment
attachment = f"video{owner_id}_{video_id}_{access_key}" if access_key else f"video{owner_id}_{video_id}"
print(attachment)
