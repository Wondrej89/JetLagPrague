import type { Page } from '@playwright/test';

export async function openPublishedLayers(page: Page) {
  await page.goto('http://127.0.0.1:4175/JetLagPrague/?role=hunter');
  await page.getByTestId('game-map-tools').getByRole('button', { name: 'Vrstvy', exact: true }).click();
  return page.getByRole('region', { name: 'Vrstvy mapy' });
}
