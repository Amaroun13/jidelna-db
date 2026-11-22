let reviewsClient = null;

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

async function nactiRecenze(mealId) {
    const score = document.getElementById("reviews-score");
    const list = document.getElementById("reviews-list");
    const discordLink = document.getElementById("review-discord");

    list.replaceChildren();

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

    const { data, error } = await client
        .from("approved_reviews")
        .select("rating, comment, discord_username, approved_at")
        .eq("meal_id", mealId)
        .order("approved_at", { ascending: false });

    if (error) {
        score.textContent = "Recenze se nepodařilo načíst.";
        return;
    }

    if (!data.length) {
        score.textContent = "Zatím žádné schválené recenze.";
        return;
    }

    const prumer = data.reduce((sum, recenze) => sum + recenze.rating, 0) / data.length;
    score.textContent = `${prumer.toFixed(1)} / 5 · ${data.length} ${data.length === 1 ? "recenze" : "recenzí"}`;

    data.forEach(recenze => {
        const item = document.createElement("article");
        item.className = "review";

        const nadpis = document.createElement("strong");
        nadpis.textContent = `${recenze.discord_username} · ${recenze.rating}/5`;
        item.appendChild(nadpis);

        if (recenze.comment) {
            const text = document.createElement("p");
            text.textContent = recenze.comment;
            item.appendChild(text);
        }

        list.appendChild(item);
    });
}
