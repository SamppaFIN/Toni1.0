// E2E: "Kysy LLM:ltä" -nappi vetolapulla (tiketti #38)
//
// OpenRouter-kutsu katkaistaan page.routella. Oikean rajapinnan kutsuminen
// testissä maksaisi rahaa, vaatisi avaimen CI:hin ja tekisi testistä
// epädeterministisen — mallin vastaus ei ole sama kahdesti.

import { test, expect, Page } from '@playwright/test';
import { useFootball, resetState, useFixtureSnapshot } from '../helpers.js';

const API = 'https://openrouter.ai/api/v1/chat/completions';

async function setKey(page: Page, key = 'sk-or-v1-testiavain') {
  await page.click('.tab[data-tab="admin"]');
  await page.fill('#admin-llm-key', key);
  await page.click('#admin-content button:has-text("Tallenna avain")');
  await page.click('.tab[data-tab="slip"]');
}

/** Onnistunut vastaus OpenRouterin muodossa */
async function stubSuccess(page: Page, content = '## Kierroksen yleiskuva\n\nMarkkina on **tiukka**.\n\n- Ei selviä value-kohteita') {
  await page.route(API, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4.5',
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 },
      }),
    })
  );
}

test.describe('Kysy LLM:ltä', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
  });

  test('paneeli näkyy vetolapulla myös ilman vetoja', async ({ page }) => {
    await page.click('.tab[data-tab="slip"]');
    await expect(page.locator('#llm-content')).toContainText('Kysy LLM:ltä');
  });

  test('ilman avainta nappia ei tarjota vaan neuvotaan Adminiin', async ({ page }) => {
    await page.click('.tab[data-tab="slip"]');
    await expect(page.locator('#llm-content')).toContainText('OpenRouter-avain puuttuu');
    await expect(page.locator('#llm-content button:has-text("Kysy LLM:ltä analyysi")')).toHaveCount(0);
  });

  test('avaimen tallennus Adminissa tuo napin esiin', async ({ page }) => {
    await setKey(page);
    await expect(page.locator('#llm-content')).toContainText('avain asetettu');
    await expect(page.locator('#llm-content button:has-text("Kysy LLM:ltä analyysi")')).toBeVisible();
  });

  test('Admin varoittaa että avain on luettavissa selaimesta', async ({ page }) => {
    await page.click('.tab[data-tab="admin"]');
    await expect(page.locator('#admin-content')).toContainText('luettavissa kenelle tahansa');
  });

  test('avaimen syöttökenttä on salasanatyyppinen', async ({ page }) => {
    await page.click('.tab[data-tab="admin"]');
    await expect(page.locator('#admin-llm-key')).toHaveAttribute('type', 'password');
  });

  test('analyysi näytetään ja mallin nimi kerrotaan', async ({ page }) => {
    await stubSuccess(page);
    await setKey(page);
    await page.click('#llm-content button:has-text("Kysy LLM:ltä analyysi")');

    await expect(page.locator('#llm-content')).toContainText('Kierroksen yleiskuva');
    await expect(page.locator('#llm-content')).toContainText('anthropic/claude-sonnet-4.5');
    await expect(page.locator('#llm-content')).toContainText('1500 tokenia');
    // Markdown-lihavointi renderöityy
    await expect(page.locator('#llm-content b:has-text("tiukka")')).toBeVisible();
  });

  test('vastaus muistetaan sivun päivityksen yli', async ({ page }) => {
    await stubSuccess(page);
    await setKey(page);
    await page.click('#llm-content button:has-text("Kysy LLM:ltä analyysi")');
    await expect(page.locator('#llm-content')).toContainText('Kierroksen yleiskuva');

    await page.reload({ waitUntil: 'networkidle' });
    await page.click('.tab[data-tab="slip"]');
    await expect(page.locator('#llm-content')).toContainText('Kierroksen yleiskuva');
  });

  test('prompt sisältää kierroksen datan ja omat vedot', async ({ page }) => {
    let sent = '';
    await page.route(API, async (route) => {
      sent = route.request().postData() ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ model: 'test', choices: [{ message: { content: 'ok' } }] }),
      });
    });

    // Aseta yksi veto ennen kysymistä
    await page.locator('#round-games .bk-odds').first().click();
    const popup = page.locator('[id^="fbetpop-"]:visible');
    await popup.locator('input[type="number"]').fill('10');
    await popup.locator('button:has-text("Veto")').click();

    await setKey(page);
    await page.click('#llm-content button:has-text("Kysy LLM:ltä analyysi")');
    await expect(page.locator('#llm-content')).toContainText('🤖 test');

    const body = JSON.parse(sent);
    const prompt = body.messages[1].content;
    expect(prompt).toContain('Parhaat kertoimet');
    expect(prompt).toContain('Omat avoimet vetoni');
    // Tunnusluvut ennen kertoimia — malli ei saa nähdä hintoja ensin
    expect(prompt.indexOf('Oman mallin todennäköisyydet')).toBeLessThan(prompt.indexOf('Markkina (devigattu)'));
    // Järjestelmäviesti ohjaa skeptisyyteen
    expect(body.messages[0].content).toContain('Markkina on useimmiten oikeassa');
  });

  test('avain lähetetään Authorization-otsakkeessa', async ({ page }) => {
    let auth = '';
    await page.route(API, async (route) => {
      auth = route.request().headers()['authorization'] ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ model: 'test', choices: [{ message: { content: 'ok' } }] }),
      });
    });

    await setKey(page, 'sk-or-v1-abc123');
    await page.click('#llm-content button:has-text("Kysy LLM:ltä analyysi")');
    await expect(page.locator('#llm-content')).toContainText('🤖 test');
    expect(auth).toBe('Bearer sk-or-v1-abc123');
  });

  test('401 kerrotaan ymmärrettävästi eikä raakana virheenä', async ({ page }) => {
    await page.route(API, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'No auth credentials found' } }),
      })
    );

    await setKey(page);
    await page.click('#llm-content button:has-text("Kysy LLM:ltä analyysi")');

    await expect(page.locator('#llm-content')).toContainText('Analyysi epäonnistui');
    await expect(page.locator('#llm-content')).toContainText('Tarkista OpenRouter-avain');
  });

  test('tyhjä vastaus tunnistetaan virheeksi', async ({ page }) => {
    await page.route(API, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ model: 'test', choices: [] }),
      })
    );

    await setKey(page);
    await page.click('#llm-content button:has-text("Kysy LLM:ltä analyysi")');
    await expect(page.locator('#llm-content')).toContainText('tyhjän vastauksen');
  });

  test('avaimen poisto palauttaa varoituksen', async ({ page }) => {
    await setKey(page);
    await expect(page.locator('#llm-content')).toContainText('avain asetettu');

    await page.click('.tab[data-tab="admin"]');
    await page.click('#admin-content button:has-text("Poista")');
    await page.click('.tab[data-tab="slip"]');

    await expect(page.locator('#llm-content')).toContainText('OpenRouter-avain puuttuu');
  });

  test('mallin voi vaihtaa ja valinta menee kutsuun', async ({ page }) => {
    let model = '';
    await page.route(API, async (route) => {
      model = JSON.parse(route.request().postData() ?? '{}').model;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ model: 'test', choices: [{ message: { content: 'ok' } }] }),
      });
    });

    await page.click('.tab[data-tab="admin"]');
    await page.fill('#admin-llm-key', 'sk-or-v1-testiavain');
    await page.click('#admin-content button:has-text("Tallenna avain")');
    await page.selectOption('#admin-llm-model', 'openai/gpt-4o-mini');
    await page.click('.tab[data-tab="slip"]');
    await page.click('#llm-content button:has-text("Kysy LLM:ltä analyysi")');

    await expect(page.locator('#llm-content')).toContainText('🤖 test');
    expect(model).toBe('openai/gpt-4o-mini');
  });

  test('paneeli on piilossa jääkiekkotilassa', async ({ page }) => {
    await page.click('.tab[data-tab="admin"]');
    await page.click('#admin-content button:has-text("Jääkiekko")');
    await page.click('.tab[data-tab="slip"]');
    await expect(page.locator('#llm-content')).toBeEmpty();
  });
});

test.describe('Kysy LLM:ltä — per ottelu kortilla', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
  });

  test('jokaisella ottelukortilla on oma Kysy LLM:ltä -osio', async ({ page }) => {
    const card = page.locator('#round-games .card').nth(2);
    await expect(card.locator('button:has-text("Kysy LLM:ltä")')).toBeVisible();
  });

  test('ilman avainta kortin osio ohjaa Adminiin, ei näytä nappia', async ({ page }) => {
    const card = page.locator('#round-games .card').nth(2);
    await card.locator('button:has-text("Kysy LLM:ltä")').click();
    await expect(card).toContainText('Lisää OpenRouter-avain');
    await expect(card.locator('button:has-text("tästä ottelusta")')).toHaveCount(0);
  });

  test('kortin oma analyysi koskee vain sitä yhtä ottelua', async ({ page }) => {
    let sent = '';
    await page.route(API, async (route) => {
      sent = route.request().postData() ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ model: 'test', choices: [{ message: { content: 'Yhden ottelun analyysi' } }] }),
      });
    });

    await setKey(page);
    await page.click('.tab[data-tab="round"]');
    const card = page.locator('#round-games .card').nth(2);

    await card.locator('button:has-text("Kysy LLM:ltä")').click();
    await card.locator('button:has-text("tästä ottelusta")').click();
    await expect(card).toContainText('Yhden ottelun analyysi');

    const prompt = JSON.parse(sent).messages[1].content;
    // Vain yksi "## Ottelu" -otsikko — ei koko kierrosta
    expect((prompt.match(/## Ottelu/g) ?? []).length).toBe(1);
  });

  test('kortin oma analyysi ei sotke round-wide-paneelin tilaa Vetolapulla', async ({ page }) => {
    await page.route(API, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ model: 'test', choices: [{ message: { content: 'Korttikohtainen vastaus' } }] }),
      })
    );

    await setKey(page);
    await page.click('.tab[data-tab="round"]');
    const card = page.locator('#round-games .card').nth(2);
    await card.locator('button:has-text("Kysy LLM:ltä")').click();
    await card.locator('button:has-text("tästä ottelusta")').click();
    await expect(card).toContainText('Korttikohtainen vastaus');

    await page.click('.tab[data-tab="slip"]');
    await expect(page.locator('#llm-content')).not.toContainText('Korttikohtainen vastaus');
    await expect(page.locator('#llm-content button:has-text("Kysy LLM:ltä analyysi")')).toBeVisible();
  });

  test('kortin analyysi säilyy sivun päivityksen yli', async ({ page }) => {
    await page.route(API, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ model: 'test', choices: [{ message: { content: 'Säilyvä vastaus' } }] }),
      })
    );

    await setKey(page);
    await page.click('.tab[data-tab="round"]');
    const card = page.locator('#round-games .card').nth(2);
    await card.locator('button:has-text("Kysy LLM:ltä")').click();
    await card.locator('button:has-text("tästä ottelusta")').click();
    await expect(card).toContainText('Säilyvä vastaus');

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#round-games .card').nth(2).locator('button:has-text("Kysy LLM:ltä")').click();
    await expect(page.locator('#round-games .card').nth(2)).toContainText('Säilyvä vastaus');
  });

  test('osion voi piilottaa asetuksista', async ({ page }) => {
    await page.click('.tab[data-tab="admin"]');
    await page.click('#admin-content button:has-text("Kysy LLM:ltä (per ottelu)")');
    await page.click('.tab[data-tab="round"]');
    await expect(page.locator('#round-games .card').nth(2).locator('button:has-text("Kysy LLM:ltä")')).toHaveCount(0);
  });
});
