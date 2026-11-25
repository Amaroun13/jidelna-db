import json
from datetime import datetime
from pathlib import Path
import unicodedata
from zoneinfo import ZoneInfo


ROOT = Path(__file__).parent
MENU_PATH = ROOT / "data" / "jidelnicek.json"
MEALS_PATH = ROOT / "data" / "jidla.json"
MAPPING_PATH = ROOT / "data" / "prirazeni-jidel.json"
TIMEZONE = ZoneInfo("Europe/Prague")


def load_json(path):
    with path.open("r", encoding="utf-8") as soubor:
        return json.load(soubor)


def save_json(path, data):
    with path.open("w", encoding="utf-8") as soubor:
        json.dump(data, soubor, ensure_ascii=False, indent=2)
        soubor.write("\n")


def normalizuj_nazev(nazev):
    if not isinstance(nazev, str):
        return ""
    rozlozeny_nazev = unicodedata.normalize("NFD", nazev)
    bez_diakritiky = "".join(
        znak for znak in rozlozeny_nazev
        if unicodedata.category(znak) != "Mn"
    )
    return bez_diakritiky.strip().casefold()


def aktualizuj_prirazeni(menu, prirazeni, dnes, jidla):
    jidla_podle_nazvu = {}
    for jidlo in jidla:
        nazvy = [jidlo.get("nazev"), *jidlo.get("alternativniNazvy", [])]
        for nazev in nazvy:
            klic = normalizuj_nazev(nazev)
            if klic:
                jidla_podle_nazvu.setdefault(klic, jidlo.get("id"))

    prirazeni = [
        polozka for polozka in prirazeni
        if datetime.strptime(polozka["datum"], "%d.%m.%Y").date() >= dnes
    ]

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
                prirazena_polozka = existujici[key]
                if prirazena_polozka["nazev"] in ("Oběd 1", "Oběd 2", "Oběd 3"):
                    prirazena_polozka["nazev"] = nazev
            else:
                prirazeni.append({
                    "datum": datum,
                    "variant": variant,
                    "nazev": nazev,
                    "meal_id": None
                })
                prirazena_polozka = prirazeni[-1]
                existujici[key] = prirazena_polozka

            if prirazena_polozka.get("meal_id") is None:
                prirazena_polozka["meal_id"] = jidla_podle_nazvu.get(
                    normalizuj_nazev(prirazena_polozka["nazev"])
                )

    variant_poradi = {"O1": 1, "O2": 2, "O3": 3}

    def razeni(polozka):
        den, mesic, rok = map(int, polozka["datum"].split("."))
        return (rok, mesic, den, variant_poradi.get(polozka["variant"], 99))

    prirazeni.sort(key=razeni)
    return prirazeni


def main():
    menu = load_json(MENU_PATH)
    jidla = load_json(MEALS_PATH)
    if MAPPING_PATH.exists():
        prirazeni = load_json(MAPPING_PATH)
    else:
        prirazeni = []

    dnes = datetime.now(TIMEZONE).date()
    prirazeni = aktualizuj_prirazeni(menu, prirazeni, dnes, jidla)
    save_json(MAPPING_PATH, prirazeni)
    print(f"Soubor {MAPPING_PATH} je aktualizovany.")


if __name__ == "__main__":
    main()
