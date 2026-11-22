let jidla = [];
let vyhledavac;
const list = document.getElementById("list");
const detail = document.getElementById("detail");
const search = document.getElementById("search");
const detailImg = document.getElementById("detail-img");
const body = document.body;
const obedDnes = document.getElementById("obed-dnes");
const obedZitra = document.getElementById("obed-zitra");

async function nactiJidla() {
    const res = await fetch("data/jidla.json");
    jidla = await res.json();
    const indexJidel = jidla.flatMap(jidlo =>
        nazvyJidla(jidlo).map(nazev => ({
            jidlo,
            nazev: normalizeText(nazev),
            zobrazovanyNazev: nazev
        }))
    );
    vyhledavac = new Fuse(indexJidel, {
        keys: ["nazev"],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 2
    });
}

function formatDatum(datum) {
    return `${String(datum.getDate()).padStart(2, "0")}.${String(datum.getMonth() + 1).padStart(2, "0")}.${datum.getFullYear()}`;
}

function menuProDatum(jidelnicek, datum) {
    const jidla = Object.values(jidelnicek.meals || {})
        .flat()
        .filter(jidlo => jidlo.datum === datum && ["O1", "O2", "O3"].includes(jidlo.druh));

    return ["O1", "O2", "O3"].map(druh => {
        const jidlo = jidla.find(polozka => polozka.druh === druh);
        return jidlo && typeof jidlo.nazev === "string" && jidlo.nazev.trim()
            ? jidlo.nazev.trim()
            : "-";
    });
}

function najdiJidlo(nazev) {
    if (nazev === "-") return null;
    const hledanyNazev = normalizeText(nazev);
    return jidla.find(jidlo =>
        nazvyJidla(jidlo).some(jinyNazev => normalizeText(jinyNazev) === hledanyNazev)
    ) || null;
}

function nazvyJidla(jidlo) {
    return [jidlo.nazev, ...(jidlo.alternativniNazvy || [])];
}

function zobrazObedy(jidelnicek) {
    const dnes = new Date();
    const zitra = new Date(dnes);
    zitra.setDate(zitra.getDate() + 1);
    const zobrazMenu = (cil, menu) => {
        cil.replaceChildren();
        menu.forEach((nazev, index) => {
            if (index > 0) cil.appendChild(document.createTextNode("\n"));
            cil.appendChild(document.createTextNode(`${index + 1}. `));

            const jidlo = najdiJidlo(nazev);
            if (!jidlo) {
                cil.appendChild(document.createTextNode(nazev));
                return;
            }

            const odkaz = document.createElement("a");
            odkaz.href = cestaKJidlu(jidlo);
            odkaz.textContent = nazev;
            cil.appendChild(odkaz);
        });
    };

    zobrazMenu(obedDnes, menuProDatum(jidelnicek, formatDatum(dnes)));
    zobrazMenu(obedZitra, menuProDatum(jidelnicek, formatDatum(zitra)));
}

async function nactiObedy() {
    try {
        const res = await fetch("data/jidelnicek.json");
        if (!res.ok) throw new Error("Jídelníček se nepodařilo načíst");
        zobrazObedy(await res.json());
    } catch {
        obedDnes.textContent = "1. -\n2. -\n3. -";
        obedZitra.textContent = "1. -\n2. -\n3. -";
    }
}

function zobrazJidla(data) {
    list.innerHTML = "";
    data.forEach(jidlo => {
        const item = document.createElement("div");
        const odkaz = document.createElement("a");
        odkaz.href = cestaKJidlu(jidlo);
        odkaz.textContent = jidlo.zobrazovanyNazev || jidlo.nazev;
        item.appendChild(odkaz);
        list.appendChild(item);
    });
}

function cestaKJidlu(jidlo) {
    return `#/jidlo/${encodeURIComponent(jidlo.id)}`;
}

function zobrazDetail(jidlo) {
    body.classList.add("detail-open");
    list.classList.add("hidden");
    detail.classList.remove("hidden");

    document.getElementById("detail-nazev").textContent = jidlo.nazev;
    detailImg.src = jidlo.obrazek;
    nactiRecenze(jidlo.id);
}

function normalizeText(text) {
    return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function aktualizujSeznam() {
    if (!vyhledavac) return;
    const text = normalizeText(search.value.trim());
    const presne = text
        ? jidla.filter(jidlo => normalizeText(jidlo.nazev).includes(text))
        : jidla;
    const filtrovane = (presne.length
        ? presne
        : vyhledavac.search(text).map(vysledek => ({
            ...vysledek.item.jidlo,
            zobrazovanyNazev: vysledek.item.zobrazovanyNazev
        }))
    ).slice(0, 5);
    zobrazJidla(filtrovane);
    list.classList.remove("hidden");
}

function ukryjSeznam() {
    if (!detail.classList.contains("hidden")) return;
    list.classList.add("hidden");
}

function skryjDetail() {
    detail.classList.add("hidden");
    body.classList.remove("detail-open");
    list.classList.remove("hidden");
}

document.getElementById("back").onclick = (event) => {
    event.preventDefault();
    window.location.hash = "";
};

function aktualizujStranku() {
    const shoda = window.location.hash.match(/^#\/jidlo\/(\d+)$/);
    const id = shoda ? Number(shoda[1]) : null;
    const jidlo = id ? jidla.find(polozka => polozka.id === id) : null;

    if (jidlo) {
        zobrazDetail(jidlo);
    } else {
        skryjDetail();
    }
}

window.addEventListener("hashchange", aktualizujStranku);

document.addEventListener("click", (event) => {
    const target = event.target;
    if (target === search || list.contains(target)) return;
    if (target.id === "back" || detail.contains(target)) return;
    ukryjSeznam();
});

search.onfocus = aktualizujSeznam;
search.onclick = aktualizujSeznam;
search.oninput = aktualizujSeznam;

async function inicializuj() {
    await nactiJidla();
    await nactiObedy();
    aktualizujStranku();
}

inicializuj();
