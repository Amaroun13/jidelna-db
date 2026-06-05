let jidla = [];
const list = document.getElementById("list");
const detail = document.getElementById("detail");
const search = document.getElementById("search");

async function nactiJidla() {
    const res = await fetch("data/jidla.json");
    jidla = await res.json();
    zobrazJidla(jidla);
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
    document.getElementById("detail-img").src = jidlo.obrazek;
}

document.getElementById("back").onclick = () => {
    detail.classList.add("hidden");
    list.classList.remove("hidden");
};

search.oninput = () => {
    const text = search.value.toLowerCase();
    const filtrovane = jidla.filter(j => j.nazev.toLowerCase().includes(text));
    zobrazJidla(filtrovane);
};


nactiJidla();
