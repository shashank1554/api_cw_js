import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const executablePathPromise = chromium.executablePath();

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { batch_id = '3302' } = req.query;
  
  let browser = null;
  
  try {
    console.log('🚀 Launching browser...');
    
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await executablePathPromise,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    const networkResponses = [];
    const responseTasks = [];

    page.on('response', (response) => {
      const contentType = response.headers()['content-type'] || '';
      const responseUrl = response.url();

      if (!contentType.includes('application/json') || !responseUrl.includes('careerwill.com')) {
        return;
      }

      responseTasks.push(response.json().then((body) => {
        networkResponses.push({
          url: responseUrl,
          status: response.status(),
          body,
        });
      }).catch(() => {}));
    });
    
    // Stealth mode
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    });

    console.log('🌐 Bypassing Cloudflare...');
    await page.goto('https://web.careerwill.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for Cloudflare
    await page.waitForTimeout(5000);

    // Add auth cookies
    const cookies = [
      { name: 'token', value: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpYXQiOjE3NjU4MTM5ODcsImNvbiI6eyJpc0FkbWluIjpmYWxzZSwiYXVzZXIiOiIiLCJpZCI6Ik4xRXZTSFoxYW1aSWRYSjRiRlJvWkZaNWNHUTFRVDA5IiwiZmlyc3RfbmFtZSI6IkszUk5TR2s1ZWs4MWJETllXRmcyUmxCQ1lrSmtaejA5IiwiZW1haWwiOiJjUzlMZVVjMmJrczFTME5vVFZSd1VtdFNaa2hwZDNSdE1tRXhSbVZOTDNjdmMwZHRXak5XWm1wak5EMD0iLCJwaG9uZSI6ImQxTmplREpGVkdaWldVbFFhVkJLUm1ZMFdrcEpVVDA5IiwiYXZhdGFyIjoiIiwicmVmZXJyYWxfY29kZSI6ImFHVjBhVk5qSzBSQ2RuUnlURVJSUVdVME0xRllRVDA5IiwiZGV2aWNlX3R5cGUiOiJ3ZWIiLCJkZXZpY2VfdmVyc2lvbiI6IjE0My4wLjAuMCIsImRldmljZV9tb2RlbCI6IkNocm9tZUNETSIsInJlbW90ZV9hZGRyIjoiMjQwOTo0MGQyOjI4OmQyZTc6OGM0MzpmOTY2OjIxNjY6ODI3ZCJ9fQ.CDjX3zOhGmrMbu4YNgHQcE8-QGuR7k0uL9c4FwVYgn-OVutr6E83xI7eo2bXrDOCwMOlKifd82KAdsKzfct6qhA7lgtspzm8T1lVGXPrvrcW0aB99bfbZuPa4sx0VcUJvWoLOaA55ub-jY080jqsSFtw_iLW513kXhS1LaVqIH-DijWJDaCBg6oaAIUle2cXAfIbjtT8Iwv4Fl9V7qCuqAayyjmG2Csl7EN8xdFnNUD6fl9OZJGSMsQbsH-SYL_n0aBujbodqTRGG0baqCXR7X4WLViDlPMWvlLFsGb-kQrQA1S03u857tJDx9-HlPReSQN1uWn5hfO4gAbOw2nVGg', domain: '.careerwill.com', path: '/' },
      { name: 'interface', value: '1', domain: '.careerwill.com', path: '/' },
    ];

    await page.setCookie(...cookies);

    console.log('📚 Fetching batch data...');
    const courseUrl = `https://web.careerwill.com/course-details?batch_id=${batch_id}&view=Grid`;
    await page.goto(courseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(3000);
    await Promise.all(responseTasks);

    // Extract data
    const pageData = await page.evaluate(() => {
      const nextData = window.__NEXT_DATA__?.props?.pageProps || null;
      const links = [...document.querySelectorAll('a[href]')]
        .map((link) => ({ title: link.textContent.trim(), href: link.href }))
        .filter((link) => link.title || link.href);

      return {
        nextData,
        title: document.title,
        text: document.body.innerText,
        links,
      };
    });

    if (pageData.text || pageData.nextData || networkResponses.length) {
      console.log('✅ Data fetched successfully!');
      return res.status(200).json({
        success: true,
        data: {
          batchId: batch_id,
          title: pageData.title,
          pageProps: pageData.nextData,
          apiResponses: networkResponses,
          pageText: pageData.text,
          links: pageData.links,
        }
      });
    } else {
      return res.status(404).json({
        success: false,
        error: 'No data found'
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
