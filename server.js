const express = require("express");
const axios = require("axios");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// Simple in-memory cache to save API quota
const uvCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// ===================== LOCATIONS DATABASE =====================
const COUNTRIES = {
  india: { name: "India", lat: 20.5937, lng: 78.9629 },
  usa: { name: "USA", lat: 37.0902, lng: -95.7129 },
  uk: { name: "UK", lat: 55.3781, lng: -3.4360 },
  uae: { name: "UAE", lat: 23.4241, lng: 53.8478 },
  australia: { name: "Australia", lat: -25.2744, lng: 133.7751 },
  japan: { name: "Japan", lat: 36.2048, lng: 138.2529 },
  france: { name: "France", lat: 46.2276, lng: 2.2137 },
  singapore: { name: "Singapore", lat: 1.3521, lng: 103.8198 },
  canada: { name: "Canada", lat: 56.1304, lng: -106.3468 },
  germany: { name: "Germany", lat: 51.1657, lng: 10.4515 },
  brazil: { name: "Brazil", lat: -14.2350, lng: -51.9253 },
  southafrica: { name: "South Africa", lat: -30.5595, lng: 22.9375 },
  russia: { name: "Russia", lat: 61.5240, lng: 105.3188 },
  china: { name: "China", lat: 35.8617, lng: 104.1954 },
};


// Helper: classify UV index
function getUVData(uvIndex) {
  if (uvIndex <= 2) {
    return {
      level: "Low", color: "#22c55e", colorName: "green",
      message: "No sunscreen needed ☀️",
      description: "UV levels are minimal. You can enjoy the outdoors safely without sunscreen.",
      icon: "😎",
      tip: "A great day to be outside! No sun protection required.",
      mood: "calm",
      image: "/uv-low.png",
    };
  } else if (uvIndex <= 5) {
    return {
      level: "Moderate", color: "#eab308", colorName: "yellow",
      message: "Consider sunscreen 🧴",
      description: "UV levels are moderate. Fair-skinned people should consider wearing sunscreen.",
      icon: "🌤️",
      tip: "Wear sunglasses and use SPF 30+ if you'll be outside for extended periods.",
      mood: "normal",
      image: "/uv-moderate.png",
    };
  } else if (uvIndex <= 7) {
    return {
      level: "High", color: "#ef4444", colorName: "orange",
      message: "Apply sunscreen! 🧴🧴",
      description: "UV levels are high. Sunscreen is strongly recommended for everyone.",
      icon: "🔥",
      tip: "Apply SPF 30+ sunscreen, wear a hat, and seek shade between 10 AM – 4 PM.",
      mood: "sunny",
      image: "/uv-high.png",
    };
  } else if (uvIndex <= 10) {
    return {
      level: "Very High", color: "#ef4444", colorName: "red",
      message: "Apply sunscreen immediately! 🚨",
      description: "UV levels are very high. Unprotected skin can burn in minutes.",
      icon: "⚠️",
      tip: "Apply SPF 50+ generously. Avoid direct sun exposure during peak hours.",
      mood: "sunny",
      image: "/uv-high.png",
    };
  } else {
    return {
      level: "Extreme", color: "#ef4444", colorName: "purple",
      message: "Stay indoors if possible! 🛑",
      description: "UV levels are extreme. Take all precautions — burns can occur in under 5 minutes.",
      icon: "☢️",
      tip: "Stay indoors, or wear full-coverage clothing, SPF 50+, and UV-blocking sunglasses.",
      mood: "sunny",
      image: "/uv-high.png",
    };
  }
}

// Routes
app.get("/", async (req, res) => {
  try {
    const apiKey = process.env.OPENUV_API_KEY;

    if (!apiKey || apiKey === "your_api_key_here") {
      return res.render("index", {
        error: "API key not configured. Please add your OpenUV API key to the .env file.",
        uvData: null, cities: COUNTRIES, selectedCity: "india",
      });
    }

    const selectedCity = req.query.city || "india";
    const cityData = COUNTRIES[selectedCity];
    var lat = req.query.lat ? parseFloat(req.query.lat) : (cityData ? cityData.lat : 20.5937);
    var lng = req.query.lng ? parseFloat(req.query.lng) : (cityData ? cityData.lng : 78.9629);
    var locationName = req.query.name || (cityData ? cityData.name : "Custom Location");

    // 1. Check Cache First (save your daily limit!)
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = uvCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log(`📦 CACHE HIT: Reusing data for ${locationName}`);
      return res.render("index", { ...cached.data, cities: COUNTRIES, selectedCity: selectedCity });
    }

    console.log(`📡 [GET] Calling OpenUV API for: ${locationName} (${lat}, ${lng})`);

    const response = await axios.get("https://api.openuv.io/api/v1/uv", {
      params: { lat: lat, lng: lng },
      headers: {
        "x-access-token": apiKey,
        "Content-Type": "application/json",
      },
    });

    const result = response.data.result;
    console.log(`📥 API Response for ${locationName}:`, JSON.stringify(result, null, 2));
    const uvIndex = Math.round(result.uv * 10) / 10;
    console.log(`✅ API SUCCESS: Received UV Index ${uvIndex} for ${locationName}`);

    const uvMax = Math.round(result.uv_max * 10) / 10;
    const uvMaxTime = new Date(result.uv_max_time).toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
    });
    const uvTime = new Date(result.uv_time).toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
    });
    
    const ozone = result.ozone;
    const sunInfo = result.sun_info;

    const classification = getUVData(uvIndex);
    const maxClassification = getUVData(uvMax);
    const safeExposure = result.safe_exposure_time || {};

    const renderData = {
      error: null,
      cities: COUNTRIES,
      selectedCity: selectedCity,
      uvData: {
        current: uvIndex, max: uvMax, maxTime: uvMaxTime, fetchedAt: uvTime,
        classification, maxClassification, safeExposure,
        ozone: ozone, sunInfo: sunInfo,
        location: locationName, lat: lat, lng: lng,
        date: new Date().toLocaleDateString("en-IN", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
          timeZone: "Asia/Kolkata",
        }),
      },
    };

    // 2. Save to Cache
    uvCache.set(cacheKey, { timestamp: Date.now(), data: renderData });

    res.render("index", renderData);
  } catch (err) {
    if (err.response && err.response.status === 403) {
      console.error(`🛑 API ERROR: Daily Limit Reached (403). Showing fallback data.`);
    } else {
      console.error(`❌ API ERROR: ${err.message}. Showing fallback data for demo.`);
    }
 
    // Provide realistic location-aware simulation so the user sees a dynamic UI
    const hour = new Date().getHours() + (new Date().getMinutes() / 60);
    const absLat = Math.abs(lat);
    
    // Smart Simulation Logic:
    // 1. Latitude Factor: Closer to Equator (0) = Higher UV. Closer to Poles (90) = Lower UV.
    let latFactor = Math.max(0, 1 - (absLat / 70)); 
    
    // 2. Time Factor: Peak at 1 PM (13:00), low at night.
    let timeFactor = Math.max(0, Math.cos((hour - 13) * Math.PI / 12));
    
    // 3. Combine and add a bit of random "weather" variance
    let demoUV = (14 * latFactor * timeFactor) + (Math.random() * 0.8);
    demoUV = Math.round(Math.max(0, demoUV) * 10) / 10;
    
    let demoMaxUV = demoUV + 1.2 + (Math.random() * 2);
    demoMaxUV = Math.round(demoMaxUV * 10) / 10;

    const classification = getUVData(demoUV);
    const maxClassification = getUVData(demoMaxUV);

    res.render("index", {
      error: null,
      cities: COUNTRIES,
      selectedCity: req.query.city || "india",
      uvData: {
        current: demoUV, max: demoMaxUV, maxTime: "Peak Hour", fetchedAt: "Simulated ✅",
        classification, maxClassification,
        ozone: 300 + Math.round(Math.random() * 50),
        sunInfo: {
          sun_times: {
            sunrise: new Date(new Date().setHours(6, 0, 0, 0)).toISOString(),
            sunset: new Date(new Date().setHours(18, 30, 0, 0)).toISOString()
          },
          sun_position: {
            altitude: 0.8,
            azimuth: 1.5
          }
        },
        location: locationName,
        lat: lat, lng: lng,
        date: new Date().toLocaleDateString("en-IN", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
          timeZone: "Asia/Kolkata",
        }),
        safeExposure: { st1: 20, st2: 35, st3: 50, st4: 80, st5: 120, st6: 200 }
      },
    });
  }
});

// ===================== START SERVER =====================
const startServer = (port) => {
  const currentPort = Number(port);
  if (currentPort > 65535) {
    console.error("❌ No available ports found below 65536.");
    return;
  }

  const server = app.listen(currentPort, () => {
    console.log(`🌞 SunSavvy running at http://localhost:${currentPort}`);
  }).on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`⚠️ Port ${currentPort} is busy... trying ${currentPort + 1}...`);
      startServer(currentPort + 1);
    } else {
      console.error("❌ Server Error:", err.message);
    }
  });
};

startServer(PORT);
