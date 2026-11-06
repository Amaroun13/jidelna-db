let jidla = [];
let vyhledavac;
const list = document.getElementById("list");
const detail = document.getElementById("detail");
const search = document.getElementById("search");
const detailImg = document.getElementById("detail-img");
const body = document.body;
const obedDnes = document.getElementById("obed-dnes");
const obedZitra = document.getElementById("obed-zitra");

detailImg.onload = () => {
    detailImg.classList.add("show");
};

async function nactiJidla() {
    const res = await fetch("data/jidla.json");
    jidla = await res.json();
    vyhledavac = new Fuse(jidla, {
        keys: ["nazev"],
        threshold: 0.4,
        ignoreLocation: true,
        ignoreDiacritics: true
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
    return vyhledavac.search(nazev)[0]?.item || null;
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
            odkaz.href = "#";
            odkaz.textContent = nazev;
            odkaz.onclick = event => {
                event.preventDefault();
                zobrazDetail(jidlo);
            };
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
        item.textContent = jidlo.nazev;
        item.onclick = () => zobrazDetail(jidlo);
        list.appendChild(item);
    });
}

function zobrazDetail(jidlo) {
    body.classList.add("detail-open");
    list.classList.add("hidden");
    detail.classList.remove("hidden");

    document.getElementById("detail-nazev").textContent = jidlo.nazev;
    detailImg.classList.remove("show");
    detailImg.src = jidlo.obrazek;
}

function normalizeText(text) {
    return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function aktualizujSeznam() {
    if (!vyhledavac) return;
    const text = normalizeText(search.value.trim());
    const filtrovane = text
        ? vyhledavac.search(text).slice(0, 5).map(vysledek => vysledek.item)
        : jidla.slice(0, 5);
    zobrazJidla(filtrovane);
    list.classList.remove("hidden");
}

function ukryjSeznam() {
    if (!detail.classList.contains("hidden")) return;
    list.classList.add("hidden");
}

document.getElementById("back").onclick = (event) => {
    event.preventDefault();
    if (detail.classList.contains("closing")) return;

    detail.classList.add("closing");
    setTimeout(() => {
        detail.classList.remove("closing");
        detail.classList.add("hidden");
        body.classList.remove("detail-open");
        list.classList.remove("hidden");
    }, 350);
};

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
}

inicializuj();
