import unittest
from datetime import date

from priprav_prirazeni import aktualizuj_prirazeni


class AktualizujPrirazeniTest(unittest.TestCase):
    def test_removes_past_entries_and_adds_missing_meals_without_duplicates(self):
        dnes = date(2026, 11, 25)
        puvodni = [
            {"datum": "24.11.2026", "variant": "O1", "nazev": "Staré jídlo", "meal_id": 1},
            {"datum": "25.11.2026", "variant": "O1", "nazev": "Původní jídlo", "meal_id": 2},
            {"datum": "25.11.2026", "variant": "O2", "nazev": "Oběd 2", "meal_id": 4},
            {"datum": "25.11.2026", "variant": "O3", "nazev": "Oběd 3", "meal_id": 5},
            {"datum": "26.11.2026", "variant": "O1", "nazev": "Oběd 1", "meal_id": 6},
            {"datum": "27.11.2026", "variant": "O2", "nazev": "Budoucí jídlo", "meal_id": 3},
        ]
        menu = {
            "meals": {
                "table0": [
                    {"datum": "25.11.2026", "druh": "O1", "nazev": "Aktuální jídlo"},
                    {"datum": "25.11.2026", "druh": "O2", "nazev": "Nové jídlo O2"},
                    {"datum": "25.11.2026", "druh": "O3", "nazev": "Nové jídlo O3"},
                    {"datum": "26.11.2026", "druh": "O1", "nazev": "Nové jídlo O1"},
                    {"datum": "26.11.2026", "druh": "O2", "nazev": "Nové jídlo"},
                    {"datum": "27.11.2026", "druh": "O2", "nazev": "Změněné budoucí jídlo"},
                ]
            }
        }

        aktualizovane = aktualizuj_prirazeni(menu, puvodni, dnes, [])
        aktualizovane = aktualizuj_prirazeni(menu, aktualizovane, dnes, [])

        self.assertEqual(
            aktualizovane,
            [
                {"datum": "25.11.2026", "variant": "O1", "nazev": "Původní jídlo", "meal_id": 2},
                {"datum": "25.11.2026", "variant": "O2", "nazev": "Nové jídlo O2", "meal_id": 4},
                {"datum": "25.11.2026", "variant": "O3", "nazev": "Nové jídlo O3", "meal_id": 5},
                {"datum": "26.11.2026", "variant": "O1", "nazev": "Nové jídlo O1", "meal_id": 6},
                {"datum": "26.11.2026", "variant": "O2", "nazev": "Nové jídlo", "meal_id": None},
                {"datum": "27.11.2026", "variant": "O2", "nazev": "Budoucí jídlo", "meal_id": 3},
            ],
        )

    def test_auto_assigns_matching_meal_names_without_overwriting_manual_ids(self):
        dnes = date(2026, 11, 25)
        jidla = [
            {"id": 13, "nazev": "Kuřecí maso na paprice"},
            {
                "id": 14,
                "nazev": "Jídlo s alternativním názvem",
                "alternativniNazvy": ["Alternativní jídlo"],
            },
        ]
        menu = {
            "meals": {
                "table0": [
                    {"datum": "25.11.2026", "druh": "O1", "nazev": "KURECI MASO NA PAPRICE"},
                    {"datum": "25.11.2026", "druh": "O2", "nazev": "Alternativní jídlo"},
                    {"datum": "25.11.2026", "druh": "O3", "nazev": "Neznámé jídlo"},
                ]
            }
        }
        puvodni = [
            {"datum": "25.11.2026", "variant": "O1", "nazev": "KURECI MASO NA PAPRICE", "meal_id": None},
            {"datum": "25.11.2026", "variant": "O2", "nazev": "Alternativní jídlo", "meal_id": 99},
        ]

        aktualizovane = aktualizuj_prirazeni(menu, puvodni, dnes, jidla)

        self.assertEqual(
            aktualizovane,
            [
                {"datum": "25.11.2026", "variant": "O1", "nazev": "KURECI MASO NA PAPRICE", "meal_id": 13},
                {"datum": "25.11.2026", "variant": "O2", "nazev": "Alternativní jídlo", "meal_id": 99},
                {"datum": "25.11.2026", "variant": "O3", "nazev": "Neznámé jídlo", "meal_id": None},
            ],
        )


if __name__ == "__main__":
    unittest.main()
