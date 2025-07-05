import { exec } from 'child_process';
import fs from 'fs';
import puppeteer from 'puppeteer';
import path from 'path';
import url from 'url';

// Get __dirname in ES module context
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const urlArg = process.argv[2];

  if (!urlArg) {
    console.error("❌ No URL provided as argument");
    process.exit(1);
  }

  let reviews = [];
  let platform = '';

  try {
    if (urlArg.includes('amazon')) {
      platform = 'amazon';
      reviews = await scrapeAmazonReviews(urlArg);
    } else if (urlArg.includes('flipkart')) {
      platform = 'flipkart';
      reviews = await scrapeFlipkartReviews(urlArg);
    } else {
      console.error("❌ Unsupported URL. Only Amazon or Flipkart supported.");
      process.exit(1);
    }

    // Save reviews.json to the same folder as this script
    const reviewData = { [platform]: reviews };
    const reviewPath = path.join(__dirname, 'reviews.json');
    fs.writeFileSync(reviewPath, JSON.stringify(reviewData, null, 2), { encoding: 'utf8' });

    // Run Python sentiment analysis script
    const pythonScriptPath = path.join(__dirname, '2.py');
    exec(`python "${pythonScriptPath}"`, (error, stdout, stderr) => {
      if (error) {
        console.error("❌ Error running sentiment analysis:", stderr || error.message);
        process.exit(1);
      }
      try {
        const result = JSON.parse(stdout);
        console.log(JSON.stringify(result)); // Output for parent process
      } catch (e) {
        console.error("❌ Error parsing Python output:", e);
        process.exit(1);
      }
    });

  } catch (err) {
    console.error("❌ Scraping failed:", err);
    process.exit(1);
  }
})();

// --- Amazon scraping ---
async function scrapeAmazonReviews(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });

  let reviews = [];
  let hasNextPage = true;
  const maxPages = 5;
  let currentPage = 1;

  while (hasNextPage && currentPage <= maxPages) {
    const pageReviews = await page.evaluate(() => {
      const reviewElements = document.querySelectorAll('span[data-hook="review-body"] span');
      return Array.from(reviewElements)
        .map(el => el.innerText.trim())
        .filter(text => text !== 'Read more');
    });

    reviews = reviews.concat(pageReviews);

    const nextButton = await page.$('li.a-last > a');
    if (nextButton && currentPage < maxPages) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        nextButton.click()
      ]);
      currentPage++;
    } else {
      hasNextPage = false;
    }
  }

  await browser.close();
  return reviews;
}

// --- Flipkart scraping ---
async function scrapeFlipkartReviews(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });

  const reviewsLink = await page.$('a[href*="/product-reviews/"]');
  if (reviewsLink) {
    const reviewsUrl = await page.evaluate(el => el.href, reviewsLink);
    await page.goto(reviewsUrl, { waitUntil: 'networkidle2' });
  }

  let reviews = [];
  let hasNextPage = true;
  const maxPages = 5;
  let currentPage = 1;

  while (hasNextPage && currentPage <= maxPages) {
    const pageReviews = await page.evaluate(() => {
      const reviewElements = document.querySelectorAll(
  'div.ZmyHeo div div, div.cPHDOP.col-12-12'
);
      return Array.from(reviewElements)
        .map(el => el.innerText.trim())
        .filter(text => text && text !== 'READ MORE');
    });

    reviews = reviews.concat(pageReviews);

    const nextButton = await page.$('a._1LKTO3');
    if (nextButton && currentPage < maxPages) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        nextButton.click()
      ]);
      await page.waitForSelector('div.ZmyHeo div div', { timeout: 5000 }).catch(() => {
        hasNextPage = false;
      });
      currentPage++;
    } else {
      hasNextPage = false;
    }
  }

  await browser.close();
  return reviews;
}
