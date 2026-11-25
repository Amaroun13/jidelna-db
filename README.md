# JidelnaDB

JidelnaDB je statický webový projekt, který nabízí denní jídelníček, samostatné stránky jednotlivých jídel, vyhledávání a systém uživatelských recenzí prostřednictvím Discordu.

Frontend je hostován na GitHub Pages. Recenze odeslané přes Discord procházejí schvalováním moderátory a následně se zobrazují na webu prostřednictvím služby Supabase.

Aplikace JidelnaDB byla vytvořena pomocí přístupu vibe coding, tedy s využitím AI asistovaných nástrojů pro vývoj softwaru.

## Jak systém funguje

```text
GitHub Pages
 |
 +-- statický frontend
 +-- načítání schválených recenzí ze Supabase

GitHub Actions
 |
 +-- každou středu ve 14:00 pražského času stahuje jídelníček
 +-- aktualizuje soubor pro ruční přiřazování meal_id

Discord bot na platformě Pella
 |
 +-- každý den od 11:00 vytváří příspěvky ve fóru
 +-- přijímá recenze prostřednictvím tlačítka a modálního formuláře
 +-- odesílá recenze moderátorům ke schválení

Supabase
 |
 +-- ukládá otevřené příspěvky
 +-- ukládá čekající a schválené recenze
```

## Hlavní součásti projektu

- `index.html` — hlavní statická stránka.
- `style.css` — definice vzhledu aplikace.
- `js/app.js` — zpracování jídelníčku, vyhledávání a zobrazování stránek jednotlivých jídel.
- `js/reviews.js` — zobrazování schválených recenzí.
- `js/reviews-config.js` — veřejná konfigurace Supabase a odkazu na pozvánku na Discord.
- `data/jidla.json` — databáze jídel a jejich alternativních názvů.
- `data/jidelnicek.json` — aktuální data získaná prostřednictvím Strava API.
- `data/prirazeni-jidel.json` — ruční přiřazování jídel podle data a varianty k příslušnému `meal_id`.
- `priprav_prirazeni.py` — skript pro doplňování nových jídel do souboru s přiřazením.
- `stahni_jidelnicek.py` — skript pro stahování jídelníčku.
- `bot/src/index.js` — zdrojový kód Discord bota.
- `supabase/migrations/20261122_discord_reviews.sql` — databázová migrace.
- `.github/workflows/weekly-menu.yml` — workflow pro pravidelnou aktualizaci jídelníčku.

## Stránky jednotlivých jídel

Každé jídlo má vlastní URL adresu využívající hash:

```text
#/jidlo/13
```

Jídla jsou identifikována pomocí stabilního číselného identifikátoru `meal_id`.

## Discord Forum

Bot dokáže vytvořit samostatné vlákno ve fóru pro každé jídlo.

Uživatel otevře příslušné vlákno, stiskne tlačítko **Napsat recenzi** a vyplní formulář obsahující:

- hodnocení v rozsahu 1 až 5 hvězdiček,
- volitelný textový komentář.

Odeslaná recenze je předána moderátorům ke kontrole. Na webu se zobrazí až po jejím schválení.

### Ruční příkazy typu slash

```text
/otevrit-jidlo meal_id:13 nazev:"Sekaná pečeně" hodiny:6
/zavrit-jidlo meal_id:13
```

Příkaz `/otevrit-jidlo` je dostupný pouze moderátorům.

## Automatické vytváření vláken ve fóru

Automatické vytváření vláken se aktivuje nastavením proměnné:

```text
AUTO_REVIEWS_ENABLED=true
```

Systém dodržuje následující pravidla:

- Bot kontroluje aktuální čas každou minutu.
- Vlákna se otevírají každý den od 11:00 podle časového pásma Europe/Prague.
- Následující den v 9:59 se vlákna uzavřou a archivují.
- Jídla se načítají ze souboru `data/prirazeni-jidel.json`.
- Záznamy s hodnotou `meal_id: null` se přeskočí.
- Pokud je určitý den jídlo vynecháno, pro dané datum se žádné vlákno nevytvoří.

## Přiřazování jídel

Každou středu ve 14:00 podle časového pásma Europe/Prague spustí GitHub Actions proces, který stáhne aktuální jídelníček do souboru `jidelnicek.json` a následně spustí skript `priprav_prirazeni.py`. Časové pásmo je nastavené přímo u plánované události, takže GitHub automaticky zohlední přechod mezi zimním a letním časem.

Tento skript odstraní z `data/prirazeni-jidel.json` položky starší než dnešní datum a doplní chybějící jídla. U jídla, jehož název nebo alternativní název odpovídá položce v `data/jidla.json` (bez ohledu na velikost písmen a diakritiku), automaticky nastaví příslušné `meal_id`. Existující ručně vyplněné `meal_id` zachová; jídla bez shody je stále nutné přiřadit ručně. Výjimkou jsou názvy `Oběd 1`, `Oběd 2` a `Oběd 3`, které nahradí názvem z nově staženého jídelníčku.

Příklad nového záznamu:

```json
{
  "datum": "25.11.2026",
  "variant": "O1",
  "nazev": "Název jídla z jídelníčku",
  "meal_id": null
}
```

Správný identifikátor jídla z databáze `data/jidla.json` je nutné doplnit ručně:

```json
{
  "datum": "25.11.2026",
  "variant": "O1",
  "nazev": "Název jídla z jídelníčku",
  "meal_id": 13
}
```

## Supabase

1. Vytvořte projekt na adrese https://supabase.com.
2. V editoru SQL spusťte databázové migrace v pořadí:
   - `supabase/migrations/20261122_discord_reviews.sql`,
   - `supabase/migrations/20261125_review_summary.sql`.
3. Pomocí kontrolního SQL dotazu ověřte existenci následujících tabulek:
   - `review_posts`,
   - `pending_reviews`,
   - `approved_reviews`.
4. Nastavte pravidla RLS tak, aby tabulka `approved_reviews` umožňovala veřejné čtení schválených recenzí.
5. Klíč `service_role` používejte výhradně v Discord botovi.

### Konfigurace frontendu

Do souboru `js/reviews-config.js` vložte následující konfiguraci:

```javascript
window.REVIEW_CONFIG = {
    supabaseUrl: "https://VASE-PROJEKT.supabase.co",
    supabasePublishableKey: "VASE-PUBLISHABLE-KLIC",
    discordInviteUrl: "https://discord.gg/VAZE-POZVANKA"
};
```

Veřejný klíč (Publishable Key) může být součástí frontendového kódu. Tajný klíč `service_role` se do frontendu nikdy nesmí dostat.

## Discord aplikace

1. Vytvořte novou aplikaci na adrese https://discord.com/developers/applications.
2. Přidejte do aplikace bota a zkopírujte jeho token.
3. V generátoru OAuth2 URL povolte následující oprávnění:
   - `bot`,
   - `applications.commands`.
4. Přidejte bota na požadovaný Discord server.
5. Na serveru vytvořte:
   - fórum s názvem `Recenze jídla`,
   - textový kanál pro moderátory,
   - roli určenou moderátorům.
6. Botovi udělte následující oprávnění:
   - View Channels,
   - Send Messages,
   - Manage Channels,
   - Manage Threads,
   - Lock Threads,
   - Use Application Commands.

## Discord bot

Adresář `bot` vyžaduje Node.js ve verzi 20 nebo novější.

### Instalace závislostí

```bash
cd bot
npm install
```

### Spuštění bota

```bash
npm start
```

### Konfigurace hostingu

Na platformě Pella nebo jiném hostingu nastavte následující proměnné prostředí:

```text
DISCORD_TOKEN=<nový Discord bot token>
DISCORD_CLIENT_ID=<číselné Application ID>
DISCORD_GUILD_ID=<Server ID>
DISCORD_FORUM_ID=<Forum ID>
DISCORD_MODERATOR_ROLE_ID=<Moderator role ID>
DISCORD_MODERATION_CHANNEL_ID=<Moderator channel ID>
DISCORD_REVIEW_INVITE_URL=
SUPABASE_URL=https://VASE-PROJEKT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role secret>
PRIRAZENI_URL=https://raw.githubusercontent.com/Amaroun13/jidelna-db/main/data/prirazeni-jidel.json
AUTO_REVIEWS_ENABLED=true
```

Proměnná `DISCORD_CLIENT_ID` obsahuje pouze číselné Application ID. Nesmí do ní být vložena celá OAuth URL včetně parametrů `permissions` a `scope`.

## Node.js a WebSocket

Projekt využívá klienta Supabase Realtime. Pro kompatibilitu s Node.js 20 je v souboru `bot/package.json` upravena závislost `ws`, kterou bot také explicitně používá.

Po každé úpravě závislostí je nutné spustit:

```bash
npm install
```

## Hosting Pella

Pella je jednou z možností, jak zajistit nepřetržitý provoz Discord bota (24/7).

Postup nasazení:

1. Vytvořte novou instanci Node.js.
2. Nepoužívejte Docker.
3. Nahrajte archiv ZIP obsahující následující soubory v kořenovém adresáři:
   - `package.json`,
   - `index.js`,
   - `src/index.js`.
4. Jako spouštěcí příkaz nastavte:

   ```text
   npm start
   ```

5. Nastavte všechny potřebné proměnné prostředí.
6. Restartujte instanci.

Do archivu se nesmí nahrávat soubory `.env`, adresář `node_modules` ani žádné tajné klíče.

## GitHub Actions

Používaný workflow:

`.github/workflows/weekly-menu.yml`

Každou středu ve 14:00 podle časového pásma Europe/Prague se automaticky spustí proces, který stáhne aktuální jídelníček a aktualizuje soubor `data/prirazeni-jidel.json`. Starší položky se při aktualizaci odstraní. Časové pásmo Europe/Prague automaticky zohledňuje zimní a letní čas.

Pro správné fungování workflow je nutné zajistit:

- povolené GitHub Actions,
- přístup workflow k lokálnímu repozitáři bez nutnosti dalších tajných přístupových údajů,
- oprávnění `contents: write`.

V nastavení repozitáře přejděte do:

**Settings → Actions → General**

V části **Workflow permissions** povolte:

`Read and write permissions`.

## Zabezpečení

- Token Discord bota se nikdy nesmí ukládat do veřejného GitHub repozitáře.
- Klíč Supabase `service_role` se nesmí dostat do frontendového JavaScriptu.
- Veřejný klíč (Publishable Key) lze bezpečně použít ve frontendu za předpokladu správně nastavených pravidel RLS.
- Integrace Microsoft Entra ani školního přihlašování nebyla do tohoto řešení prostřednictvím Discordu implementována.
- Jeden Discord účet může mít pro každé jídlo schválenou maximálně jednu recenzi.
- Každá recenze musí být před zveřejněním schválena moderátorem.
- Neúplné a zamítnuté recenze se na GitHub Pages nezobrazují.

## Kontroly po nasazení

Po dokončení nasazení je nutné ověřit následující funkce:

1. Konzole platformy Pella zobrazuje zprávu `Bot běží jako ...`.
2. Příkazy `/otevrit-jidlo` a `/zavrit-jidlo` jsou na Discordu dostupné.
3. Bot dokáže vytvořit příspěvek ve fóru.
4. Tlačítko pro napsání recenze správně otevře modální formulář.
5. Moderátorský kanál obdrží odeslanou recenzi.
6. Po schválení se recenze uloží do tabulky `approved_reviews`.
7. Stránka příslušného jídla zobrazí průměrné hodnocení, datum schválení recenzí a umožní jejich řazení podle hodnocení nebo data. Recenze se načítají po deseti a další lze zobrazit tlačítkem.

## Řešení problémů se spuštěním bota

Pokud se bota nepodaří spustit, zkontrolujte následující:

- Zda je Discord bot správně přidán na server.
- Zda má bot potřebná oprávnění ke správě kanálů a vláken.
- Zda jsou všechny identifikátory (ID) zadány správně a obsahují pouze číselné hodnoty.
- Zda je `SUPABASE_URL` zadána bez části `/rest/v1`.
- Zda je `SUPABASE_SERVICE_ROLE_KEY` správný a obsahuje platný tajný klíč.
- Zda byla databázová migrace v Supabase úspěšně provedena.
- Zda má bot přístup k tabulce `review_posts`.
- Zda je adresa `PRIRAZENI_URL` dostupná a odkazuje na soubor uložený v aktuálním commitu repozitáře.

## Plánovaná vylepšení

Do budoucna se počítá s následujícími úpravami a rozšířeními projektu:

- Vylepšení celkového designu webu a jeho responzivního zobrazení.
- Vytvoření loga JidelnaDB.
- Barevné rozlišení otevřených a uzavřených vláken ve fóru.
- Doplnění piktogramů jídel a sjednocení stylu fotografií.
- Vytváření vlastních ilustrací jednotlivých témat jídel.
- Administrátorský přehled pro moderátory.
- Automatická detekce a odstraňování chybných nebo spamových recenzí.
- Historický přehled a statistiky hodnocení.
- Podpora tmavého režimu.