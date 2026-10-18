// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { formattedFragment } from "../src/lib/html.ts";

const serialized = (fragment: DocumentFragment | null) => {
  if (!fragment) return null;
  const holder = document.createElement("div");
  holder.append(fragment);
  return holder.innerHTML;
};

describe("formattedFragment", () => {
  it.each([
    "",
    "plain text",
    "<p>Press <b>f</b> or <strong>j</strong></p>",
    '<p style="color: red; font-size: 48px" align="center">big</p>',
    '<font size="7" color="#ff0000" face="serif">old</font>',
    "<ul><li>one</li><li><em>two</em></li></ul><h1>title</h1><br><hr>",
  ])("gives back formatting the editor can show: %j", (html) => {
    expect(serialized(formattedFragment(html))).toBe(html);
  });

  it.each([
    ["an element the editor does not offer", '<img src="face.png">'],
    ["a script", "<script>globalThis.ran = true</script>"],
    ["an event handler", '<p onclick="globalThis.ran = true">a</p>'],
    ["a link", '<a href="javascript:globalThis.ran = true">a</a>'],
    ["svg", "<svg><circle r='4'></circle></svg>"],
    ["noscript", '<noscript><p title="</noscript><img src=x onerror=x>"></noscript>'],
    ["a name, which shadows document methods", '<p name="createRange">a</p>'],
    ["an id, which does the same", '<p id="getSelection">a</p>'],
    ["a class, which borrows the builder's styles", '<p class="issue">a</p>'],
    ["a style that fetches", '<p style="background: url(https://example.com/x)">a</p>'],
    ["a style that imports", "<p style=\"@import 'x.css'\">a</p>"],
    ["a style that lays itself over the page", '<p style="position: fixed; inset: 0">a</p>'],
  ])("refuses %s", (_, html) => {
    expect(formattedFragment(html)).toBeNull();
  });

  it("refuses a formatting element nested inside one it does not offer", () => {
    expect(formattedFragment("<p><b>bold</b><video></video></p>")).toBeNull();
  });
});
