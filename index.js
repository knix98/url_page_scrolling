const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const fluentFfmpeg = require('fluent-ffmpeg');

const app = express();
const port = 3000;

app.use(express.json());

// Easing function for smooth scrolling (easeInOut)
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

app.post('/generateVideo', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Missing URL in the request body' });
  }

  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle2' });

    const viewportHeight = 1080; // Adjust this to your desired viewport height

    // Get the page height
    const pageHeight = await page.evaluate(() => {
      // return (3 * document.body.scrollHeight) / 4;
      return document.body.scrollHeight / 2;
    });

    await page.setViewport({ width: 1920, height: viewportHeight });

    const durationInSeconds = 1;
    const frameRate = 20;
    const numFrames = durationInSeconds * frameRate;
    const numRepetitions = 4;
    const totalFrames = numFrames * numRepetitions;
    const imagePaths = [];

    let yOffset;
    let frameNumber = 0;
    for (let j = 0; j < numRepetitions; j++) {
      for (let i = 0; i < numFrames; i++) {
        // const filename = path.join(__dirname, `frames/frame-${j * numFrames + i}.png`);
        const filename = path.join(__dirname, `frames/frame-${frameNumber++}.png`);
        imagePaths.push(filename);

        const progress = easeInOut(i / numFrames); // Use the easing function

        // Calculate yOffset for the specific repetition
        yOffset = (j + progress) * (pageHeight / numRepetitions);

        // // Ensure scrolling stops at 3/5 of the page height
        // yOffset = Math.min(yOffset, (3 / 5) * pageHeight);

        await page.evaluate(yOffset => {
          window.scrollTo(0, yOffset);
        }, yOffset);

        // Capture only the visible portion
        await page.screenshot({ path: filename, clip: { x: 0, y: yOffset, width: 1920, height: viewportHeight } });
      }

      // Add a 1-second pause by capturing frames of the same screen
      const pauseDuration = frameRate; // 1 second pause
      for (let i = 0; i < pauseDuration; i++) {
        // const pauseFilename = path.join(__dirname, `frames/pause-${j}-${i}.png`);
        const pauseFilename = path.join(__dirname, `frames/frame-${frameNumber++}.png`);
        imagePaths.push(pauseFilename);

        await page.screenshot({ path: pauseFilename, clip: { x: 0, y: yOffset, width: 1920, height: viewportHeight } });
      }
    }

    await browser.close();

    const outputVideoPath = path.join(__dirname, 'output20.mp4');

    fluentFfmpeg()
      .input('frames/frame-%d.png')
      .inputFPS(frameRate)
      .output(outputVideoPath)
      .videoCodec('libx264')
      .outputFPS(frameRate)
      .on('error', async (err) => {
        console.error('Error:', err);
        res.status(500).json({ error: 'Video generation failed' });

        const unlinkAsync = promisify(fs.unlink);
        await Promise.all(imagePaths.map(imgPath => unlinkAsync(imgPath)));
      })
      .on('end', async () => {
        console.log(`Video generated at ${outputVideoPath}`);
        res.json({ videoPath: outputVideoPath });

        const unlinkAsync = promisify(fs.unlink);
        await Promise.all(imagePaths.map(imgPath => unlinkAsync(imgPath)));
      })
      .run();

    

    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: 'Video generation failed' });
    }
  });

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
