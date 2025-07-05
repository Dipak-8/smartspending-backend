import puppeteer from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeFlipkart(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(2000);

    const title = await page.$eval('span[class*="Z-Ez"], h1', el => el.textContent.trim()).catch(() => null);
    const priceText = await page.$eval('div[class*="Nx9bqj"], div[class*="_30jeq3"]', el => el.textContent.trim()).catch(() => null);
    const price = priceText ? parseInt(priceText.replace(/[^0-9]/g, '')) : null;

    if (!title || !price) throw new Error('Flipkart title or price not found');

    // const imageUrl = await page.$eval('div._4WELSP._6lpKCl img', img => img.getAttribute('src')).catch(() => null);
    const imageUrl = await page.evaluate(() =>
      (document.querySelector('div._4WELSP._6lpKCl img') || document.querySelector('img._53J4C-.utBuJY'))?.getAttribute('src') || null
    );
    


    return { title, price, shortTitle: title.split(' ').slice(0, 10).join(' ').substring(0, 60), imageUrl };
  } catch (error) {
    console.error(`Flipkart scraping error: ${error.message}`);
    return null;
  }
}

async function searchAmazon(page, flipkartTitle, flipkartPrice) {
  try {
    // Original search query logic
    const cleanTitle = flipkartTitle
      .replace(/[\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      .replace(/With\s+MS\s+Office|-\s*\d+\.\d+\s?Kg/gi, '')
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 1)
      .slice(0, 10)
      .join(' ');

    const searchQuery = encodeURIComponent(cleanTitle);
    console.log('Amazon search query:', searchQuery);

    await page.goto(`https://www.amazon.in/s?k=${searchQuery}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Check for CAPTCHA
    const isCaptcha = await page.$('input#captchacharacters') !== null;
    if (isCaptcha) {
      console.log('CAPTCHA detected on Amazon');
      await page.screenshot({ path: 'amazon_captcha.png' });
      return { title: flipkartTitle, price: 'Not found', shortTitle: flipkartTitle.split(' ').slice(0, 10).join(' ').substring(0, 60) };
    }

    await page.waitForSelector('div[data-component-type="s-search-result"]', { visible: true, timeout: 30000 }).catch(() => console.log('Product items not found'));
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, 1000));
      await delay(1000);
    }

    const products = await page.$$eval('div[data-component-type="s-search-result"]', items =>
      items.map(item => {
        const titleEl = item.querySelector('h2 span');
        const priceEl = item.querySelector('.a-price .a-offscreen');
        const linkEl = item.querySelector('h2 a.a-link-normal');
        const asin = item.getAttribute('data-asin') || '';

        const title = titleEl ? titleEl.textContent.trim() : '';
        const priceText = priceEl ? priceEl.textContent.replace(/[^\d]/g, '') : '';
        const price = priceText && !isNaN(parseInt(priceText)) ? parseInt(priceText) : 0;
        let extractedAsin = asin;

        // Fallback ASIN extraction from href
        if (!asin && linkEl && linkEl.href) {
          const match = linkEl.href.match(/\/dp\/([A-Z0-9]{10})/);
          if (match) extractedAsin = match[1];
        }

        let url = '';
        if (extractedAsin && /^[A-Z0-9]{10}$/.test(extractedAsin)) {
          url = `https://www.amazon.in/dp/${extractedAsin}`;
        }

        console.log('Product found:', { title, price, asin: extractedAsin, url }); // Debug log
        return { title, price, url, asin: extractedAsin };
      }).filter(p => p.title && p.price > 0)
    );

    if (products.length === 0) {
      console.log('No valid products found');
      await page.screenshot({ path: 'amazon_no_results.png' });
      return { title: flipkartTitle, price: 'Not found', shortTitle: flipkartTitle.split(' ').slice(0, 10).join(' ').substring(0, 60) };
    }

    let bestMatch = null;
    let maxSimilarity = 0;

    for (const product of products) {
      const words1 = flipkartTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const words2 = product.title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const commonWords = words1.filter(word => words2.includes(word));
      const similarity = (commonWords.length / Math.max(words1.length, words2.length)) * 100;
      if (similarity > maxSimilarity && Math.abs(product.price - flipkartPrice) <= Math.max(3000, flipkartPrice * 0.2)) {
        maxSimilarity = similarity;
        bestMatch = product;
      }
    }

    if (!bestMatch) {
      console.log('No matching product found');
      return { title: flipkartTitle, price: 'Not found', shortTitle: flipkartTitle.split(' ').slice(0, 10).join(' ').substring(0, 60) };
    }

    return {
      title: bestMatch.title,
      price: `₹${bestMatch.price.toLocaleString('en-IN')}`,
      shortTitle: bestMatch.title.split(' ').slice(0, 10).join(' ').substring(0, 60),
      url: bestMatch.url || 'Not found'
    };
  } catch (error) {
    console.error(`Amazon search error: ${error.message}`);
    await page.screenshot({ path: 'amazon_search_error.png' });
    return { title: flipkartTitle, price: 'Not found', shortTitle: flipkartTitle.split(' ').slice(0, 10).join(' ').substring(0, 60) };
  }
}

async function comparePrices(flipkartUrl) {

  // OLD working code
  // const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'], timeout: 60000 });

  // Newly added line
  const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
  timeout: 60000
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

  try {
    const flipkartData = await scrapeFlipkart(page, flipkartUrl);
    if (flipkartData) {
      console.log(`\n🛍️ Product: ${flipkartData.title}`);
      if (flipkartData.imageUrl) console.log(`🖼️ Flipkart Image: ${flipkartData.imageUrl}`);
      console.log(`🔷 Flipkart Price: ₹${flipkartData.price.toLocaleString('en-IN')}`);
      const amazonMatch = await searchAmazon(page, flipkartData.title, flipkartData.price);
      console.log(`🔶 Amazon Price: ${amazonMatch.price}`);
      console.log(`🔗 Amazon Link: ${amazonMatch.url}`);
    } else {
      console.log('❌ Failed to scrape Flipkart product.');
    }
  } catch (error) {
    console.error('Main error:', error.message);
  } finally {
    await browser.close().catch(() => console.log('Browser close failed'));
  }
}

const flipkartUrl = process.argv[2] || 'https://www.flipkart.com/motorola-edge-50-fusion-marshmallow-blue-128-gb/p/itmf88eea5799a27?pid=MOBGXTYZEZSZQE7W&lid=LSTMOBGXTYZEZSZQE7WIBXLBI&marketplace=FLIPKART&q=motorola+50+fusion&store=tyy%2F4io&srno=s_1_2&otracker=search&otracker1=search&fm=search-autosuggest&iid=fe730c1f-ba77-4765-849e-9aae95bdb524.MOBGXTYZEZSZQE7W.SEARCH&ppt=sp&ppn=sp&ssid=59gubfsp4w0000001744649107021&qH=3ab80acfca51afff';
if (!flipkartUrl) {
  console.error('Please provide a Flipkart URL as an argument');
  process.exit(1);
}

comparePrices(flipkartUrl).catch(err => {
  console.error('Main error:', err.message);
  process.exit(1);
});