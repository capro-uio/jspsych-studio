import { mount } from "svelte";
import { applyTheme } from "./lib/theme.svelte.ts";
import App from "./App.svelte";
import "./app.css";

applyTheme();

export default mount(App, { target: document.querySelector("#app")! });
