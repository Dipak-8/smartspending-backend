// import express from 'express';
// import dotenv from 'dotenv';
// import cors from 'cors';
// import { exec } from 'child_process';

// dotenv.config();

// const app = express();
// const PORT = process.env.PORT || 8000;

// // Middleware
// app.use(express.json());
// app.use(cors({ 
//   origin: process.env.FRONTEND_URL || "http://localhost:5173", 
//   credentials: true 
// }));

// // app.use(session({
// //   secret: process.env.SESSION_SECRET || 'your_session_secret',
// //   resave: false,
// //   saveUninitialized: false,
// //   cookie: {
// //     secure: process.env.NODE_ENV === 'production',
// //     maxAge: 24 * 60 * 60 * 1000
// //   }
// // }));

// // 🧠 Helper to run Python script and parse JSON output
// const runScript = (cmd) =>
//   new Promise((resolve, reject) => {
//     exec(cmd, { maxBuffer: 1024 * 1000 }, (err, stdout, stderr) => {
//       if (err) return reject(stderr || err.message);
//       try {
//         resolve(JSON.parse(stdout));
//       } catch (e) {
//         reject("Invalid JSON");
//       }
//     });
//   });

// // 📦 Compare Route
// app.post('/compare', async (req, res) => {
//   const { url } = req.body;
//   if (!url) return res.status(400).json({ error: 'No URL provided' });

//   const command = url.includes('flipkart.com')
//     ? `node scripts/flipkartToAmaz.js "${url}"`
//     : url.includes('amazon.in')
//     ? `node scripts/amazonToFlip.js "${url}"`
//     : null;

//   if (!command) return res.status(400).json({ error: 'Invalid URL' });

//   try {
//     console.log("🚀 Starting compare");
//     console.log("Command ----> ", command);

//     // const [flipAmazonOutput, chartData] = await Promise.all([
//     //   new Promise((resolve, reject) => {
//     //     exec(command, { maxBuffer: 1024 * 1000 }, (err, stdout) => {
//     //       if (err) return reject(err.message);
//     //       resolve(stdout);
//     //     });
//     //   }),
//     //   runScript(`echo "${url}" | python scripts/pricehistory_scraper.py`)
//     // ]);

//     // console.log("✅ Price comparison + chart data fetched");






//     //First: Run the comparison script (Flipkart ↔ Amazon)
//   const flipAmazonOutput = await new Promise((resolve, reject) => {
//     exec(command, { maxBuffer: 1024 * 1000 }, (err, stdout) => {
//       if (err) return reject(err.message);
//       resolve(stdout);
//     });
//   });

//   console.log("✅ Comparison result fetched");
//   console.log(flipAmazonOutput);

//   // Second: Run the Python chart scraper
//   const chartData = await runScript(`echo "${url}" | python scripts/pricehistory_scraper.py`);
//   console.log("✅ Chart data fetched");

//   // Now return the combined result
  
//   if (!chartData.data || !Array.isArray(chartData.data) || chartData.data.some(item => !item.y || isNaN(item.y))) {
//     console.error("Invalid chart data:", chartData);
//     return res.status(400).json({ error: "Invalid price history data" });
//   }






//     // ... existing parsing
    
//     const productName = flipAmazonOutput.match(/🛍️ Product: (.*)/)?.[1] || 'Not found';

//     const amazon = {
//       price: flipAmazonOutput.match(/🔶 Amazon Price: (.*)/)?.[1] || 'Not found',
//       url: flipAmazonOutput.match(/🔗 Amazon Link: (.*)/)?.[1] || null
//     };

//     const flipkart = {
//       price: flipAmazonOutput.match(/🔷 Flipkart Price: (.*)/)?.[1] || 'Not found',
//       url: flipAmazonOutput.match(/🔗 Flipkart Link: (.*)/)?.[1] || null
//     };

//     if (url.includes('flipkart')) flipkart.url = url;
//     if (url.includes('amazon')) amazon.url = url;

    
//     const amazonImage = flipAmazonOutput.match(/🖼️ Amazon Image: (.*)/)?.[1] || null;
//     const flipkartImage = flipAmazonOutput.match(/🖼️ Flipkart Image: (.*)/)?.[1] || null;
//     const imageUrl = url.includes('flipkart') ? flipkartImage : amazonImage;


//     const priceStr = url.includes('amazon')
//     ? amazon.price
//     : url.includes('flipkart')
//     ? flipkart.price
//     : null;

//     const currentPrice = priceStr ? parseInt(priceStr.replace(/[^\d]/g, '')) : null;

//     const modifiedChartData = {
//       ...chartData,
//       data: [...chartData.data, { x: new Date().toISOString().split('T')[0], y: currentPrice }]
//     };
    


//     const input = {
//       priceHistory: modifiedChartData.data || [],
//       currentPrice: currentPrice
//     };

//     const modelInput = JSON.stringify(input, null, 2);

//     const pythonOutput = await new Promise((resolve, reject) => {
//       const pythonProcess = exec(
//         `python scripts/prediction/predict.py`,
//         { maxBuffer: 1024 * 1000 },
//         (err, stdout, stderr) => {
//           if (err) {
//             console.error("❌ Prediction error:", stderr);
//             return reject(stderr || err.message);
//           }
//           resolve(stdout);
//         }
//       );

      

//       pythonProcess.stdin.write(modelInput);
//       pythonProcess.stdin.end();
//     });

//     let predictionOutput;
//     try {
//       const jsonStart = pythonOutput.indexOf('{');
//       const jsonEnd = pythonOutput.lastIndexOf('}') + 1;
//       const jsonString = pythonOutput.slice(jsonStart, jsonEnd);

//       if (jsonStart === -1 || jsonEnd === -1) {
//         throw new Error('No JSON found in Python output');
//       }

//       const result = JSON.parse(jsonString);

//       if (!result.success) {
//         throw new Error(result.error || 'Prediction failed');
//       }

//       predictionOutput = result.predictions;
//     } catch (e) {
//       console.error("Failed to extract predictions:", e);
//       predictionOutput = [];
//     }


//     console.log("✅ Prediction completed");

//     // SENTIMENT ANALYSIS
//     const sentiment = await new Promise((resolve, reject) => {
//       exec(`node scripts/sentiment/1.js "${url}"`, { maxBuffer: 1024 * 1000 }, (err, stdout, stderr) => {
//         if (err) {
//           console.error('❌ Sentiment analysis error:', stderr || err.message);
//           return resolve(null);
//         }
//         try {
//           console.log("🧪 Raw sentiment stdout:\n", stdout);
//           const sentimentResult = JSON.parse(stdout);
//           console.log("🎯 Sentiment Analysis Result:", sentimentResult);
//           resolve(sentimentResult);
//         } catch (e) {
//           console.error('⚠️ Failed to parse sentiment JSON:', e);
//           console.log("📤 Raw stdout causing error:", stdout);
//           resolve(null);
//         }
//       });
//     });

//     console.log("✅ Sentiment analysis done");

//     return res.json({ 
//       productName, 
//       imageUrl, 
//       amazon, 
//       flipkart, 
//       chart: modifiedChartData, 
//       prediction: predictionOutput, 
//       sentiment 
//     });

//   } catch (err) {
//     console.error("❌ Error in /compare route:", err);
//     return res.status(500).json({ error: 'Internal error' });
//   }
// });


// // Auth + Product Routes
// app.use(passport.initialize());
// app.use(passport.session());

// app.use('/api/auth', authRoutes);
// app.use('/api/products', productRoutes);

// // DB + Server Start
// connectDB().then(() => {
//   app.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
//   });
// });


import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { exec } from 'child_process';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(express.json());
app.use(cors({ 
  origin: process.env.FRONTEND_URL || "http://localhost:5173", 
  credentials: true 
}));

// 🧠 Helper to run Python script and parse JSON output
const runScript = (cmd) =>
  new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1000 }, (err, stdout, stderr) => {
      if (err) return reject(stderr || err.message);
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject("Invalid JSON");
      }
    });
  });

// 📦 Compare Route
app.post('/compare', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  const command = url.includes('flipkart.com')
    ? `node scripts/flipkartToAmaz.js "${url}"`
    : url.includes('amazon.in')
    ? `node scripts/amazonToFlip.js "${url}"`
    : null;

  if (!command) return res.status(400).json({ error: 'Invalid URL' });

  try {
    console.log("🚀 Starting compare");
    console.log("Command ----> ", command);

    const flipAmazonOutput = await new Promise((resolve, reject) => {
      exec(command, { maxBuffer: 1024 * 1000 }, (err, stdout) => {
        if (err) return reject(err.message);
        resolve(stdout);
      });
    });

    console.log("✅ Comparison result fetched");
    console.log(flipAmazonOutput);

    const chartData = await runScript(`echo "${url}" | python scripts/pricehistory_scraper.py`);
    console.log("✅ Chart data fetched");

    if (!chartData.data || !Array.isArray(chartData.data) || chartData.data.some(item => !item.y || isNaN(item.y))) {
      console.error("Invalid chart data:", chartData);
      return res.status(400).json({ error: "Invalid price history data" });
    }

    const productName = flipAmazonOutput.match(/🛍️ Product: (.*)/)?.[1] || 'Not found';

    const amazon = {
      price: flipAmazonOutput.match(/🔶 Amazon Price: (.*)/)?.[1] || 'Not found',
      url: flipAmazonOutput.match(/🔗 Amazon Link: (.*)/)?.[1] || null
    };

    const flipkart = {
      price: flipAmazonOutput.match(/🔷 Flipkart Price: (.*)/)?.[1] || 'Not found',
      url: flipAmazonOutput.match(/🔗 Flipkart Link: (.*)/)?.[1] || null
    };

    if (url.includes('flipkart')) flipkart.url = url;
    if (url.includes('amazon')) amazon.url = url;

    const amazonImage = flipAmazonOutput.match(/🖼️ Amazon Image: (.*)/)?.[1] || null;
    const flipkartImage = flipAmazonOutput.match(/🖼️ Flipkart Image: (.*)/)?.[1] || null;
    const imageUrl = url.includes('flipkart') ? flipkartImage : amazonImage;

    const priceStr = url.includes('amazon')
      ? amazon.price
      : url.includes('flipkart')
      ? flipkart.price
      : null;

    const currentPrice = priceStr ? parseInt(priceStr.replace(/[^\d]/g, '')) : null;

    const modifiedChartData = {
      ...chartData,
      data: [...chartData.data, { x: new Date().toISOString().split('T')[0], y: currentPrice }]
    };

    const input = {
      priceHistory: modifiedChartData.data || [],
      currentPrice: currentPrice
    };

    const modelInput = JSON.stringify(input, null, 2);

    const pythonOutput = await new Promise((resolve, reject) => {
      const pythonProcess = exec(
        `python scripts/prediction/predict.py`,
        { maxBuffer: 1024 * 1000 },
        (err, stdout, stderr) => {
          if (err) {
            console.error("❌ Prediction error:", stderr);
            return reject(stderr || err.message);
          }
          resolve(stdout);
        }
      );

      pythonProcess.stdin.write(modelInput);
      pythonProcess.stdin.end();
    });

    let predictionOutput;
    try {
      const jsonStart = pythonOutput.indexOf('{');
      const jsonEnd = pythonOutput.lastIndexOf('}') + 1;
      const jsonString = pythonOutput.slice(jsonStart, jsonEnd);

      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('No JSON found in Python output');
      }

      const result = JSON.parse(jsonString);

      if (!result.success) {
        throw new Error(result.error || 'Prediction failed');
      }

      predictionOutput = result.predictions;
    } catch (e) {
      console.error("Failed to extract predictions:", e);
      predictionOutput = [];
    }

    console.log("✅ Prediction completed");

    const sentiment = await new Promise((resolve, reject) => {
      exec(`node scripts/sentiment/1.js "${url}"`, { maxBuffer: 1024 * 1000 }, (err, stdout, stderr) => {
        if (err) {
          console.error('❌ Sentiment analysis error:', stderr || err.message);
          return resolve(null);
        }
        try {
          console.log("🧪 Raw sentiment stdout:\n", stdout);
          const sentimentResult = JSON.parse(stdout);
          console.log("🎯 Sentiment Analysis Result:", sentimentResult);
          resolve(sentimentResult);
        } catch (e) {
          console.error('⚠️ Failed to parse sentiment JSON:', e);
          console.log("📤 Raw stdout causing error:", stdout);
          resolve(null);
        }
      });
    });

    console.log("✅ Sentiment analysis done");

    return res.json({ 
      productName, 
      imageUrl, 
      amazon, 
      flipkart, 
      chart: modifiedChartData, 
      prediction: predictionOutput, 
      sentiment 
    });

  } catch (err) {
    console.error("❌ Error in /compare route:", err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// DB + Server Start
// Removed connectDB as it's usually part of auth/user logic — re-add if your app still uses DB
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});













































