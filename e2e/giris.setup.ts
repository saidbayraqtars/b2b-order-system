import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test as setup } from "@playwright/test";
import { ACCOUNTS } from "../scripts/screens.mjs";
import { HESAPLAR, oturum } from "./yardimci";

// Her gösterim hesabı bir kez giriş yapar, çerez dosyaya yazılır; testler o
// dosyayla açılır. Her testte yeniden giriş hem yavaş hem de giriş hız
// sınırına (b2b-security) takılırdı.
//
// Giriş formu gerçekten dolduruluyor, çerez elle üretilmiyor: jeton biçimi
// Auth.js'in iç meselesi ve taklit edilirse kimlik doğrulama değişince testler
// sessizce yanlış ekranı sınar.

for (const hesap of HESAPLAR) {
  setup(`${hesap} giriş yapar`, async ({ page }) => {
    const { email, password } = ACCOUNTS[hesap];
    await page.goto("/login");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    // İki adımlı doğrulama açık bir gösterim hesabıyla sınanamaz.
    await expect(page.locator("#totp")).toHaveCount(0);

    const file = oturum(hesap);
    mkdirSync(dirname(file), { recursive: true });
    await page.context().storageState({ path: file });
  });
}
