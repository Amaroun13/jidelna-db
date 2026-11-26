const themeStorageKey = "jidelna-db-theme";
const savedTheme = localStorage.getItem(themeStorageKey);
const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const initialTheme = savedTheme === "light" || savedTheme === "dark"
    ? savedTheme
    : systemPrefersDark ? "dark" : "light";

document.documentElement.dataset.theme = initialTheme;

document.addEventListener("DOMContentLoaded", () => {
    const themeToggle = document.getElementById("theme-toggle");

    function updateToggle() {
        const isDark = document.documentElement.dataset.theme === "dark";
        const label = isDark ? "Zapnout světlý režim" : "Zapnout tmavý režim";
        themeToggle.setAttribute("aria-label", label);
        themeToggle.setAttribute("aria-pressed", String(isDark));
        themeToggle.title = label;
    }

    updateToggle();
    themeToggle.addEventListener("click", () => {
        const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        localStorage.setItem(themeStorageKey, theme);
        document.documentElement.dataset.theme = theme;
        updateToggle();
    });
});
