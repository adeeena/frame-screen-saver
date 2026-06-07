const express = require("express");
const config = require("../config");
const path = require("path");
const fs = require("fs-extra");
const sharp = require("sharp");
const app = express();
const PORT = process.env.PORT || 3004;

app.get("/api/image", async (req, res) => {
  const { type, id, width, height, noCache } = req.query;

  if (!type || !id) {
    return res
      .status(400)
      .json({ message: "Missing 'type' or 'id' query parameters." });
  }

  const useCache = !noCache || noCache === "false";
  const cacheKey = `${new URLSearchParams(req.query).toString()}.jpg`;
  const cachePath = path.join(config.images.cacheBaseUrl, cacheKey);

  try {
    // 1. Check for a cached image first (if caching is enabled)
    if (useCache) {
      if (await fs.pathExists(cachePath)) {
        console.log(`Cache hit for: ${cacheKey}`);
        return res.sendFile(cachePath);
      }
      console.log(`Cache miss for: ${cacheKey}`);
    }

    let sourcePath;

    // 2. Handle the 'type' to determine where to get the image from
    switch (type) {
      default: // Default case is to read from the local filesystem
        const sourceDir = path.join(config.images.baseUrl, type);
        const files = await fs.readdir(sourceDir);
        // Find a file that starts with the given ID, ignoring extension
        const filename = files.find((f) => f.startsWith(id + "."));
        if (!filename) {
          return res.status(404).json({ message: "Image not found." });
        }
        sourcePath = path.join(sourceDir, filename);
        break;
      // In the future, you could add other cases, e.g., fetching from a URL
      // case 'url':
      //   ...
      //   break;
    }

    let imageProcessor = sharp(sourcePath);

    // 3. Resize and crop the image if width and height are provided
    const parsedWidth = parseInt(width, 10);
    const parsedHeight = parseInt(height, 10);

    if (!isNaN(parsedWidth) && !isNaN(parsedHeight)) {
      console.log(
        `Resizing image to ${parsedWidth}x${parsedHeight} with cover fit.`
      );
      imageProcessor = imageProcessor.resize({
        width: parsedWidth,
        height: parsedHeight,
        fit: "cover", // Keeps aspect ratio, covers dimensions, crops excess
        position: "center",
      });
    }

    const imageBuffer = await imageProcessor.jpeg({ quality: 90 }).toBuffer();

    // 4. Save to cache if enabled
    if (useCache) {
      try {
        await fs.ensureDir(config.images.cacheBaseUrl);
        await fs.writeFile(cachePath, imageBuffer);
        console.log(`Saved to cache: ${cacheKey}`);
      } catch (cacheError) {
        // Log the error but don't fail the request, as serving the image is the priority
        console.error("Failed to write to cache:", cacheError);
      }
    }

    // 5. Serve the processed image
    res.set("Content-Type", "image/jpeg");
    res.send(imageBuffer);
  } catch (error) {
    console.error("Error in Image Service:", error);
    if (error.code === "ENOENT") {
      return res.status(404).json({ message: "Image source not found." });
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.listen(PORT, () => {
  console.log(`Image Service is running on port ${PORT}`);
  // Ensure cache directory exists on startup
  fs.ensureDir(config.images.cacheBaseUrl).catch((err) => {
    console.error("Could not create cache directory on startup:", err);
  });
});
