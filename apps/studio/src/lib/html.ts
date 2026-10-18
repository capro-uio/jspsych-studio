// What the formatted editor offers, and the text formatting a stimulus commonly carries. Anything
// else is edited as HTML instead, where it is text and never put into the builder's page.
const FORMATTING_ELEMENTS = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "sub",
  "sup",
  "small",
  "mark",
  "br",
  "hr",
  "p",
  "div",
  "span",
  "font",
  "center",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);

// `name` and `id` are left out on purpose: a named element shadows the page's own `document`
// methods, which the editor and the rest of the builder call. `class` would borrow the builder's
// own styles.
const FORMATTING_ATTRIBUTES = new Set(["style", "align", "color", "size", "face", "title"]);

// Inline styles cannot run script, but they can fetch from elsewhere or lay the text over the
// builder itself.
const UNSAFE_STYLE = /url\s*\(|@import|expression\s*\(|position\s*:/i;

function isFormatting(element: Element) {
  return (
    FORMATTING_ELEMENTS.has(element.localName) &&
    element.namespaceURI === "http://www.w3.org/1999/xhtml" &&
    [...element.attributes].every(
      (attribute) =>
        FORMATTING_ATTRIBUTES.has(attribute.name) &&
        !(attribute.name === "style" && UNSAFE_STYLE.test(attribute.value)),
    )
  );
}

/**
 * The markup as nodes the formatted editor can show, or null when it holds anything else. It is
 * parsed into a template, which runs nothing and loads nothing, by the same parser and with the
 * same scripting setting as the live page, and the editor inserts these very nodes rather than
 * parsing the text a second time. Checking one parse and inserting another is how markup such as
 * `<noscript>` slips past a check.
 */
export function formattedFragment(html: string): DocumentFragment | null {
  const template = document.createElement("template");
  template.innerHTML = html;
  const elements = template.content.querySelectorAll("*");
  return [...elements].every(isFormatting) ? template.content : null;
}
