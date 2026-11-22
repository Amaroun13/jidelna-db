import json
from pathlib import Path


ROOT = Path(__file__).parent
MENU_PATH = ROOT / "data" / "jidelnicek.json"
MAPPING_PATH = ROOT / "data" / "prirazeni-jidel.json"


def load_json(path):
    with path.open("r", encoding="utf-8") as soubor:
        return json.load(soubor)


def save_json(path, data):
    with path.open("w", encoding="utf-8") as soubor:
        json.dump(data, soubor, ensure_ascii=False, indent=2)
        soubor.write("\n")


def main():
    menu = load_json(MENU_PATH)
    if MAPPING_PATH.exists():
        prirazeni = load_json(MAPPING_PATH)
    else:
        prirazeni = []

    existujici = {
        (policka["datum"], policka["variant"]): policka
        for policka in prirazeni
    }

    for polozky in menu.get("meals", {}).values():
        for polozka in polozky:
            if polozka.get("druh") not in ("O1", "O2", "O3"):
                continue

            datum = polozka.get("datum")
            nazev = polozka.get("nazev", "").strip()
            variant = polozka.get("druh")

            if not datum or not nazev:
                continue

            key = (datum, variant)
            if key in existujici:
                existujici[key]["nazev"] = nazev
                continue

            prirazeni.append({
                "datum": datum,
                "variant": variant,
                "nazev": nazev,
                "meal_id": None
            })
            existujici.add(key)

    variant_poradi = {"O1": 1, "O2": 2, "O3": 3}
    def razeni(polozka):
        den, mesic, rok = map(int, polozka["datum"].split("."))
        return (rok, mesic, den, variant_poradi.get(polozka["variant"], 99))

    prirazeni.sort(key=razeni)
    save_json(MAPPING_PATH, prirazeni)
    print(f"Soubor {MAPPING_PATH} je aktualizovany.")


if __name__ == "__main__":
    main()
