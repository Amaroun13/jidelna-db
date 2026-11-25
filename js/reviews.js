let reviewsClient = null;
let schvaleneRecenze = [];
let aktualniMealId = null;
let pozadavekRecenzi = 0;
let pocetNactenychRecenzi = 0;
let celkovyPocetRecenzi = 0;
let nacitaniDalsichRecenzi = false;
const POCET_RECENZI_NA_STRANKU = 10;

document.getElementById("reviews-sort").addEventListener("change", () => {
    if (aktualniMealId !== null) nactiRecenze(aktualniMealId);
});
document.getElementById("reviews-load-more").addEventListener("click", nactiDalsiRecenze);

function jeRecenzniKonfiguraceNastavena() {
    return window.REVIEW_CONFIG.supabaseUrl
        && window.REVIEW_CONFIG.supabasePublishableKey;
}

function reviewsClientSetup() {
    if (!jeRecenzniKonfiguraceNastavena()) return null;
    if (!reviewsClient) {
        reviewsClient = window.supabase.createClient(
            window.REVIEW_CONFIG.supabaseUrl,
            window.REVIEW_CONFIG.supabasePublishableKey
        );
    }
    return reviewsClient;
}

function dotazNaRecenze(client, mealId, offset) {
    const razeni = {
        "date-asc": [["approved_at", true], ["id", true]],
        "date-desc": [["approved_at", false], ["id", false]],
        "rating-asc": [["rating", true], ["approved_at", false], ["id", false]],
        "rating-desc": [["rating", false], ["approved_at", false], ["id", false]]
    };
    const sloupce = razeni[document.getElementById("reviews-sort").value] || razeni["date-desc"];
    let dotaz = client
        .from("approved_reviews")
        .select("id, rating, comment, discord_username, approved_at")
        .eq("meal_id", mealId);

    for (const [sloupec, vzestupne] of sloupce) {
        dotaz = dotaz.order(sloupec, { ascending: vzestupne });
    }

    return dotaz.range(offset, offset + POCET_RECENZI_NA_STRANKU - 1);
}

async function nactiRecenze(mealId) {
    const score = document.getElementById("reviews-score");
    const list = document.getElementById("reviews-list");
    const discordLink = document.getElementById("review-discord");
    const loadMore = document.getElementById("reviews-load-more");
    const loadError = document.getElementById("reviews-load-error");
    const pozadavek = ++pozadavekRecenzi;

    aktualniMealId = mealId;
    schvaleneRecenze = [];
    pocetNactenychRecenzi = 0;
    celkovyPocetRecenzi = 0;
    nacitaniDalsichRecenzi = false;
    list.replaceChildren();
    loadMore.classList.add("hidden");
    loadMore.disabled = true;
    loadError.classList.add("hidden");
    loadError.textContent = "";

    if (window.REVIEW_CONFIG.discordInviteUrl) {
        discordLink.href = window.REVIEW_CONFIG.discordInviteUrl;
        discordLink.classList.remove("hidden");
    } else {
        discordLink.classList.add("hidden");
    }

    const client = reviewsClientSetup();
    if (!client) {
        score.textContent = "Recenze zatím nejsou propojené s databází.";
        return;
    }

    const [souhrn, stranka] = await Promise.all([
        client.rpc("get_review_summary", { p_meal_id: mealId }).single(),
        dotazNaRecenze(client, mealId, 0)
    ]);

    if (pozadavek !== pozadavekRecenzi) return;

    if (souhrn.error || stranka.error) {
        console.error("Recenze se nepodařilo načíst.", souhrn.error || stranka.error);
        score.textContent = "Recenze se nepodařilo načíst.";
        return;
    }

    celkovyPocetRecenzi = Number(souhrn.data.review_count);
    if (!celkovyPocetRecenzi) {
        score.textContent = "Zatím žádné schválené recenze.";
        return;
    }

    const soucetHodnoceni = Number(souhrn.data.rating_sum);
    const prumer = soucetHodnoceni / celkovyPocetRecenzi;
    score.textContent = `${prumer.toFixed(1)} / 5 · ${celkovyPocetRecenzi} ${celkovyPocetRecenzi === 1 ? "recenze" : "recenzí"}`;

    schvaleneRecenze = stranka.data;
    pocetNactenychRecenzi = stranka.data.length;
    zobrazRecenze();
    loadMore.classList.toggle("hidden", pocetNactenychRecenzi >= celkovyPocetRecenzi);
    loadMore.disabled = false;
}

async function nactiDalsiRecenze() {
    if (aktualniMealId === null || nacitaniDalsichRecenzi || pocetNactenychRecenzi >= celkovyPocetRecenzi) {
        return;
    }

    const client = reviewsClientSetup();
    if (!client) return;

    const loadMore = document.getElementById("reviews-load-more");
    const loadError = document.getElementById("reviews-load-error");
    const pozadavek = pozadavekRecenzi;
    nacitaniDalsichRecenzi = true;
    loadMore.disabled = true;
    loadError.classList.add("hidden");
    loadError.textContent = "";

    try {
        const { data, error } = await dotazNaRecenze(client, aktualniMealId, pocetNactenychRecenzi);
        if (pozadavek !== pozadavekRecenzi) return;

        if (error) {
            console.error("Další recenze se nepodařilo načíst.", error);
            loadError.textContent = "Další recenze se nepodařilo načíst. Zkuste to prosím znovu.";
            loadError.classList.remove("hidden");
            return;
        }

        schvaleneRecenze.push(...data);
        pocetNactenychRecenzi += data.length;
        zobrazRecenze();
        loadMore.classList.toggle("hidden", pocetNactenychRecenzi >= celkovyPocetRecenzi);
    } catch (error) {
        if (pozadavek === pozadavekRecenzi) {
            console.error("Další recenze se nepodařilo načíst.", error);
            loadError.textContent = "Další recenze se nepodařilo načíst. Zkuste to prosím znovu.";
            loadError.classList.remove("hidden");
        }
    } finally {
        if (pozadavek === pozadavekRecenzi) {
            nacitaniDalsichRecenzi = false;
            loadMore.disabled = false;
        }
    }
}

function zobrazRecenze() {
    const list = document.getElementById("reviews-list");
    list.replaceChildren();
    schvaleneRecenze.forEach(recenze => {
        const item = document.createElement("article");
        item.className = "review";

        const nadpis = document.createElement("strong");
        nadpis.textContent = `${recenze.discord_username} · ${recenze.rating}/5`;
        item.appendChild(nadpis);

        const datum = document.createElement("time");
        datum.dateTime = recenze.approved_at;
        datum.textContent = new Intl.DateTimeFormat("cs-CZ", {
            timeZone: "Europe/Prague"
        }).format(new Date(recenze.approved_at));
        item.appendChild(datum);

        if (recenze.comment) {
            const text = document.createElement("p");
            text.textContent = recenze.comment;
            item.appendChild(text);
        }

        list.appendChild(item);
    });
}
