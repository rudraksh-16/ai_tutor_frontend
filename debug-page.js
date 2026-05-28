import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText));
  
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  } catch (err) {
    console.error('Failed to goto page:', err.message);
  }
  
  await browser.close();
})();
