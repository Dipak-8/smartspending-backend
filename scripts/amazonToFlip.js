import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fuzzball from 'fuzzball';

puppeteer.use(StealthPlugin());

const stopwords = new Set(['with', 'and', 'for', 'in', 'of', 'the', 'a', 'an', 'to', 'on', 'at']);

function getTitleWords(title) {
  if (!title) return [];
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(word => !stopwords.has(word) && word.length > 1);
}

function shortenName(title) {
  const words = title.split(' ').slice(0, 8).join(' ');
  return words.length > 50 ? words.substring(0, 50) + '...' : words;
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeAmazon(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(2000);

    const title = await page.$eval('#productTitle', el => el.textContent.trim()).catch(() => null);
    if (!title) throw new Error('Amazon title not found');

    let price = await page.$eval('.a-price-whole', el => el.textContent.trim().replace(/,/g, '')).catch(() => null);
    if (!price) {
      price = await page.$eval('#sns-base-price', el => el.textContent.trim().replace(/,/g, '')).catch(() => null);
    }

    price = price ? parseInt(price) : null;
    if (!price) throw new Error('Amazon price not found');

    const imageUrl = await page.$eval('#landingImage', el => el.getAttribute('src')).catch(() => null);

    return { title, price, shortTitle: shortenName(title), imageUrl};
  } catch (error) {
    console.error(`Error scraping Amazon: ${error.message}`);
    return null;
  }
}

function extractFeatures(title) {
  const lower = title.toLowerCase();
  return {
    brand: (lower.match(/\b(hp|dell|lenovo|asus|acer|msi|apple|samsung|infinix|motorola|lg|whirlpool|mi|realme|boat|oneplus)\b/) || [])[0] || '',
    processor: (lower.match(/\b(i3|i5|i7|i9|ryzen\s?\d|m1|m2)\b/) || [])[0] || '',
    ram: (lower.match(/(\d+)\s?gb\s?(ram)?/) || [])[1] || '',
    storage: (lower.match(/(\d+)\s?(gb|tb)\s?(ssd|hdd)?/) || [])[1] || '',
    raw: title
  };
}

async function searchFlipkart(page, amazonTitle, amazonPrice) {
  try {
    const searchQuery = encodeURIComponent(amazonTitle);
    const searchUrl = `https://www.flipkart.com/search?q=${searchQuery}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(2000);

    const products = await page.$$eval('a[href*="/p/itm"]', elements =>
      elements.map(el => {
        const title = el.querySelector('div.KzDlHZ, a.s1Q9rs, div._4rR01T')?.textContent.trim() || '';
        const price = el.querySelector('div.Nx9bqj, div._30jeq3')?.textContent.trim().replace(/[^0-9]/g, '') || null;
        const url = el.getAttribute('href') ? `https://www.flipkart.com${el.getAttribute('href')}` : '';
        return { title, price: price ? parseInt(price) : null, url };
      })
    );

    const amazonFeatures = extractFeatures(amazonTitle);
    let bestMatch = null;
    let highestScore = 0;
    const priceThreshold = Math.max(5000, amazonPrice * 0.1);

    for (const product of products) {
      if (!product.title || !product.price) continue;

      const flipFeatures = extractFeatures(product.title);
      const fuzzyScore = fuzzball.token_sort_ratio(amazonTitle, product.title);

      let matchScore = fuzzyScore;

      if (flipFeatures.brand && flipFeatures.brand === amazonFeatures.brand) matchScore += 10;
      if (flipFeatures.processor && flipFeatures.processor === amazonFeatures.processor) matchScore += 5;
      if (flipFeatures.ram && flipFeatures.ram === amazonFeatures.ram) matchScore += 5;
      if (flipFeatures.storage && flipFeatures.storage === amazonFeatures.storage) matchScore += 5;

      const priceDiff = Math.abs(product.price - amazonPrice);
      if (priceDiff <= priceThreshold && matchScore > highestScore) {
        highestScore = matchScore;
        bestMatch = product;
      }
    }

    if (!bestMatch) {
      return { title: amazonTitle, price: 'Not found', shortTitle: shortenName(amazonTitle) };
    }

    return {
      title: bestMatch.title,
      price: `₹${bestMatch.price}`,
      shortTitle: shortenName(bestMatch.title),
      url: bestMatch.url
    };
  } catch (error) {
    console.error(`Error searching Flipkart: ${error.message}`);
    return { title: amazonTitle, price: 'Not found', shortTitle: shortenName(amazonTitle) };
  }
}

async function comparePrices(amazonUrl) {

  // OLD working code
  // const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  // Newly added line
  const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

  try {
    const amazonData = await scrapeAmazon(page, amazonUrl);
    if (amazonData) {
      console.log(`🛍️ Product: ${amazonData.title}`);
      if (amazonData.imageUrl) console.log(`🖼️ Amazon Image: ${amazonData.imageUrl}`);
      console.log(`🔶 Amazon Price: ₹${amazonData.price}`);
      const flipkartMatch = await searchFlipkart(page, amazonData.shortTitle, amazonData.price);
      console.log(`🔷 Flipkart Price: ${flipkartMatch.price}`);
      if (flipkartMatch.url) {
        console.log(`🔗 Flipkart Link: ${flipkartMatch.url}`);
      }
    } else {
      console.log('❌ Failed to scrape Amazon product.');
    }
  } finally {
    await browser.close();
  }
}

const amazonUrl = process.argv[2];
if (!amazonUrl) {
  console.error('Please provide an Amazon URL as an argument');
  process.exit(1);
}

comparePrices(amazonUrl).catch(error => {
  console.error('Main error:', error.message);
  process.exit(1);
});