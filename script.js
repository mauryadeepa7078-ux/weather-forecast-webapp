/**
 * SkyCast AI - Core Logic
 * Modular Architecture for Weather Analytics & AI Chat
 */

// Configuration & State
const CONFIG = {
    WEATHER_API_KEY: 'YOUR_API_KEY_HERE', // User should replace this
    MOCK_MODE: true, // Set to false if API key is provided
    UNITS: localStorage.getItem('skycast-units') || 'metric',
    MAX_CHATS: 20
};

const state = {
    theme: localStorage.getItem('skycast-theme') || 'dark',
    currentCity: localStorage.getItem('skycast-last-city') || 'London',
    coords: { lat: 51.5074, lon: -0.1278 }, // Default to London
    weatherData: null,
    forecastData: null,
    chats: JSON.parse(localStorage.getItem('skycast-chats')) || [
        { id: 1, title: 'Welcome Chat', messages: [] }
    ],
    activeChatId: 1,
    favorites: JSON.parse(localStorage.getItem('skycast-favorites')) || [],
    comparisonCities: JSON.parse(localStorage.getItem('skycast-comparison')) || ['New York', 'Tokyo', 'Paris'],
    timezone: 'GMT',
    utcOffset: 0,
    ttsEnabled: true,
    currentUser: JSON.parse(localStorage.getItem('skycast-auth')) || null,
    lastCoords: JSON.parse(localStorage.getItem('skycast-last-coords')) || null
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    // Comparison
    document.getElementById('addCompareBtn').addEventListener('click', handleAddComparison);
    document.getElementById('compareSearch').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAddComparison();
    });
});

function initApp() {
    checkAuth();
    if (!state.currentUser) switchAuthForm('register');
    applyTheme();
    updateDateTime();
    setInterval(updateDateTime, 60000);
    // Auto-refresh weather every 10 minutes
    setInterval(() => {
        if (state.lastCoords) {
            fetchWeather(`${state.lastCoords.lat},${state.lastCoords.lon}`, true);
        } else {
            fetchWeather(state.currentCity);
        }
    }, 600000);
    
    // Lucide Icons
    lucide.createIcons();
    
    // Event Listeners
    setupEventListeners();
    
    // Initial Data Fetch
    updateUnitUI();
    if (state.lastCoords) {
        fetchWeather(`${state.lastCoords.lat},${state.lastCoords.lon}`, true);
    } else {
        fetchWeather(state.currentCity);
    }
    renderChatHistory();
    
    // Initial Chat UI
    switchChat(state.activeChatId);
}

// --- UI Logic ---
function setupEventListeners() {
    // Theme Toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.getAttribute('data-view');
            switchView(view);
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });

    // Search
    const searchInput = document.getElementById('citySearch');
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const city = searchInput.value.trim();
            if (city) {
                fetchWeather(city);
                document.getElementById('searchSuggestions').classList.add('hidden');
            }
        }
    });

    // GPS
    document.getElementById('gpsBtn').addEventListener('click', getGPSLocation);

    // Chat
    document.getElementById('sendChatBtn').addEventListener('click', handleSendMessage);
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Voice
    document.getElementById('voiceInputBtn').addEventListener('click', startVoiceRecognition);

    // Favorites Toggle
    document.getElementById('favToggleBtn').addEventListener('click', toggleFavorite);

    // Auth Actions
    document.getElementById('showRegister').addEventListener('click', (e) => { e.preventDefault(); switchAuthForm('register'); });
    document.getElementById('showLogin').addEventListener('click', (e) => { e.preventDefault(); switchAuthForm('login'); });
    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('registerBtn').addEventListener('click', handleRegister);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Chat Actions
    document.getElementById('newChatBtn').addEventListener('click', createNewChat);

    // Search Suggestions
    searchInput.addEventListener('input', debounce(handleSearchInput, 300));
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            document.getElementById('searchSuggestions').classList.add('hidden');
        }
    });

    // Units
    document.querySelectorAll('.unit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const unit = btn.getAttribute('data-unit');
            if (unit !== CONFIG.UNITS) {
                CONFIG.UNITS = unit;
                localStorage.setItem('skycast-units', unit);
                updateUnitUI();
                refreshCurrentView();
            }
        });
    });
}

function refreshCurrentView() {
    const activeView = document.querySelector('.view.active').id;
    fetchWeather(state.currentCity); // This covers dashboard
    
    if (activeView === 'analyticsView') renderAnalyticsCharts();
    if (activeView === 'comparisonView') renderComparison();
}

function updateUnitUI() {
    document.querySelectorAll('.unit-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-unit') === CONFIG.UNITS);
    });
    // Update all degree symbols in UI
    document.querySelectorAll('.unit').forEach(el => {
        el.textContent = CONFIG.UNITS === 'metric' ? '°C' : '°F';
    });
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    const icon = document.getElementById('themeIcon');
    icon.setAttribute('data-lucide', state.theme === 'dark' ? 'sun' : 'moon');
    lucide.createIcons();
}

function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('skycast-theme', state.theme);
    applyTheme();
}

async function reverseGeocode(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const data = await res.json();
        if (data.address) {
            const city = data.address.city || data.address.town || data.address.village || data.address.suburb || 'Unknown';
            const country = data.address.country;
            return `${city}, ${country}`;
        }
    } catch (e) {}
    return `Location (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
}

function hideSkeletons() {
    document.querySelectorAll('.card').forEach(c => c.classList.remove('skeleton'));
}

function showError(msg) {
    const toast = document.createElement('div');
    toast.className = 'error-toast glass';
    toast.innerHTML = `<i data-lucide="alert-circle"></i><span>${msg}</span>`;
    document.body.appendChild(toast);
    lucide.createIcons();
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`${viewId}View`)?.classList.add('active');
    
    if (viewId === 'map') initWeatherMap();
    if (viewId === 'analytics') renderAnalyticsCharts();
    if (viewId === 'comparison') renderComparison();
    if (viewId === 'favorites') renderFavorites();
}

function updateDateTime() {
    const now = new Date();
    // Use target location time
    const localTime = new Date(now.getTime() + (state.utcOffset * 1000));
    
    const optionsDate = { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' };
    const optionsTime = { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' };
    
    document.getElementById('currentDate').textContent = localTime.toLocaleDateString('en-US', optionsDate);
    document.getElementById('currentTime').textContent = localTime.toLocaleTimeString('en-US', optionsTime);
}

// --- Weather Service ---
async function fetchWeather(query, isCoords = false) {
    if (!query) return;

    // Auto-detect coordinates if the string matches "lat,lon" or "Location (lat, lon)"
    const coordMatch = query.match(/Location\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/i) || 
                       query.match(/^\s*([-\d.]+)\s*,\s*([-\d.]+)\s*$/);
    if (coordMatch) {
        query = `${coordMatch[1].trim()},${coordMatch[2].trim()}`;
        isCoords = true;
    }

    const cacheKey = `weather_${query}_${CONFIG.UNITS}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
        const { data, time, name } = JSON.parse(cached);
        if (Date.now() - time < 600000) { // 10 min cache
            state.weatherData = data;
            state.utcOffset = data.utc_offset_seconds;
            updateWeatherUI(data, name);
            renderForecast(data);
            renderCharts(data);
            return;
        }
    }

    showSkeletons();
    try {
        let lat, lon, name;
        if (isCoords) {
            [lat, lon] = query.split(',').map(Number);
            name = await reverseGeocode(lat, lon);
        } else {
            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
            const geoData = await geoRes.json();
            if (!geoData.results || geoData.results.length === 0) throw new Error(`Location "${query}" not found`);
            const city = geoData.results[0];
            lat = city.latitude;
            lon = city.longitude;
            name = `${city.name}${city.admin1 ? `, ${city.admin1}` : ''}, ${city.country}`;
        }

        state.coords = { lat, lon };
        state.lastCoords = { lat, lon };
        state.currentCity = name;
        localStorage.setItem('skycast-last-city', name);
        localStorage.setItem('skycast-last-coords', JSON.stringify({ lat, lon }));

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m,pressure_msl,uv_index,visibility&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=auto`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Weather data unavailable');
        const data = await response.json();

        state.weatherData = data;
        state.utcOffset = data.utc_offset_seconds;
        
        // Cache result
        sessionStorage.setItem(cacheKey, JSON.stringify({ data, time: Date.now(), name }));

        updateWeatherUI(data, name);
        renderForecast(data);
        renderCharts(data);
        updateAppBackground(data.current_weather.weathercode || data.current_weather.weather_code);
        
        // Update comparison and favorites if needed
        if (document.getElementById('comparisonView').classList.contains('active')) renderComparison();
        
    } catch (error) {
        showError(error.message);
    } finally {
        hideSkeletons();
    }
}

function updateWeatherUI(data, cityName) {
    const current = data.current_weather;
    const hourly = data.hourly;
    const daily = data.daily;
    const weatherCode = current.weathercode !== undefined ? current.weathercode : current.weather_code;

    document.getElementById('cityName').textContent = cityName;
    document.getElementById('weatherDesc').textContent = getWeatherDesc(weatherCode);
    
    let temp = current.temperature;
    if (CONFIG.UNITS === 'imperial') temp = (temp * 9/5) + 32;
    document.getElementById('mainTemp').textContent = Math.round(temp);
    
    let high = daily.temperature_2m_max[0];
    let low = daily.temperature_2m_min[0];
    if (CONFIG.UNITS === 'imperial') {
        high = (high * 9/5) + 32;
        low = (low * 9/5) + 32;
    }
    document.getElementById('tempHigh').textContent = Math.round(high);
    document.getElementById('tempLow').textContent = Math.round(low);
    
    const humidity = hourly.relative_humidity_2m[0];
    document.getElementById('humidityVal').textContent = `${humidity}%`;
    document.getElementById('humidityBar').style.width = `${humidity}%`;
    
    let windSpeed = current.windspeed;
    let windUnit = CONFIG.UNITS === 'metric' ? 'km/h' : 'mph';
    if (CONFIG.UNITS === 'imperial') windSpeed = windSpeed / 1.609; 
    document.getElementById('windVal').textContent = `${Math.round(windSpeed)} ${windUnit}`;
    document.getElementById('windDir').textContent = `Direction: ${current.winddirection}°`;
    
    document.getElementById('pressureVal').textContent = `${Math.round(hourly.pressure_msl[0])} hPa`;
    
    const uv = daily.uv_index_max[0];
    document.getElementById('uvVal').textContent = uv.toFixed(1);
    updateUVLevel(uv);

    const visibility = hourly.visibility[0] / 1000; // to km
    document.getElementById('visibilityVal').textContent = `${visibility.toFixed(1)} km`;
    document.getElementById('visibilityStatus').textContent = visibility > 5 ? 'Clear' : 'Low Visibility';
    
    document.getElementById('sunriseTime').textContent = formatTime(daily.sunrise[0], data.utc_offset_seconds);
    document.getElementById('sunsetTime').textContent = formatTime(daily.sunset[0], data.utc_offset_seconds);
    
    updateWeatherIcon(weatherCode);
    updateFavButtonState();
}

function getWeatherDesc(code) {
    const codes = {
        0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
        45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle',
        55: 'Dense drizzle', 56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
        61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
        66: 'Light freezing rain', 67: 'Heavy freezing rain',
        71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
        80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
        85: 'Slight snow showers', 86: 'Heavy snow showers',
        95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
    };
    return codes[code] || 'Unknown';
}

function formatTime(isoStr, offset) {
    const date = new Date(isoStr);
    const options = { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' };
    return date.toLocaleTimeString('en-US', options);
}

function updateUVLevel(uv) {
    const levelEl = document.getElementById('uvLevel');
    if (uv <= 2) { levelEl.textContent = 'Low'; levelEl.style.color = '#10b981'; }
    else if (uv <= 5) { levelEl.textContent = 'Moderate'; levelEl.style.color = '#f59e0b'; }
    else if (uv <= 7) { levelEl.textContent = 'High'; levelEl.style.color = '#f97316'; }
    else { levelEl.textContent = 'Very High'; levelEl.style.color = '#ef4444'; }
}

function updateWeatherIcon(code) {
    const iconContainer = document.getElementById('weatherIconLarge');
    let iconName = 'sun';
    
    if (code === 0) iconName = 'sun';
    else if (code <= 3) iconName = 'cloud';
    else if (code >= 51 && code <= 67) iconName = 'cloud-rain';
    else if (code >= 71 && code <= 77) iconName = 'snowflake';
    else if (code >= 80 && code <= 82) iconName = 'cloud-drizzle';
    else if (code >= 95) iconName = 'cloud-lightning';
    else iconName = 'cloud';
    
    iconContainer.innerHTML = `<i data-lucide="${iconName}" size="120"></i>`;
    lucide.createIcons();
}

function updateAppBackground(code) {
    const app = document.querySelector('.app-container');
    app.className = 'app-container'; // reset
    
    if (code === 0) app.classList.add('sunny');
    else if (code <= 3) app.classList.add('cloudy');
    else if (code >= 51 && code <= 67) app.classList.add('rainy');
    else if (code >= 71 && code <= 77) app.classList.add('snowy');
    else if (code >= 95) app.classList.add('stormy');
    else app.classList.add('cloudy');
}

function toggleFavorite() {
    const city = state.currentCity;
    const index = state.favorites.indexOf(city);
    
    if (index === -1) {
        state.favorites.push(city);
    } else {
        state.favorites.splice(index, 1);
    }
    
    localStorage.setItem('skycast-favorites', JSON.stringify(state.favorites));
    updateFavButtonState();
    if (document.getElementById('favoritesView').classList.contains('active')) renderFavorites();
}

function updateFavButtonState() {
    const btn = document.getElementById('favToggleBtn');
    if (!btn) return;
    const isFav = state.favorites.includes(state.currentCity);
    btn.classList.toggle('active', isFav);
    const icon = btn.querySelector('i') || btn.querySelector('svg');
    if (icon) icon.setAttribute('data-lucide', 'star');
    lucide.createIcons();
}

function renderFavorites() {
    const grid = document.getElementById('favoritesGrid');
    grid.innerHTML = '';
    
    if (state.favorites.length === 0) {
        grid.innerHTML = `
            <div class="empty-favorites" style="grid-column: 1/-1; text-align: center; padding: 4rem;">
                <i data-lucide="star" size="48" style="color: var(--text-muted); margin-bottom: 1rem;"></i>
                <p style="color: var(--text-muted);">You haven't added any favorites yet.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    state.favorites.forEach(city => {
        const card = document.createElement('div');
        card.className = 'fav-card glass';
        card.onclick = () => {
            fetchWeather(city);
            switchView('dashboard');
            document.querySelectorAll('.nav-item').forEach(i => {
                i.classList.remove('active');
                if (i.getAttribute('data-view') === 'dashboard') i.classList.add('active');
            });
        };
        
        card.innerHTML = `
            <div class="fav-info">
                <span class="fav-name" style="font-weight: 600; font-size: 1.1rem;">${city}</span>
                <span style="color: var(--text-muted); font-size: 0.8rem;">Click to view</span>
            </div>
            <button class="remove-fav" onclick="event.stopPropagation(); removeFavorite('${city}')">
                <i data-lucide="x" size="14"></i>
            </button>
        `;
        grid.appendChild(card);
    });
    lucide.createIcons();
}

function removeFavorite(city) {
    state.favorites = state.favorites.filter(c => c !== city);
    localStorage.setItem('skycast-favorites', JSON.stringify(state.favorites));
    renderFavorites();
    updateFavButtonState();
}

function getGPSLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude, longitude } = pos.coords;
            fetchWeather(`${latitude},${longitude}`, true);
        }, () => showError("Geolocation failed. Please enable location access."));
    } else {
        showError("Geolocation is not supported by this browser.");
    }
}

// --- Chart Logic ---
let tempChart = null;
function renderCharts(data) {
    const ctx = document.getElementById('tempChart').getContext('2d');
    
    const hourly = data.hourly;
    const now = new Date();
    const currentHour = now.getHours();
    
    // Find index for current hour in hourly data
    const startIndex = hourly.time.findIndex(t => new Date(t).getHours() === currentHour);
    const sliceIndex = startIndex !== -1 ? startIndex : 0;

    const labels = hourly.time.slice(sliceIndex, sliceIndex + 24).map(t => {
        const d = new Date(t);
        return d.getHours() + ":00";
    });
    
    let temps = hourly.temperature_2m.slice(sliceIndex, sliceIndex + 24);
    
    if (CONFIG.UNITS === 'imperial') {
        temps = temps.map(t => (t * 9/5) + 32);
    }

    if (tempChart) tempChart.destroy();

    tempChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Temperature',
                data: temps,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#3b82f6',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, border: { display: false }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, border: { display: false }, ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }
            }
        }
    });
}

// --- Analytics Charts ---
let analyticsCharts = {};

function renderAnalyticsCharts() {
    const data = state.weatherData;
    if (!data) return;

    const hourly = data.hourly;
    const labels = hourly.time.slice(0, 24).map(t => new Date(t).getHours() + ":00");

    // 1. Hourly Temp Large
    let temps = hourly.temperature_2m.slice(0, 24);
    if (CONFIG.UNITS === 'imperial') temps = temps.map(t => (t * 9/5) + 32);
    createChart('hourlyTempChartLarge', 'line', labels, temps, '#3b82f6', 'Temperature');
    
    // 2. Rain Probability
    createChart('rainChart', 'bar', labels, hourly.precipitation_probability.slice(0, 24), '#60a5fa', 'Rain Probability %');

    // 3. Wind Speed
    let windSpeeds = hourly.wind_speed_10m.slice(0, 24);
    if (CONFIG.UNITS === 'imperial') windSpeeds = windSpeeds.map(s => s / 1.609);
    createChart('windChart', 'line', labels, windSpeeds, '#f43f5e', 'Wind Speed');

    // 4. Humidity
    createChart('humidityChart', 'line', labels, hourly.relative_humidity_2m.slice(0, 24), '#10b981', 'Humidity %');
}

function createChart(id, type, labels, data, color, label) {
    const ctx = document.getElementById(id).getContext('2d');
    if (analyticsCharts[id]) analyticsCharts[id].destroy();

    analyticsCharts[id] = new Chart(ctx, {
        type: type,
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                borderColor: color,
                backgroundColor: color + '20',
                borderWidth: 2,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } }
            }
        }
    });
}

// --- Global Map ---
let map = null;
let mapLayer = null;

function initWeatherMap() {
    if (map) return;
    
    map = L.map('weatherMap').setView([20, 0], 2);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        fetchWeather(`${lat},${lng}`, true);
        switchView('dashboard');
        // Update nav active state
        document.querySelectorAll('.nav-item').forEach(i => {
            i.classList.remove('active');
            if (i.getAttribute('data-view') === 'dashboard') i.classList.add('active');
        });
    });
}

function renderForecast(data) {
    const list = document.getElementById('forecastList');
    list.innerHTML = '';
    
    const daily = data.daily;
    
    for (let i = 1; i < daily.time.length; i++) {
        const date = new Date(daily.time[i]);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        let maxTemp = daily.temperature_2m_max[i];
        if (CONFIG.UNITS === 'imperial') maxTemp = (maxTemp * 9/5) + 32;
        const code = daily.weather_code[i];

        const item = document.createElement('div');
        item.className = 'forecast-item';
        item.innerHTML = `
            <span class="day-info">${dayName}</span>
            <div class="cond-info">
                <i data-lucide="${getIconForCode(code)}"></i>
                <span style="font-size: 0.8rem; margin-left: 0.5rem">${getWeatherDesc(code)}</span>
            </div>
            <span class="forecast-temp">${Math.round(maxTemp)}°</span>
        `;
        list.appendChild(item);
    }
    lucide.createIcons();
}

function getIconForCode(code) {
    if (code === 0) return 'sun';
    if (code <= 3) return 'cloud';
    if (code >= 51 && code <= 67) return 'cloud-rain';
    if (code >= 71 && code <= 77) return 'snowflake';
    if (code >= 80 && code <= 82) return 'cloud-drizzle';
    if (code >= 95) return 'cloud-lightning';
    return 'cloud';
}

// --- AI Chat Logic ---
function handleSendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    addMessage('user', text);
    input.value = '';
    
    // AI Thinking
    showTypingIndicator();
    
    setTimeout(() => {
        const response = generateAIResponse(text);
        hideTypingIndicator();
        addMessage('ai', response);
        if (state.ttsEnabled) speakText(response);
    }, 1500);
}

function speakText(text) {
    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
}

function addMessage(role, text) {
    const container = document.getElementById('chatMessages');
    const welcome = container.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const msg = document.createElement('div');
    msg.className = `message ${role}`;
    msg.textContent = text;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    
    // Save to state
    const activeChat = state.chats.find(c => c.id === state.activeChatId);
    activeChat.messages.push({ role, text });
    localStorage.setItem('skycast-chats', JSON.stringify(state.chats));
}

function generateAIResponse(query) {
    const q = query.toLowerCase();
    const data = state.weatherData;
    if (!data) return "I don't have enough weather data to analyze yet. Try searching for a city first!";

    const current = data.current_weather;
    const hourly = data.hourly;
    const daily = data.daily;
    const name = state.currentCity.split(',')[0];

    // Simple AI Intent logic
    if (q.includes('rain') || q.includes('umbrella')) {
        const nextRain = hourly.precipitation_probability.slice(0, 12).findIndex(p => p > 30);
        if (nextRain !== -1) {
            return `You should bring an umbrella! ☔ There is a ${(hourly.precipitation_probability[nextRain])}% chance of rain in ${nextRain} hours in ${name}.`;
        }
        return `No rain is expected in ${name} for the next 12 hours. You're good to go! ☀️`;
    }
    
    if (q.includes('wear') || q.includes('clothing') || q.includes('outfit')) {
        const temp = current.temperature;
        if (temp < 10) return `It's quite chilly in ${name} (${temp}°C). I recommend a heavy coat, scarf, and warm layers. 🧣`;
        if (temp < 20) return `It's mild in ${name} (${temp}°C). A light jacket or sweater over a shirt should be perfect. 🧥`;
        return `It's warm in ${name} (${temp}°C)! Light cotton clothing, t-shirts, and sunglasses are a great choice. 😎`;
    }

    if (q.includes('travel') || q.includes('drive')) {
        const wind = current.windspeed;
        const visibility = hourly.visibility[0] / 1000;
        if (wind > 40) return `High winds detected (${wind} km/h). Drive carefully, especially if you have a high-profile vehicle. 💨`;
        if (visibility < 2) return `Visibility is low (${visibility} km). Please use fog lights and keep extra distance. 🌫️`;
        return `Conditions look clear and safe for travel in ${name}. Have a safe trip! 🚗`;
    }

    // Default: Professional Insight
    const high = daily.temperature_2m_max[0];
    const low = daily.temperature_2m_min[0];
    return `Currently in ${name}, it's ${current.temperature}°C with ${getWeatherDesc(current.weather_code).toLowerCase()}. Today's high will be ${high}°C and low will be ${low}°C. Anything specific you'd like to check?`;
}

function showTypingIndicator() {
    const container = document.getElementById('chatMessages');
    const indicator = document.createElement('div');
    indicator.className = 'message ai typing-indicator';
    indicator.id = 'typingIndicator';
    indicator.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
    container.appendChild(indicator);
    container.scrollTop = container.scrollHeight;
}

function hideTypingIndicator() {
    document.getElementById('typingIndicator')?.remove();
}

function switchChat(id) {
    state.activeChatId = id;
    renderChatHistory();
    const container = document.getElementById('chatMessages');
    container.innerHTML = '';
    
    const chat = state.chats.find(c => c.id === id);
    if (!chat.messages || chat.messages.length === 0) {
        container.innerHTML = `
            <div class="welcome-message">
                <h2>Hello! I'm SkyAI Assistant</h2>
                <p>Ask me anything about weather, what to wear, or travel tips.</p>
                <div class="suggestion-chips">
                    <button class="chip" onclick="applyChip('Should I carry an umbrella?')">Should I carry an umbrella?</button>
                    <button class="chip" onclick="applyChip('What\'s the best time to drive?')">What's the best time to drive?</button>
                    <button class="chip" onclick="applyChip('Clothing advice for tonight')">Clothing advice for tonight</button>
                </div>
            </div>`;
    } else {
        chat.messages.forEach(m => addMessageToUI(m.role, m.text));
    }
}

function createNewChat() {
    const newId = Date.now();
    const newChat = { 
        id: newId, 
        title: `Chat ${state.chats.length + 1}`, 
        messages: [] 
    };
    state.chats.unshift(newChat);
    if (state.chats.length > CONFIG.MAX_CHATS) state.chats.pop();
    
    state.activeChatId = newId;
    localStorage.setItem('skycast-chats', JSON.stringify(state.chats));
    switchChat(newId);
}

function deleteChat(id, e) {
    e.stopPropagation();
    state.chats = state.chats.filter(c => c.id !== id);
    if (state.chats.length === 0) {
        state.chats = [{ id: 1, title: 'Welcome Chat', messages: [] }];
    }
    if (state.activeChatId === id) {
        state.activeChatId = state.chats[0].id;
    }
    localStorage.setItem('skycast-chats', JSON.stringify(state.chats));
    switchChat(state.activeChatId);
}

function applyChip(text) {
    document.getElementById('chatInput').value = text;
    handleSendMessage();
}

function renderChatHistory() {
    const list = document.getElementById('chatHistoryList');
    list.innerHTML = '';
    state.chats.forEach(chat => {
        const item = document.createElement('div');
        item.className = `history-item ${chat.id === state.activeChatId ? 'active' : ''}`;
        item.innerHTML = `
            <div class="chat-title-box">
                <i data-lucide="message-square" size="14"></i>
                <span>${chat.title}</span>
            </div>
            <button class="delete-chat" onclick="deleteChat(${chat.id}, event)">
                <i data-lucide="trash-2" size="12"></i>
            </button>
        `;
        item.onclick = () => switchChat(chat.id);
        list.appendChild(item);
    });
    lucide.createIcons();
}

function addMessageToUI(role, text) {
    const container = document.getElementById('chatMessages');
    const msg = document.createElement('div');
    msg.className = `message ${role}`;
    msg.textContent = text;
    container.appendChild(msg);
}

// --- Multi-City Comparison ---
async function renderComparison() {
    const body = document.getElementById('comparisonBody');
    body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">Loading comparison data...</td></tr>';
    
    // We need to geocode each city first
    const citiesData = await Promise.all(state.comparisonCities.map(async city => {
        try {
            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${city}&count=1&language=en&format=json`);
            const geoData = await geoRes.json();
            if (!geoData.results) return null;
            
            const { latitude, longitude, name } = geoData.results[0];
            const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=relative_humidity_2m`);
            const weatherData = await weatherRes.json();
            
            return {
                name: name,
                temp: weatherData.current_weather.temperature,
                condition: getWeatherDesc(weatherData.current_weather.weather_code),
                humidity: weatherData.hourly.relative_humidity_2m[0],
                wind: weatherData.current_weather.windspeed
            };
        } catch (e) { return null; }
    }));

    body.innerHTML = '';
    const unitSymbol = CONFIG.UNITS === 'metric' ? '°C' : '°F';
    const windUnit = CONFIG.UNITS === 'metric' ? 'km/h' : 'mph';

    citiesData.filter(d => d).forEach(data => {
        const row = document.createElement('tr');
        let temp = data.temp;
        let wind = data.wind;
        if (CONFIG.UNITS === 'imperial') {
            temp = (temp * 9/5) + 32;
            wind = wind / 1.609;
        }
        
        row.innerHTML = `
            <td><strong>${data.name}</strong></td>
            <td>${data.condition}</td>
            <td>${Math.round(temp)}${unitSymbol}</td>
            <td>${data.humidity}%</td>
            <td>${Math.round(wind)} ${windUnit}</td>
            <td><button class="text-danger" onclick="removeCompare('${data.name}')" style="background:none; border:none; color: var(--accent); cursor:pointer;">Remove</button></td>
        `;
        body.appendChild(row);
    });
}

function handleAddComparison() {
    const input = document.getElementById('compareSearch');
    const city = input.value.trim();
    if (!city || state.comparisonCities.includes(city)) return;
    
    state.comparisonCities.push(city);
    localStorage.setItem('skycast-comparison', JSON.stringify(state.comparisonCities));
    input.value = '';
    renderComparison();
}

function removeCompare(city) {
    state.comparisonCities = state.comparisonCities.filter(c => c !== city);
    localStorage.setItem('skycast-comparison', JSON.stringify(state.comparisonCities));
    renderComparison();
}

// --- Voice Integration ---
function startVoiceRecognition() {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    
    const btn = document.getElementById('voiceInputBtn');
    btn.style.color = '#f43f5e';
    
    recognition.start();
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById('chatInput').value = transcript;
        handleSendMessage();
        btn.style.color = '';
    };

    recognition.onerror = () => {
        btn.style.color = '';
        showError("Voice recognition failed.");
    };
}

// --- Utils & Mock Data ---
// --- Search Suggestions ---
async function handleSearchInput() {
    const input = document.getElementById('citySearch');
    const query = input.value.trim();
    const suggestionsBox = document.getElementById('searchSuggestions');
    
    if (query.length < 3) {
        suggestionsBox.classList.add('hidden');
        return;
    }
    
    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=5&language=en&format=json`);
        const data = await res.json();
        const suggestions = data.results || [];
        
        if (suggestions.length > 0) {
            suggestionsBox.innerHTML = suggestions.map(s => `
                <div class="suggestion-item" data-lat="${s.latitude}" data-lon="${s.longitude}" data-name="${s.name}, ${s.country}">
                    <i data-lucide="map-pin" size="14"></i>
                    <span>${s.name}, ${s.admin1 ? s.admin1+', ' : ''}${s.country}</span>
                </div>
            `).join('');
            suggestionsBox.classList.remove('hidden');
            lucide.createIcons();
            
            document.querySelectorAll('.suggestion-item').forEach(item => {
                item.onclick = () => {
                    const lat = item.getAttribute('data-lat');
                    const lon = item.getAttribute('data-lon');
                    const name = item.getAttribute('data-name');
                    input.value = name;
                    suggestionsBox.classList.add('hidden');
                    fetchWeather(`${lat},${lon}`, true);
                }
            });
        } else {
            suggestionsBox.classList.add('hidden');
        }
    } catch (e) { 
        console.error("Suggestions fetch failed", e); 
    }
}

// --- Utils ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- Auth System Logic ---
function checkAuth() {
    const authOverlay = document.getElementById('authOverlay');
    if (state.currentUser) {
        authOverlay.classList.add('hidden');
        updateUserUI();
    } else {
        authOverlay.classList.remove('hidden');
    }
}

function updateUserUI() {
    if (!state.currentUser) return;
    document.getElementById('userNameLabel').textContent = state.currentUser.name;
    document.getElementById('userAvatar').textContent = state.currentUser.name.charAt(0).toUpperCase();
}

function switchAuthForm(type) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const authSubtitle = document.getElementById('authSubtitle');

    if (type === 'register') {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        authSubtitle.textContent = 'Create your account to save favorites and chats';
    } else {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        authSubtitle.textContent = 'Please login to access your dashboard';
    }
}

function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value.trim();

    if (!email || !pass) return showError('Please fill all fields');

    const users = JSON.parse(localStorage.getItem('skycast-users')) || [];
    const user = users.find(u => u.email === email && u.password === pass);

    if (user) {
        state.currentUser = user;
        localStorage.setItem('skycast-auth', JSON.stringify(user));
        checkAuth();
        fetchWeather(state.currentCity);
    } else {
        showError('Invalid email or password');
    }
}

function handleRegister() {
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPassword').value.trim();

    if (!name || !email || !pass) return showError('Please fill all fields');

    const users = JSON.parse(localStorage.getItem('skycast-users')) || [];
    if (users.find(u => u.email === email)) return showError('Email already registered');

    const newUser = { name, email, password: pass };
    users.push(newUser);
    localStorage.setItem('skycast-users', JSON.stringify(users));
    
    // Auto login
    state.currentUser = newUser;
    localStorage.setItem('skycast-auth', JSON.stringify(newUser));
    checkAuth();
    fetchWeather(state.currentCity);
}

function handleLogout() {
    state.currentUser = null;
    localStorage.removeItem('skycast-auth');
    checkAuth();
}

function showSkeletons() {
    document.querySelectorAll('.card').forEach(c => c.classList.add('skeleton'));
}

function hideSkeletons() {
    document.querySelectorAll('.card').forEach(c => c.classList.remove('skeleton'));
}


