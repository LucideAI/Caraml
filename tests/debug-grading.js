const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  
  await page.goto('http://localhost:5173/learn-ocaml');
  
  // Wait for the app to be ready
  await page.waitForTimeout(2000);
  
  // Check if we need to connect
  if (await page.locator('button:has-text("Connect")').count() > 0) {
    if (await page.locator('button:has-text("Connect Your Account")').count() > 0) {
        await page.click('button:has-text("Connect Your Account")');
    }
    await page.fill('input[placeholder*="https://"]', 'https://pf2.informatique.u-paris.fr');
    await page.fill('input[type="password"]', 'O1O-GOX-YEF-VWZ');
    await page.click('button:has-text("Connect")');
    await page.waitForTimeout(2000);
  }
  
  // Click on "Union find"
  await page.click('text="Union find"');
  await page.waitForTimeout(2000);
  
  // Click the Grade button
  await page.click('button:has-text("Grade")');
  console.log('Clicked Grade button');
  
  // Wait for the report panel to appear and update
  await page.waitForTimeout(10000); // Wait 10s for grading
  
  const reportText = await page.locator('.learnocaml-exo-report').textContent().catch(() => 'No report panel found');
  console.log('FINAL REPORT TEXT:', reportText);
  
  await browser.close();
})();
