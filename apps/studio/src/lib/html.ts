// Elements that run or load code of their own when they are put into the page.
const ACTIVE_ELEMENTS = new Set(["script", "iframe", "frame", "object", "embed", "base", "meta"]);

// Attributes that can hold a URL, where a `javascript:` URL runs when it is followed or loaded.
const URL_ATTRIBUTES = new Set(["href", "src", "action", "formaction", "xlink:href", "data"]);

function isScriptUrl(value: string) {
  // Browsers ignore spaces and control characters inside the scheme.
  const visible = [...value].filter((character) => character.charCodeAt(0) > 0x20).join("");
  return /^javascript:/i.test(visible);
}

/**
 * Whether markup would run script once it is put into a live page, such as the editor's editable
 * surface. A participant's page runs it on purpose; the builder's own page must not. The markup is
 * read with DOMParser, whose documents never run scripts or load anything.
 */
export function runsScript(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  return [...document.querySelectorAll("*")].some(
    (element) =>
      ACTIVE_ELEMENTS.has(element.localName) ||
      element.localName === "svg" ||
      [...element.attributes].some(
        (attribute) =>
          attribute.name.startsWith("on") ||
          attribute.name === "srcdoc" ||
          (URL_ATTRIBUTES.has(attribute.name) && isScriptUrl(attribute.value)),
      ),
  );
}
