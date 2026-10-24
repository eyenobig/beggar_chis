import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { applyLocalePreference, getLocalePreference, i18n } from "./i18n";
import "./styles.css";

applyLocalePreference(getLocalePreference());
createApp(App).use(createPinia()).use(i18n).mount("#app");
