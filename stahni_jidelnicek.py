from pathlib import Path

import requests

url = "https://app.strava.cz/api/jidelnickyPage"
cilovy_soubor = Path(__file__).parent / "data" / "jidelnicek.json"

payload = '{"cislo":"1437","lang":"CZ"}'  # musí být string

headers = {
    "Content-Type": "text/plain;charset=UTF-8"
}

cilovy_soubor.parent.mkdir(parents=True, exist_ok=True)
if cilovy_soubor.exists():
    cilovy_soubor.unlink()

r = requests.post(url, data=payload, headers=headers, timeout=60)
r.raise_for_status()
cilovy_soubor.write_bytes(r.content)
print(f"Jídelníček byl uložen do {cilovy_soubor}")
