let jidla = [];
const list = document.getElementById("list");
const detail = document.getElementById("detail");
const search = document.getElementById("search");
const detailImg = document.getElementById("detail-img");

detailImg.onload = () => {
    detailImg.classList.add("show");
};

async function nactiJidla() {
    const res = await fetch("data/jidla.json");
    jidla = await res.json();
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
