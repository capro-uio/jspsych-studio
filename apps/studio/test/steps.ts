import type { Page } from "playwright";

/** Steps are added from the menu on a gap, so placement and kind are one choice. */
export async function addStep(page: Page, slot: string, kind: string) {
  await page.getByTestId(slot).click();
  await page.getByTestId(`${slot}-${kind}`).click();
}

export async function addTrial(page: Page, plugin: string, slot: string) {
  await addStep(page, slot, "trial");
  await page.getByTestId("trial-plugin").selectOption(plugin);
}
