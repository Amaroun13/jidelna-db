import "dotenv/config";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    Client,
    EmbedBuilder,
    GatewayIntentBits,
    ModalBuilder,
    PermissionFlagsBits,
    REST,
    Routes,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
    ThreadAutoArchiveDuration
} from "discord.js";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const requiredEnvironment = [
    "DISCORD_TOKEN",
    "DISCORD_CLIENT_ID",
    "DISCORD_GUILD_ID",
    "DISCORD_FORUM_ID",
    "DISCORD_MODERATION_CHANNEL_ID",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY"
];

for (const name of requiredEnvironment) {
    if (!process.env[name]) {
        throw new Error(`Chybi promenna prostredi: ${name}`);
    }
}

if (!/^\d+$/.test(process.env.DISCORD_CLIENT_ID)) {
    throw new Error("DISCORD_CLIENT_ID musi obsahovat pouze Discord Application ID.");
}

if (!/^\d+$/.test(process.env.DISCORD_GUILD_ID)
    || !/^\d+$/.test(process.env.DISCORD_FORUM_ID)
    || !/^\d+$/.test(process.env.DISCORD_MODERATION_CHANNEL_ID)) {
    throw new Error("Discord Guild, Forum a Moderation Channel ID musi byt ciselne.");
}

const supabaseUrl = process.env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
if (!/^https:\/\/.+\.supabase\.co$/.test(supabaseUrl)) {
    throw new Error("SUPABASE_URL musi obsahovat zakladni URL projektu, napr. https://projekt.supabase.co.");
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const supabase = createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: { persistSession: false },
        realtime: { transport: WebSocket }
    }
);

const prirazeniCache = {
    value: null,
    expiresAt: 0
};

const automaticPostKeysInProgress = new Set();

const commands = [
    {
        name: "otevrit-jidlo",
        description: "Otevre Forum post pro recenze jednoho jidla",
        options: [
            { name: "meal_id", description: "ID jidla z data/jidla.json", type: 4, required: true },
            { name: "nazev", description: "Nazev jidla", type: 3, required: true },
            { name: "hodiny", description: "Počet hodin, po kterých se vlákno uzavře", type: 4, required: true, min_value: 1, max_value: 168 }
        ]
    },
    {
        name: "zavrit-jidlo",
        description: "Okamžite uzavre Forum post tohoto jidla",
        options: [
            { name: "meal_id", description: "ID jidla z data/jidla.json", type: 4, required: true }
        ]
    }
];

async function registerCommands() {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
        { body: commands }
    );
}

function normalizePostName(text) {
    return text
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 70);
}

function pragueDateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Prague",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).formatToParts(date);

    const hodnota = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
        year: Number(hodnota.year),
        month: Number(hodnota.month),
        day: Number(hodnota.day),
        hour: Number(hodnota.hour),
        minute: Number(hodnota.minute)
    };
}

function pragueTimestamp(year, month, day, hour, minute) {
    const guess = Date.UTC(year, month - 1, day, hour, minute);
    const parts = pragueDateParts(new Date(guess));
    const representedAsUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute
    );
    return new Date(guess - (representedAsUtc - guess));
}

function formatMenuDate(parts) {
    return `${String(parts.day).padStart(2, "0")}.${String(parts.month).padStart(2, "0")}.${parts.year}`;
}

async function fetchJson(url, cache) {
    if (cache.value && cache.expiresAt > Date.now()) return cache.value;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Stažení JSON se nezdařilo: ${response.status}`);
    cache.value = await response.json();
    cache.expiresAt = Date.now() + 5 * 60 * 1000;
    return cache.value;
}

function jeModerator(interaction) {
    if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return true;
    if (!process.env.DISCORD_MODERATOR_ROLE_ID) return false;
    return interaction.member.roles?.cache?.has(process.env.DISCORD_MODERATOR_ROLE_ID) || false;
}

async function insertReviewPost(record, insertOptions = {}) {
    let result = await supabase
        .from("review_posts")
        .insert(record, insertOptions)
        .select("id")
        .maybeSingle();

    if (result.error?.code !== "23505") {
        return result;
    }

    const conflictText = `${result.error.message || ""} ${result.error.details || ""}`;
    if (!conflictText.includes("review_posts_pkey")
        && !conflictText.toLowerCase().includes("duplicate key")) {
        return result;
    }

    let nextId = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const maxId = await supabase
            .from("review_posts")
            .select("id")
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (maxId.error) return maxId;
        nextId = (maxId.data?.id || 0) + 1;

        result = await supabase
            .from("review_posts")
            .insert({ ...record, id: nextId }, insertOptions)
            .select("id")
            .maybeSingle();

        if (!result.error || result.error.code !== "23505") return result;
    }

    return result;
}

async function removeStaleReviewPost(row) {
    if (!row?.discord_thread_id || row.discord_thread_id.startsWith("pending:")) {
        await supabase.from("review_posts").delete().eq("id", row.id);
        return true;
    }

    const thread = await client.channels.fetch(row.discord_thread_id).catch(() => null);
    if (thread) return false;

    await supabase.from("review_posts").delete().eq("id", row.id);
    return true;
}

async function reconcileMissingReviewThreads() {
    const { data, error } = await supabase
        .from("review_posts")
        .select("id, discord_thread_id");

    if (error || !data) return;

    for (const row of data) {
        await removeStaleReviewPost(row);
    }
}

async function createAutomaticReviewPost(mealId, mealName, scheduleDate, variant, closesAt) {
    const postKey = `${scheduleDate}:${variant}`;
    if (automaticPostKeysInProgress.has(postKey)) return;
    automaticPostKeysInProgress.add(postKey);

    let reservationId = null;
    let thread = null;

    try {
        const forum = await client.channels.fetch(process.env.DISCORD_FORUM_ID);
        if (!forum || forum.type !== ChannelType.GuildForum) return;

        const existing = await supabase
            .from("review_posts")
            .select("id, discord_thread_id")
            .eq("schedule_date", scheduleDate)
            .eq("meal_variant", variant)
            .maybeSingle();

        if (existing.data) {
            const removed = await removeStaleReviewPost(existing.data);
            if (!removed) return;
        }

        const reservation = await insertReviewPost({
                meal_id: mealId,
                meal_name: mealName,
                discord_forum_id: forum.id,
                discord_thread_id: `pending:${scheduleDate}:${variant}`,
                closes_at: closesAt.toISOString(),
                automatic: true,
                schedule_date: scheduleDate,
                meal_variant: variant
            }, {
                onConflict: "schedule_date,meal_variant",
                ignoreDuplicates: true
            });

        if (reservation.error) {
            console.error("Rezervaci automatického postu nebylo možné uložit:", reservation.error.message);
            return;
        }
        if (!reservation.data) return;

        reservationId = reservation.data.id;

        const reviewButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`review-modal:${mealId}`)
                .setLabel("Napsat recenzi")
                .setStyle(ButtonStyle.Primary)
        );

        const threadName = `${variant.toLowerCase()}-${mealId}-${normalizePostName(mealName)}`.slice(0, 100);
        thread = await forum.threads.create({
            name: threadName,
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            reason: `Automaticke otevreni recenze ${scheduleDate}, ${variant}`,
            message: {
                embeds: [new EmbedBuilder()
                    .setTitle(mealName)
                    .setDescription(`Automatická recenze za ${scheduleDate}. Vyplňte hodnocení tlačítkem níže; moderátor ho schválí před zveřejněním na webu.`)
                    .addFields({ name: "Otevřeno do", value: `<t:${Math.floor(closesAt.getTime() / 1000)}:F>` })],
                components: [reviewButton]
            }
        });

        const { error } = await supabase
            .from("review_posts")
            .update({ discord_thread_id: thread.id })
            .eq("id", reservationId);

        if (error) {
            console.error("Discord vlákno nebylo možné propojit s automatickým postem:", error.message);
            await thread.setLocked(true).catch(() => null);
            await thread.setArchived(true).catch(() => null);
            await supabase.from("review_posts").delete().eq("id", reservationId);
        }
    } catch (error) {
        if (thread) {
            await thread.setLocked(true).catch(() => null);
            await thread.setArchived(true).catch(() => null);
        }
        if (reservationId) {
            await supabase.from("review_posts").delete().eq("id", reservationId);
        }
        console.error("Automatický post se nepodařilo vytvořit:", error.message);
    } finally {
        automaticPostKeysInProgress.delete(postKey);
    }
}

async function syncAutomaticReviewPosts() {
    if (process.env.AUTO_REVIEWS_ENABLED !== "true") return;

    const nowParts = pragueDateParts();
    const minuteOfDay = nowParts.hour * 60 + nowParts.minute;

    if (minuteOfDay < 11 * 60) return;

    const scheduleDate = formatMenuDate(nowParts);
    const prirazeniUrl = process.env.PRIRAZENI_URL
        || "https://raw.githubusercontent.com/Amaroun13/jidelna-db/main/data/prirazeni-jidel.json";
    const prirazeni = await fetchJson(prirazeniUrl, prirazeniCache);
    const polozky = prirazeni.filter(polozka =>
        polozka.datum === scheduleDate
        && ["O1", "O2", "O3"].includes(polozka.variant)
        && Number.isInteger(polozka.meal_id)
    );

    if (!polozky.length) return;

    const nextDate = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + 1));
    const closesAt = pragueTimestamp(
        nextDate.getUTCFullYear(),
        nextDate.getUTCMonth() + 1,
        nextDate.getUTCDate(),
        9,
        59
    );

    for (const variant of ["O1", "O2", "O3"]) {
        const polozka = polozky.find(item => item.variant === variant);
        if (!polozka) continue;

        await createAutomaticReviewPost(
            polozka.meal_id,
            polozka.nazev,
            scheduleDate,
            variant,
            closesAt
        );
    }
}

async function createReviewPost(interaction) {
    if (!jeModerator(interaction)) {
        await interaction.reply({ content: "Post muze otevrit pouze moderator.", ephemeral: true });
        return;
    }

    const mealId = interaction.options.getInteger("meal_id");
    const mealName = interaction.options.getString("nazev");
    const hours = interaction.options.getInteger("hodiny");
    const forum = await interaction.guild.channels.fetch(process.env.DISCORD_FORUM_ID);

    if (!forum || forum.type !== ChannelType.GuildForum) {
        await interaction.reply({ content: "Discord Forum nebylo možné najít.", ephemeral: true });
        return;
    }

    const existing = await supabase
        .from("review_posts")
        .select("*")
        .eq("meal_id", mealId)
        .limit(20);

    if (!existing.error && existing.data?.length) {
        for (const row of existing.data) {
            await removeStaleReviewPost(row);
        }

        const active = await supabase
            .from("review_posts")
            .select("*")
            .eq("meal_id", mealId)
            .limit(1)
            .maybeSingle();

        if (active.data) {
            await interaction.reply({
                content: `Jídlo už má otevřený post: <#${active.data.discord_thread_id}>`,
                ephemeral: true
            });
            return;
        }
    }

    const closesAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    const reviewButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`review-modal:${mealId}`)
            .setLabel("Napsat recenzi")
            .setStyle(ButtonStyle.Primary)
    );

    const thread = await forum.threads.create({
        name: `${mealId}-${normalizePostName(mealName)}`.slice(0, 100),
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: `Otevření recenzního postu pro jídlo ${mealId}`,
        message: {
            embeds: [new EmbedBuilder()
                .setTitle(mealName)
                .setDescription("Vyplňte krátké hodnocení tlačítkem níže. Recenze se zobrazí na webu až po schválení moderátorem.")
                .addFields({ name: "Otevřeno do", value: `<t:${Math.floor(closesAt.getTime() / 1000)}:F>` })],
            components: [reviewButton]
        }
    });

    const { error } = await insertReviewPost({
        meal_id: mealId,
        meal_name: mealName,
        discord_forum_id: forum.id,
        discord_thread_id: thread.id,
        closes_at: closesAt.toISOString()
    });

    if (error) {
        await thread.setLocked(true).catch(() => null);
        await thread.setArchived(true).catch(() => null);
        if (error.code === "42501") {
            await interaction.reply({
                content: "Post se nepodařilo uložit, protože bot nemá oprávnění pro tabulku review_posts v Supabase. Povolte service_role přístup a spusťte migraci.",
                ephemeral: true
            });
        } else {
            await interaction.reply({ content: `Post se nepodařilo uložit: ${error.message}`, ephemeral: true });
        }
        return;
    }

    await interaction.reply({
        content: `Forum post pro recenze byl vytvořen: <#${thread.id}>`,
        ephemeral: true
    });
}

async function closeReviewPost(interaction) {
    if (!jeModerator(interaction)) {
        await interaction.reply({ content: "Post může zavřít pouze moderátor.", ephemeral: true });
        return;
    }

    const mealId = interaction.options.getInteger("meal_id");
    const { data, error } = await supabase
        .from("review_posts")
        .select("id, discord_thread_id")
        .eq("meal_id", mealId);

    if (error || !data?.length) {
        await interaction.reply({ content: "Aktivní post pro toto jídlo nebyl nalezen.", ephemeral: true });
        return;
    }

    for (const post of data) {
        const thread = await client.channels.fetch(post.discord_thread_id).catch(() => null);
        if (thread) {
            await thread.setLocked(true).catch(() => null);
            await thread.setArchived(true).catch(() => null);
        }
        await supabase.from("review_posts").delete().eq("id", post.id);
    }

    await interaction.reply({ content: "Forum post byl uzavřen.", ephemeral: true });
}

async function openReviewModal(interaction) {
    const mealId = Number(interaction.customId.split(":")[1]);
    const post = await supabase
        .from("review_posts")
        .select("meal_id, meal_name")
        .eq("meal_id", mealId)
        .eq("discord_thread_id", interaction.channelId)
        .gt("closes_at", new Date().toISOString())
        .maybeSingle();

    if (post.error || !post.data) {
        await interaction.reply({ content: "Recenzní období už skončilo.", ephemeral: true });
        return;
    }

    const approved = await supabase
        .from("approved_reviews")
        .select("id, rating, comment")
        .eq("meal_id", mealId)
        .eq("discord_user_id", interaction.user.id)
        .maybeSingle();

    const modal = new ModalBuilder()
        .setCustomId(`submit-review:${mealId}`)
        .setTitle(approved.data ? "Přepsat starou recenzi" : post.data.meal_name.slice(0, 45));

    const rating = new StringSelectMenuBuilder()
        .setCustomId("rating")
        .setPlaceholder("Vyberte 1 až 5")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
            ...[1, 2, 3, 4, 5].map(value => ({
                label: String(value),
                value: String(value),
                default: approved.data?.rating === value
            }))
        );

    const comment = new TextInputBuilder()
        .setCustomId("comment")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500);
    if (approved.data?.comment) {
        comment.setValue(approved.data.comment);
    }

    modal.addLabelComponents(
        label => label
            .setLabel("Počet hvězdiček")
            .setStringSelectMenuComponent(rating),
        label => label
            .setLabel("Komentář")
            .setTextInputComponent(comment)
    );

    await interaction.showModal(modal);
}

async function submitReview(interaction) {
    const mealId = Number(interaction.customId.split(":")[1]);
    const [ratingText] = interaction.fields.getStringSelectValues("rating");
    const rating = Number(ratingText);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        await interaction.reply({ content: "Hodnocení musí být celé číslo od 1 do 5.", ephemeral: true });
        return;
    }

    const post = await supabase
        .from("review_posts")
        .select("meal_id, meal_name")
        .eq("meal_id", mealId)
        .eq("discord_thread_id", interaction.channelId)
        .gt("closes_at", new Date().toISOString())
        .maybeSingle();

    if (post.error || !post.data) {
        await interaction.reply({ content: "Recenzní období už skončilo.", ephemeral: true });
        return;
    }

    const previous = await supabase
        .from("approved_reviews")
        .select("rating, comment")
        .eq("meal_id", mealId)
        .eq("discord_user_id", interaction.user.id)
        .maybeSingle();

    const comment = interaction.fields.getTextInputValue("comment").trim();
    const { data, error } = await supabase
        .from("pending_reviews")
        .upsert({
            meal_id: mealId,
            meal_name: post.data.meal_name,
            discord_user_id: interaction.user.id,
            discord_username: interaction.user.username,
            rating,
            comment,
            status: "pending",
            updated_at: new Date().toISOString()
        }, { onConflict: "meal_id,discord_user_id" })
        .select("id")
        .single();

    if (error) {
        await interaction.reply({ content: `Recenzi se nepodařilo odeslat: ${error.message}`, ephemeral: true });
        return;
    }

    const moderationChannel = await client.channels.fetch(process.env.DISCORD_MODERATION_CHANNEL_ID);
    if (moderationChannel?.isTextBased()) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`approve-review:${data.id}`).setLabel("Schválit").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject-review:${data.id}`).setLabel("Zamítnout").setStyle(ButtonStyle.Danger)
        );

        await moderationChannel.send({
            embeds: [new EmbedBuilder()
                .setTitle(`${previous.data ? "Přepracovaná" : "Nová"} recenze: ${post.data.meal_name}`)
                .addFields(
                    { name: "Uživatel", value: `${interaction.user.username} (${interaction.user.id})`, inline: true },
                    { name: "Hodnocení", value: `${rating}/5`, inline: true },
                    { name: "Komentář", value: comment || "Bez komentáře" }
                )],
            components: [row]
        });
    }

    await interaction.reply({ content: "Recenze byla odeslána moderátorovi ke kontrole.", ephemeral: true });
}

async function handleModerationButton(interaction) {
    if (!jeModerator(interaction)) {
        await interaction.reply({ content: "Nemáte oprávnění moderovat recenze.", ephemeral: true });
        return;
    }

    const [action, idText] = interaction.customId.split(":");
    const reviewId = Number(idText);
    const pending = await supabase
        .from("pending_reviews")
        .select("*")
        .eq("id", reviewId)
        .eq("status", "pending")
        .maybeSingle();

    if (pending.error || !pending.data) {
        await interaction.reply({ content: "Recenze už není ve frontě.", ephemeral: true });
        return;
    }

    if (action === "reject-review") {
        await supabase
            .from("pending_reviews")
            .update({ status: "rejected", updated_at: new Date().toISOString() })
            .eq("id", reviewId);
        await interaction.update({ content: "Recenze byla zamítnuta.", components: [] });
        return;
    }

    const { error } = await supabase.from("approved_reviews").upsert({
        meal_id: pending.data.meal_id,
        meal_name: pending.data.meal_name,
        discord_user_id: pending.data.discord_user_id,
        discord_username: pending.data.discord_username,
        rating: pending.data.rating,
        comment: pending.data.comment,
        approved_at: new Date().toISOString()
    }, { onConflict: "meal_id,discord_user_id" });

    if (error) {
        await interaction.reply({ content: `Schválení se nepovedlo: ${error.message}`, ephemeral: true });
        return;
    }

    await supabase.from("pending_reviews").delete().eq("id", reviewId);
    await interaction.update({ content: "Recenze byla schválena a případná stará recenze tohoto uživatele byla přepsána.", components: [] });
}

async function closeExpiredPosts() {
    const { data, error } = await supabase
        .from("review_posts")
        .select("id, discord_thread_id")
        .lt("closes_at", new Date().toISOString());

    if (error || !data) return;

    for (const row of data) {
        const thread = await client.channels.fetch(row.discord_thread_id).catch(() => null);
        if (thread) {
            await thread.setLocked(true).catch(() => null);
            await thread.setArchived(true).catch(() => null);
        }
        await supabase.from("review_posts").delete().eq("id", row.id);
    }
}

client.once("clientReady", async () => {
    await registerCommands();
    await reconcileMissingReviewThreads();
    await closeExpiredPosts();
    await syncAutomaticReviewPosts().catch(error => {
        console.error("Automatická synchronizace se nepovedla:", error);
    });
    setInterval(closeExpiredPosts, 60 * 1000);
    setInterval(() => {
        syncAutomaticReviewPosts().catch(error => {
            console.error("Automatická synchronizace se nepovedla:", error);
        });
    }, 60 * 1000);
    console.log(`Bot běží jako ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
    if (interaction.isChatInputCommand()) {
        try {
            if (interaction.commandName === "otevrit-jidlo") {
                await createReviewPost(interaction);
            } else if (interaction.commandName === "zavrit-jidlo") {
                await closeReviewPost(interaction);
            }
        } catch (error) {
            console.error(error);
            if (!interaction.replied) {
                await interaction.reply({ content: "Operaci se nepodařilo provést.", ephemeral: true }).catch(() => null);
            }
        }
        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("review-modal:")) {
        await openReviewModal(interaction).catch(error => {
            console.error(error);
        });
        return;
    }

    if (interaction.isButton()) {
        await handleModerationButton(interaction).catch(error => {
            console.error(error);
        });
        return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("submit-review:")) {
        await submitReview(interaction).catch(error => {
            console.error(error);
        });
    }
});

client.login(process.env.DISCORD_TOKEN);
