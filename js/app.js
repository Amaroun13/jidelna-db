let jidla = [];
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

function zobrazObedy(jidelnicek) {
    const dnes = new Date();
    const zitra = new Date(dnes);
    zitra.setDate(zitra.getDate() + 1);
    const vypis = jidla => jidla.map((jidlo, index) => `${index + 1}. ${jidlo}`).join("\n");

    obedDnes.textContent = vypis(menuProDatum(jidelnicek, formatDatum(dnes)));
    obedZitra.textContent = vypis(menuProDatum(jidelnicek, formatDatum(zitra)));
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
    if (!jidla.length) return;
    const text = normalizeText(search.value);
    const filtrovane = jidla.filter(j => normalizeText(j.nazev).includes(text));
    zobrazJidla(filtrovane);
    list.classList.remove("hidden");
}

function ukryjSeznam() {
    if (!detail.classList.contains("hidden")) return;
    list.classList.add("hidden");
}

document.getElementById("back").onclick = () => {
    body.classList.remove("detail-open");
    detail.classList.add("hidden");
    list.classList.remove("hidden");
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

nactiJidla();
nactiObedy();
