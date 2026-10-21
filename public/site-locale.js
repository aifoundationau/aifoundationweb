/**
 * AI Foundation - Location, Weather & Display Settings
 * A thin bar fixed to the bottom of every page shows the closest suburb, the weather and the local time.
 * Clicking it opens a centred panel where visitors change their suburb/state and choose how dates,
 * times and time zones are shown across the site.
 *
 * window.SitePrefs gives the rest of the site (app.js) the same date and time formatting, and a
 * 'sitepreferenceschange' event fires on window whenever formatted dates or times would change.
 *
 * Data (no API keys): Open-Meteo for weather and place search, OpenStreetMap Nominatim for the suburb
 * at the device's position. Location and settings are kept in this browser only.
 */
(function () {
    'use strict';

    const LOCALE = 'en-AU';
    const PREFS_KEY = 'aifoundation_display_prefs';
    const PLACE_KEY = 'aifoundation_location';
    const WEATHER_KEY = 'aifoundation_weather';
    const WEATHER_MAX_AGE_MS = 15 * 60 * 1000;
    const WEATHER_VERSION = 2; // bump when the stored forecast shape changes
    const DEVICE_LOCATION_MAX_AGE_MS = 30 * 60 * 1000;
    const MAX_MATCHES = 4;
    const HOURS_SHOWN = 24;
    const SVG_NS = 'http://www.w3.org/2000/svg';

    const DEFAULT_PREFS = { dateFormat: 'dmy', timeFormat: '12', timeZone: 'auto', tempUnit: 'c' };

    const DATE_FORMATS = [
        { value: 'dmy', label: 'DD/MM/YYYY' },
        { value: 'mdy', label: 'MM/DD/YYYY' },
        { value: 'ymd', label: 'YYYY-MM-DD' },
        { value: 'long', label: 'D Mon YYYY' }
    ];

    const AU_STATES = [
        { code: 'NSW', name: 'New South Wales', timeZone: 'Australia/Sydney' },
        { code: 'VIC', name: 'Victoria', timeZone: 'Australia/Melbourne' },
        { code: 'QLD', name: 'Queensland', timeZone: 'Australia/Brisbane' },
        { code: 'WA', name: 'Western Australia', timeZone: 'Australia/Perth' },
        { code: 'SA', name: 'South Australia', timeZone: 'Australia/Adelaide' },
        { code: 'TAS', name: 'Tasmania', timeZone: 'Australia/Hobart' },
        { code: 'ACT', name: 'Australian Capital Territory', timeZone: 'Australia/Sydney' },
        { code: 'NT', name: 'Northern Territory', timeZone: 'Australia/Darwin' }
    ];

    const AU_TIME_ZONES = [
        ['Australia/Sydney', 'Sydney, Canberra (NSW, ACT)'],
        ['Australia/Melbourne', 'Melbourne (VIC)'],
        ['Australia/Brisbane', 'Brisbane (QLD)'],
        ['Australia/Adelaide', 'Adelaide (SA)'],
        ['Australia/Darwin', 'Darwin (NT)'],
        ['Australia/Perth', 'Perth (WA)'],
        ['Australia/Hobart', 'Hobart (TAS)'],
        ['Australia/Broken_Hill', 'Broken Hill (NSW)'],
        ['Australia/Lord_Howe', 'Lord Howe Island (NSW)'],
        ['Australia/Eucla', 'Eucla (WA)']
    ];

    // Starting point before a visitor shares or enters a location: the city for their device time zone
    const TIME_ZONE_CITIES = {
        'Australia/Sydney': ['Sydney', 'NSW', -33.8688, 151.2093],
        'Australia/Canberra': ['Canberra', 'ACT', -35.2809, 149.13],
        'Australia/ACT': ['Canberra', 'ACT', -35.2809, 149.13],
        'Australia/Melbourne': ['Melbourne', 'VIC', -37.8136, 144.9631],
        'Australia/Brisbane': ['Brisbane', 'QLD', -27.4698, 153.0251],
        'Australia/Adelaide': ['Adelaide', 'SA', -34.9285, 138.6007],
        'Australia/Perth': ['Perth', 'WA', -31.9523, 115.8613],
        'Australia/Hobart': ['Hobart', 'TAS', -42.8821, 147.3272],
        'Australia/Darwin': ['Darwin', 'NT', -12.4634, 130.8456],
        'Australia/Broken_Hill': ['Broken Hill', 'NSW', -31.9539, 141.4539]
    };

    // OpenStreetMap address fields, most to least specific, that name a suburb, town or locality
    const SETTLEMENT_FIELDS = ['suburb', 'town', 'village', 'hamlet', 'locality', 'city_district', 'city', 'municipality'];
    const SETTLEMENT_TYPES = SETTLEMENT_FIELDS.concat(['neighbourhood', 'quarter', 'borough']);

    // WMO weather codes reported by Open-Meteo: [label, day icon, night icon]
    const WEATHER_CODES = {
        0: ['Clear', 'fa-sun', 'fa-moon'],
        1: ['Mostly clear', 'fa-sun', 'fa-moon'],
        2: ['Partly cloudy', 'fa-cloud-sun', 'fa-cloud-moon'],
        3: ['Cloudy', 'fa-cloud'],
        45: ['Fog', 'fa-smog'],
        48: ['Freezing fog', 'fa-smog'],
        51: ['Light drizzle', 'fa-cloud-rain'],
        53: ['Drizzle', 'fa-cloud-rain'],
        55: ['Heavy drizzle', 'fa-cloud-rain'],
        56: ['Freezing drizzle', 'fa-cloud-rain'],
        57: ['Freezing drizzle', 'fa-cloud-rain'],
        61: ['Light rain', 'fa-cloud-rain'],
        63: ['Rain', 'fa-cloud-rain'],
        65: ['Heavy rain', 'fa-cloud-showers-heavy'],
        66: ['Freezing rain', 'fa-cloud-rain'],
        67: ['Freezing rain', 'fa-cloud-showers-heavy'],
        71: ['Light snow', 'fa-snowflake'],
        73: ['Snow', 'fa-snowflake'],
        75: ['Heavy snow', 'fa-snowflake'],
        77: ['Snow grains', 'fa-snowflake'],
        80: ['Light showers', 'fa-cloud-sun-rain', 'fa-cloud-moon-rain'],
        81: ['Showers', 'fa-cloud-showers-heavy'],
        82: ['Heavy showers', 'fa-cloud-showers-heavy'],
        85: ['Snow showers', 'fa-snowflake'],
        86: ['Heavy snow showers', 'fa-snowflake'],
        95: ['Thunderstorm', 'fa-cloud-bolt'],
        96: ['Thunderstorm, hail', 'fa-cloud-bolt'],
        99: ['Thunderstorm, hail', 'fa-cloud-bolt']
    };

    const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const TABS = ['now', 'hourly', 'location', 'settings'];

    // Declared before the saved settings are read below, because reading them validates time zones
    const formatterCache = new Map();

    const BAR_HTML = `
        <span class="locale-bar-item locale-bar-place-wrap">
            <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
            <span class="locale-bar-place" data-ref="barPlace"></span>
            <span class="locale-bar-muted locale-bar-approx" data-ref="barApprox">(approx.)</span>
        </span>
        <span class="locale-bar-sep" data-ref="barWeatherSep" aria-hidden="true">&middot;</span>
        <span class="locale-bar-item" data-ref="barWeather">
            <i data-ref="barWeatherIcon" aria-hidden="true"></i>
            <span data-ref="barTemp"></span>
        </span>
        <span class="locale-bar-sep locale-bar-date" aria-hidden="true">&middot;</span>
        <span class="locale-bar-item locale-bar-date" data-ref="barDate"></span>
        <span class="locale-bar-sep" aria-hidden="true">&middot;</span>
        <span class="locale-bar-item">
            <i class="fa-regular fa-clock" aria-hidden="true"></i>
            <span data-ref="barTime"></span>
            <span class="locale-bar-muted locale-bar-tz" data-ref="barZone"></span>
        </span>
        <i class="fa-solid fa-chevron-up locale-bar-caret" aria-hidden="true"></i>`;

    const STATE_OPTIONS = AU_STATES.map(s => `<option value="${s.code}">${s.code}</option>`).join('') +
        '<option value="INTL">Outside Australia</option>';

    const PANEL_HTML = `
        <div class="locale-panel" data-ref="panel" role="dialog" aria-modal="true" aria-labelledby="localePanelTitle" aria-describedby="localePanelSource">
            <div class="locale-top">
                <div class="locale-head">
                    <span class="locale-head-icon" aria-hidden="true"><i class="fa-solid fa-location-dot"></i></span>
                    <div class="locale-head-text">
                        <h2 id="localePanelTitle" data-ref="title"></h2>
                        <p id="localePanelSource" data-ref="source"></p>
                    </div>
                </div>
                <div class="locale-tabs" role="tablist" aria-label="Location and display settings" data-ref="tabList">
                    <button type="button" role="tab" id="localeTab-now" aria-controls="localePane-now" data-tab="now"><i class="fa-regular fa-clock" aria-hidden="true"></i> Now</button>
                    <button type="button" role="tab" id="localeTab-hourly" aria-controls="localePane-hourly" data-tab="hourly"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> Hourly</button>
                    <button type="button" role="tab" id="localeTab-location" aria-controls="localePane-location" data-tab="location"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i> Location</button>
                    <button type="button" role="tab" id="localeTab-settings" aria-controls="localePane-settings" data-tab="settings"><i class="fa-solid fa-sliders" aria-hidden="true"></i> Settings</button>
                </div>
                <button type="button" class="locale-close" data-action="close" aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
            </div>

            <section class="locale-pane locale-pane-now" id="localePane-now" role="tabpanel" aria-labelledby="localeTab-now" data-pane="now">
                <div class="locale-clock">
                    <div class="locale-clock-time" data-ref="clockTime"></div>
                    <div class="locale-clock-date" data-ref="clockDate"></div>
                    <div class="locale-clock-zone" data-ref="clockZone"></div>
                </div>
                <div class="locale-weather">
                    <div class="locale-weather-empty" data-ref="weatherEmpty">
                        <p>Set your location to see the local weather.</p>
                        <div class="locale-weather-empty-actions">
                            <button type="button" class="locale-btn locale-btn-primary" data-action="locate"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i> Use my location</button>
                            <button type="button" class="locale-btn" data-action="enter-suburb">Enter suburb</button>
                        </div>
                    </div>
                    <p class="locale-weather-notice" data-ref="weatherNotice">
                        <span data-ref="weatherNoticeText"></span>
                        <button type="button" class="locale-link" data-action="refresh-weather" data-ref="weatherRetry">Try again</button>
                    </p>
                    <div class="locale-weather-body" data-ref="weatherBody">
                        <div class="locale-weather-main">
                            <i data-ref="weatherIcon" aria-hidden="true"></i>
                            <div class="locale-weather-temp">
                                <strong data-ref="weatherTemp"></strong>
                                <span data-ref="weatherCondition"></span>
                            </div>
                            <div class="locale-weather-range" data-ref="weatherRange"></div>
                        </div>
                        <dl class="locale-stats">
                            <div><dt>Feels like</dt><dd data-ref="statFeels"></dd></div>
                            <div><dt>Rain chance</dt><dd data-ref="statRain"></dd></div>
                            <div><dt>Humidity</dt><dd data-ref="statHumidity"></dd></div>
                            <div><dt>Wind</dt><dd data-ref="statWind"></dd></div>
                            <div><dt>UV</dt><dd data-ref="statUv"></dd></div>
                            <div><dt data-ref="statSunLabel">Sunset</dt><dd data-ref="statSun"></dd></div>
                        </dl>
                        <div class="locale-weather-updated">
                            <span data-ref="weatherUpdated"></span>
                            <span class="locale-weather-links">
                                <button type="button" class="locale-link" data-action="show-hourly"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> Hourly forecast</button>
                                <button type="button" class="locale-link" data-action="refresh-weather"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Refresh</button>
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            <section class="locale-pane locale-pane-hourly" id="localePane-hourly" role="tabpanel" aria-labelledby="localeTab-hourly" data-pane="hourly" hidden>
                <div class="locale-weather-empty" data-ref="hourlyEmpty">
                    <p>Set your location to see the hourly forecast.</p>
                    <div class="locale-weather-empty-actions">
                        <button type="button" class="locale-btn locale-btn-primary" data-action="locate"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i> Use my location</button>
                        <button type="button" class="locale-btn" data-action="enter-suburb">Enter suburb</button>
                    </div>
                </div>
                <p class="locale-weather-notice" data-ref="hourlyNotice">
                    <span data-ref="hourlyNoticeText"></span>
                    <button type="button" class="locale-link" data-action="refresh-weather" data-ref="hourlyRetry">Try again</button>
                </p>
                <p class="locale-hourly-summary" id="localeHourlySummary" data-ref="hourlySummary"></p>
                <figure class="locale-hourly" data-ref="hourlyFigure">
                    <div class="locale-hourly-legend" aria-hidden="true">
                        <span><i class="locale-key locale-key-line locale-key-temp"></i><span data-ref="hourlyTempLegend">Temperature</span></span>
                        <span><i class="locale-key locale-key-bar locale-key-rain"></i>Chance of rain</span>
                    </div>
                    <div class="locale-hourly-chart" data-ref="hourlyChart" tabindex="0" role="slider" aria-label="Hourly forecast. Use the arrow keys to read each hour."
                        aria-describedby="localeHourlySummary" aria-valuemin="0" aria-valuemax="23" aria-valuenow="0">
                        <div class="locale-hourly-icons" data-ref="hourlyIcons" aria-hidden="true"></div>
                        <div data-ref="hourlyPlot"></div>
                        <div class="locale-hourly-tip" data-ref="hourlyTip" aria-hidden="true" hidden></div>
                    </div>
                    <div class="locale-visually-hidden">
                        <table>
                            <caption>Hourly forecast for the next 24 hours</caption>
                            <thead><tr><th scope="col">Time</th><th scope="col">Temperature</th><th scope="col">Chance of rain</th><th scope="col">Conditions</th></tr></thead>
                            <tbody data-ref="hourlyTableBody"></tbody>
                        </table>
                    </div>
                </figure>
            </section>

            <section class="locale-pane locale-pane-location" id="localePane-location" role="tabpanel" aria-labelledby="localeTab-location" data-pane="location" hidden>
                <div class="locale-loc-device">
                    <button type="button" class="locale-btn locale-btn-primary locale-btn-block" data-action="locate" data-ref="gpsButton">
                        <i class="fa-solid fa-location-crosshairs" data-ref="gpsButtonIcon" aria-hidden="true"></i>
                        <span data-ref="gpsButtonText">Use my current location</span>
                    </button>
                    <p class="locale-hint">Your browser asks first. It's only used to find your closest suburb.</p>
                </div>
                <div class="locale-loc-manual">
                    <div class="locale-divider"><span>or enter your suburb</span></div>
                    <form class="locale-form" data-ref="manualForm" novalidate>
                        <div class="locale-form-row">
                            <label class="locale-field locale-field-grow">
                                <span>Suburb or town</span>
                                <input type="text" name="suburb" maxlength="60" autocomplete="address-level2" placeholder="e.g. Parramatta" spellcheck="false">
                            </label>
                            <label class="locale-field locale-field-state">
                                <span>State</span>
                                <select name="state">${STATE_OPTIONS}</select>
                            </label>
                        </div>
                        <button type="submit" class="locale-btn locale-btn-block" data-ref="manualSubmit">Save location</button>
                    </form>
                    <div class="locale-matches" data-ref="matches" hidden></div>
                    <p class="locale-status" data-ref="locationStatus" role="status" aria-live="polite"></p>
                    <button type="button" class="locale-link locale-forget" data-action="forget" data-ref="forgetButton">Forget my location</button>
                </div>
            </section>

            <section class="locale-pane locale-pane-settings" id="localePane-settings" role="tabpanel" aria-labelledby="localeTab-settings" data-pane="settings" hidden>
                <form class="locale-settings" data-ref="settingsForm">
                    <label class="locale-field locale-setting-date">
                        <span>Date format</span>
                        <select name="dateFormat" data-ref="dateFormatSelect"></select>
                    </label>
                    <fieldset class="locale-segment">
                        <legend>Time format</legend>
                        <div class="locale-segment-options">
                            <label><input type="radio" name="timeFormat" value="12"><span>12-hour</span></label>
                            <label><input type="radio" name="timeFormat" value="24"><span>24-hour</span></label>
                        </div>
                    </fieldset>
                    <fieldset class="locale-segment">
                        <legend>Temperature</legend>
                        <div class="locale-segment-options">
                            <label><input type="radio" name="tempUnit" value="c"><span>&deg;C</span></label>
                            <label><input type="radio" name="tempUnit" value="f"><span>&deg;F</span></label>
                        </div>
                    </fieldset>
                    <label class="locale-field locale-setting-zone">
                        <span>Time zone</span>
                        <select name="timeZone" data-ref="timeZoneSelect"></select>
                    </label>
                    <p class="locale-preview">
                        <i class="fa-regular fa-eye" aria-hidden="true"></i>
                        <span><span class="locale-visually-hidden">Preview: </span><span data-ref="preview"></span></span>
                        <button type="button" class="locale-link locale-reset" data-action="reset-settings" aria-label="Reset display settings to defaults">Reset</button>
                    </p>
                </form>
            </section>

            <p class="locale-foot">
                Saved on this device only &middot; Weather by <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>
                &middot; Map data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
            </p>
        </div>`;

    // ---------- Storage (browser only; failures just mean settings last for this visit) ----------

    function readStored(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || 'null');
        } catch (e) {
            return null;
        }
    }

    function writeStored(key, value) {
        try {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            // Private browsing or blocked storage
        }
    }

    function cleanPrefs(stored) {
        const merged = { ...DEFAULT_PREFS, ...(stored && typeof stored === 'object' ? stored : {}) };
        return {
            dateFormat: DATE_FORMATS.some(f => f.value === merged.dateFormat) ? merged.dateFormat : DEFAULT_PREFS.dateFormat,
            timeFormat: merged.timeFormat === '24' ? '24' : '12',
            timeZone: ['auto', 'device'].includes(merged.timeZone) || isValidTimeZone(merged.timeZone) ? merged.timeZone : 'auto',
            tempUnit: merged.tempUnit === 'f' ? 'f' : 'c'
        };
    }

    function cleanPlace(stored) {
        if (!stored || typeof stored !== 'object' || !['gps', 'manual'].includes(stored.source)) return null;
        const lat = Number(stored.lat);
        const lon = Number(stored.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
        return {
            suburb: String(stored.suburb || 'Your location').slice(0, 80),
            state: String(stored.state || '').slice(0, 60),
            postcode: String(stored.postcode || '').slice(0, 12),
            country: String(stored.country || '').slice(0, 60),
            countryCode: String(stored.countryCode || '').toUpperCase().slice(0, 2),
            lat,
            lon,
            timezone: isValidTimeZone(stored.timezone) ? stored.timezone : '',
            source: stored.source,
            updatedAt: Number(stored.updatedAt) || 0
        };
    }

    function approximatePlace() {
        const city = TIME_ZONE_CITIES[deviceTimeZone()];
        if (!city) return null;
        const [suburb, state, lat, lon] = city;
        return { suburb, state, postcode: '', country: 'Australia', countryCode: 'AU', lat, lon, timezone: deviceTimeZone(), source: 'approx', updatedAt: Date.now() };
    }

    // ---------- State ----------

    let prefs = cleanPrefs(readStored(PREFS_KEY));
    let place = cleanPlace(readStored(PLACE_KEY)) || approximatePlace();
    let weather = null;
    let weatherState = 'idle'; // idle | loading | error
    let weatherLoadingKey = '';
    let busy = ''; // '' | 'gps' | 'search'
    let requestCounter = 0; // the newest location request wins
    let matches = [];
    let ui = null;
    let activeTab = 'now';
    let returnFocusTo = null;
    let hourlyKey = ''; // what the hourly chart was last drawn for, to skip identical redraws
    let hourlyGeometry = null;
    let hourlyIndex = 0;
    let hourlyActive = false; // pointer over the chart, or chart focused

    // ---------- Time zones and formatting ----------

    function formatter(options) {
        const key = JSON.stringify(options);
        if (!formatterCache.has(key)) formatterCache.set(key, new Intl.DateTimeFormat(LOCALE, options));
        return formatterCache.get(key);
    }

    function isValidTimeZone(zone) {
        if (!zone || typeof zone !== 'string') return false;
        try {
            formatter({ timeZone: zone });
            return true;
        } catch (e) {
            return false;
        }
    }

    function deviceTimeZone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        } catch (e) {
            return 'UTC';
        }
    }

    function stateByCode(code) {
        return AU_STATES.find(s => s.code === code) || null;
    }

    function stateByName(name) {
        const wanted = String(name || '').toLowerCase();
        return AU_STATES.find(s => s.name.toLowerCase() === wanted) || null;
    }

    // The location's time zone: from the weather service once known, otherwise from the Australian state
    function placeTimeZone() {
        if (!place) return '';
        if (place.timezone) return place.timezone;
        const state = place.countryCode === 'AU' ? stateByCode(place.state) : null;
        return state ? state.timeZone : '';
    }

    function activeTimeZone() {
        if (prefs.timeZone === 'device') return deviceTimeZone();
        if (prefs.timeZone !== 'auto') return prefs.timeZone;
        return placeTimeZone() || deviceTimeZone();
    }

    function toDate(value) {
        if (value instanceof Date) return value;
        if (value && typeof value.toDate === 'function') return value.toDate(); // Firestore Timestamp
        if (value && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
        return new Date(value);
    }

    function partsOf(date, options, timeZone = activeTimeZone()) {
        const parts = {};
        formatter({ timeZone, ...options }).formatToParts(date).forEach(p => { parts[p.type] = p.value; });
        return parts;
    }

    function formatDate(value, dateFormat = prefs.dateFormat) {
        const date = toDate(value);
        if (isNaN(date.getTime())) return '';
        if (dateFormat === 'long') {
            const p = partsOf(date, { day: 'numeric', month: 'short', year: 'numeric' });
            return `${p.day} ${p.month} ${p.year}`;
        }
        const p = partsOf(date, { day: '2-digit', month: '2-digit', year: 'numeric' });
        if (dateFormat === 'mdy') return `${p.month}/${p.day}/${p.year}`;
        if (dateFormat === 'ymd') return `${p.year}-${p.month}-${p.day}`;
        return `${p.day}/${p.month}/${p.year}`;
    }

    function timeOptions(seconds) {
        const twentyFour = prefs.timeFormat === '24';
        return {
            hour: twentyFour ? '2-digit' : 'numeric',
            minute: '2-digit',
            ...(seconds ? { second: '2-digit' } : {}),
            hourCycle: twentyFour ? 'h23' : 'h12'
        };
    }

    function formatTime(value, options = {}) {
        const date = toDate(value);
        if (isNaN(date.getTime())) return '';
        return formatter({ timeZone: activeTimeZone(), ...timeOptions(options.seconds) }).format(date);
    }

    function formatDateTime(value) {
        const date = toDate(value);
        if (isNaN(date.getTime())) return '';
        return `${formatDate(date)}, ${formatTime(date)}`;
    }

    // Hour labels for the hourly chart: "3 pm" / "15:00", or the full time when the zone is off the hour
    function formatHour(value) {
        const date = toDate(value);
        const p = partsOf(date, { minute: '2-digit' });
        if (prefs.timeFormat === '24' || Number(p.minute) !== 0) return formatTime(date);
        return formatter({ timeZone: activeTimeZone(), hour: 'numeric', hourCycle: 'h12' }).format(date);
    }

    function isSameDay(a, b) {
        const day = d => formatter({ timeZone: activeTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
        return day(toDate(a)) === day(toDate(b));
    }

    function timeZoneAbbreviation(date, timeZone = activeTimeZone()) {
        try {
            return partsOf(date, { timeZoneName: 'short' }, timeZone).timeZoneName || '';
        } catch (e) {
            return '';
        }
    }

    function utcOffset(date, timeZone = activeTimeZone()) {
        try {
            const name = partsOf(date, { timeZoneName: 'longOffset' }, timeZone).timeZoneName || '';
            return name === 'GMT' ? 'UTC+00:00' : name.replace('GMT', 'UTC');
        } catch (e) {
            return '';
        }
    }

    function timeZoneSummary(date) {
        const zone = activeTimeZone();
        const abbreviation = timeZoneAbbreviation(date);
        return [/^(GMT|UTC)/.test(abbreviation) ? '' : abbreviation, utcOffset(date), zone.replace(/_/g, ' ')]
            .filter(Boolean)
            .join(' · ');
    }

    function timeAgo(timestamp) {
        const minutes = Math.round((Date.now() - timestamp) / 60000);
        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.round(minutes / 60);
        return hours < 24 ? `${hours} h ago` : formatDate(timestamp);
    }

    function formatTemperature(celsius, short = false) {
        if (typeof celsius !== 'number' || !Number.isFinite(celsius)) return '–';
        const fahrenheit = prefs.tempUnit === 'f';
        const value = Math.round(fahrenheit ? celsius * 9 / 5 + 32 : celsius);
        return short ? `${value}°` : `${value}°${fahrenheit ? 'F' : 'C'}`;
    }

    function percent(value) {
        return typeof value === 'number' ? `${Math.round(value)}%` : '–';
    }

    function uvText(value) {
        if (typeof value !== 'number') return '–';
        const uv = Math.round(value);
        const level = uv >= 11 ? 'Extreme' : uv >= 8 ? 'Very high' : uv >= 6 ? 'High' : uv >= 3 ? 'Moderate' : 'Low';
        return `${uv} ${level}`;
    }

    function compass(degrees) {
        return typeof degrees === 'number' ? COMPASS[Math.round(degrees / 22.5) % 16] : '';
    }

    function weatherInfo(code, isDay) {
        const [label, dayIcon, nightIcon] = WEATHER_CODES[code] || ['Weather', 'fa-cloud'];
        return { label, icon: !isDay && nightIcon ? nightIcon : dayIcon };
    }

    function first(list) {
        return Array.isArray(list) ? list[0] : undefined;
    }

    function round(value, decimals) {
        const factor = 10 ** decimals;
        return Math.round(value * factor) / factor;
    }

    function distanceKm(a, b) {
        const rad = Math.PI / 180;
        const dLat = (b.lat - a.lat) * rad;
        const dLon = (b.lon - a.lon) * rad;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
        return 12742 * Math.asin(Math.sqrt(h));
    }

    function placeLabel(p, full = false) {
        if (!p) return '';
        const inAustralia = p.countryCode === 'AU';
        const region = inAustralia ? p.state : (p.state || p.country);
        let label = p.suburb + (region && region !== p.suburb ? `, ${region}` : '');
        if (full && inAustralia && p.postcode) label += ` ${p.postcode}`;
        if (full && !inAustralia && p.country && p.country !== region) label += `, ${p.country}`;
        return label;
    }

    function notifyChange() {
        window.dispatchEvent(new CustomEvent('sitepreferenceschange', {
            detail: { preferences: { ...prefs }, timeZone: activeTimeZone() }
        }));
    }

    function updatePrefs(changes) {
        prefs = cleanPrefs({ ...prefs, ...changes });
        writeStored(PREFS_KEY, prefs);
        render();
        notifyChange();
    }

    // ---------- Weather (Open-Meteo) ----------

    function weatherKey(p) {
        return `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
    }

    async function loadWeather(force = false) {
        if (!place) return;
        const key = weatherKey(place);
        const isFresh = w => w && w.version === WEATHER_VERSION && w.key === key && w.current && w.hourly &&
            Date.now() - w.fetchedAt < WEATHER_MAX_AGE_MS;
        if (!force) {
            if (isFresh(weather)) return;
            const stored = readStored(WEATHER_KEY);
            if (isFresh(stored)) {
                applyWeather(stored);
                return;
            }
        }
        if (weatherLoadingKey === key) return;
        weatherLoadingKey = key;
        weatherState = 'loading';
        render();
        try {
            // Two decimal places (about 1 km) is plenty for weather and keeps the exact position private
            const params = new URLSearchParams({
                latitude: place.lat.toFixed(2),
                longitude: place.lon.toFixed(2),
                current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day',
                daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset',
                hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
                timezone: 'auto',
                // Absolute times, so hours, sunrise and sunset show in the visitor's chosen time zone
                timeformat: 'unixtime',
                forecast_days: '2'
            });
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
            if (!res.ok) throw new Error(`Weather HTTP ${res.status}`);
            const data = await res.json();
            if (!place || weatherKey(place) !== key) return;
            const result = {
                version: WEATHER_VERSION,
                key,
                fetchedAt: Date.now(),
                timezone: String(data.timezone || ''),
                current: data.current || null,
                daily: data.daily || null,
                hourly: data.hourly || null
            };
            writeStored(WEATHER_KEY, result);
            weatherState = 'idle';
            applyWeather(result);
        } catch (e) {
            console.warn('[Location Bar] Weather unavailable:', e.message);
            if (place && weatherKey(place) === key) {
                weatherState = 'error';
                render();
            }
        } finally {
            if (weatherLoadingKey === key) weatherLoadingKey = '';
        }
    }

    function applyWeather(result) {
        weather = result;
        // Open-Meteo reports the location's time zone, which the "Automatic" time zone follows
        if (place && isValidTimeZone(result.timezone) && place.timezone !== result.timezone) {
            const zoneBefore = activeTimeZone();
            place = { ...place, timezone: result.timezone };
            if (place.source !== 'approx') writeStored(PLACE_KEY, place);
            if (activeTimeZone() !== zoneBefore) notifyChange();
        }
        render();
    }

    // Whichever of sunrise or sunset comes next at the location (times are Unix seconds)
    function nextSunEvent(daily) {
        const sunrise = daily.sunrise || [];
        const sunset = daily.sunset || [];
        const now = Date.now() / 1000;
        const at = seconds => formatTime(seconds * 1000);
        if (sunrise[0] && now < sunrise[0]) return { label: 'Sunrise', time: at(sunrise[0]) };
        if (sunset[0] && now < sunset[0]) return { label: 'Sunset', time: at(sunset[0]) };
        if (sunrise[1]) return { label: 'Sunrise', time: at(sunrise[1]) };
        return { label: 'Sunset', time: sunset[0] ? at(sunset[0]) : '–' };
    }

    // ---------- Hourly chart ----------
    // Temperature (line) and chance of rain (columns) have different scales, so they get two plots
    // on one shared time axis rather than a second y-axis.

    function upcomingHours() {
        const hourly = weather && weather.hourly;
        if (!hourly || !Array.isArray(hourly.time)) return [];
        const now = Date.now() / 1000;
        const start = hourly.time.findIndex(t => t + 3600 > now); // the hour we're in
        if (start < 0) return [];
        const hours = [];
        for (let i = start; i < hourly.time.length && hours.length < HOURS_SHOWN; i++) {
            const temp = (hourly.temperature_2m || [])[i];
            if (typeof temp !== 'number') continue;
            const rain = (hourly.precipitation_probability || [])[i];
            hours.push({
                time: hourly.time[i] * 1000,
                temp,
                rain: typeof rain === 'number' ? rain : null,
                code: (hourly.weather_code || [])[i],
                isDay: (hourly.is_day || [])[i]
            });
        }
        return hours;
    }

    function svgEl(tag, attrs, parent) {
        const el = document.createElementNS(SVG_NS, tag);
        Object.entries(attrs).forEach(([name, value]) => el.setAttribute(name, String(value)));
        if (parent) parent.append(el);
        return el;
    }

    // Up to three round-number gridlines inside the temperature range, at least 14px apart so labels never touch
    function temperatureTicks(min, max, pxPerDegree) {
        for (const step of [1, 2, 5, 10, 20, 50]) {
            const ticks = [];
            for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
            if (ticks.length <= 3 && (ticks.length < 2 || step * pxPerDegree >= 14)) return ticks;
        }
        return [];
    }

    function hourName(hour, index) {
        if (index === 0) return 'Now';
        return formatHour(hour.time) + (isSameDay(hour.time, Date.now()) ? '' : ' tomorrow');
    }

    function hourPhrase(hour, index) {
        return index === 0 ? 'now' : `at ${hourName(hour, index)}`;
    }

    function rainText(hour) {
        return hour.rain === null ? '–' : `${Math.round(hour.rain)}%`;
    }

    function renderHourly() {
        const hours = upcomingHours();
        const ready = Boolean(place) && hours.length > 1;
        ui.hourlyEmpty.hidden = Boolean(place);
        ui.hourlyNotice.hidden = !place || ready;
        ui.hourlySummary.hidden = !ready;
        ui.hourlyFigure.hidden = !ready;
        if (!ready) {
            setText(ui.hourlyNoticeText, weatherState === 'error' ? 'The forecast is unavailable right now.' : 'Loading the forecast…');
            ui.hourlyRetry.hidden = weatherState !== 'error';
            hourlyKey = '';
            return;
        }
        // Plot heights come from CSS so the chart shrinks with the panel on short screens
        const style = getComputedStyle(ui.hourlyChart);
        const sizes = [['--hourly-icons-h', 18], ['--hourly-temp-h', 66], ['--hourly-gap-h', 8], ['--hourly-rain-h', 32]]
            .map(([name, fallback]) => parseFloat(style.getPropertyValue(name)) || fallback);
        const width = Math.floor(ui.hourlyChart.clientWidth);
        const key = [weather.fetchedAt, hours[0].time, width, sizes, prefs.tempUnit, prefs.timeFormat, activeTimeZone()].join('|');
        if (!width || key === hourlyKey) return;
        hourlyKey = key;
        drawHourlyChart(hours, width, sizes);
        renderHourlyText(hours);
        if (hourlyActive) showHour(hourlyIndex);
        else hideHour();
    }

    function drawHourlyChart(hours, width, [iconsH, tempH, gapH, rainH]) {
        const left = 36; // room for the y-axis labels
        const right = width - 6;
        const band = (right - left) / hours.length;
        const xAt = i => left + band * (i + 0.5);
        const tempTop = iconsH;
        const tempBottom = tempTop + tempH;
        const rainTop = tempBottom + gapH;
        const rainBottom = rainTop + rainH;
        const height = rainBottom + 16;
        const labelRoom = 17; // above the high and below the low, so their labels stay inside the plot

        const temps = hours.map(h => (prefs.tempUnit === 'f' ? h.temp * 9 / 5 + 32 : h.temp));
        const max = Math.max(...temps);
        const min = Math.min(...temps);
        const yTemp = v => (max === min
            ? (tempTop + tempBottom) / 2
            : tempTop + labelRoom + (max - v) / (max - min) * (tempH - labelRoom * 2));

        const svg = svgEl('svg', { class: 'locale-hourly-svg', width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true', focusable: 'false' });
        const tick = (x, y, text, anchor = 'end') => {
            svgEl('text', { class: 'locale-tick', x, y, 'text-anchor': anchor }, svg).textContent = text;
        };

        // Temperature: hairline gridlines, a 10% wash under a 2px line, and only the high and low labelled
        const pxPerDegree = max === min ? 0 : (tempH - labelRoom * 2) / (max - min);
        temperatureTicks(min, max, pxPerDegree).forEach(v => {
            const y = Math.round(yTemp(v)) + 0.5;
            svgEl('line', { class: 'locale-grid', x1: left, x2: right, y1: y, y2: y }, svg);
            tick(left - 6, y + 3.5, `${Math.round(v)}°`);
        });
        const points = temps.map((v, i) => [xAt(i), yTemp(v)]);
        const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
        svgEl('path', { class: 'locale-temp-area', d: `${line}L${points[points.length - 1][0].toFixed(1)},${tempBottom}L${points[0][0].toFixed(1)},${tempBottom}Z` }, svg);
        svgEl('path', { class: 'locale-temp-line', d: line }, svg);
        // Labels sit diagonally above the high and below the low: the line never runs through them
        // (beside the dot, a flat stretch of line reads as a minus sign)
        const high = temps.indexOf(max);
        const low = temps.indexOf(min);
        (high === low ? [[high, -6]] : [[high, -6], [low, 13]]).forEach(([i, dy]) => {
            const [x, y] = points[i];
            svgEl('circle', { class: 'locale-temp-dot', cx: x, cy: y, r: 4 }, svg);
            const onLeft = x > right - 34;
            svgEl('text', { class: 'locale-direct-label', x: onLeft ? x - 5 : x + 5, y: y + dy, 'text-anchor': onLeft ? 'end' : 'start' }, svg)
                .textContent = formatTemperature(hours[i].temp, true);
        });

        // Chance of rain: thin 0-100% columns with rounded tops, square at the baseline
        svgEl('line', { class: 'locale-grid', x1: left, x2: right, y1: rainTop + 0.5, y2: rainTop + 0.5 }, svg);
        tick(left - 6, rainTop + 4, '100%');
        const barWidth = Math.max(3, Math.min(24, band * 0.6));
        hours.forEach((h, i) => {
            const barHeight = (h.rain || 0) / 100 * rainH;
            if (barHeight < 1) return;
            const x0 = xAt(i) - barWidth / 2;
            const x1 = x0 + barWidth;
            const top = rainBottom - barHeight;
            const r = Math.min(4, barWidth / 2, barHeight);
            svgEl('path', {
                class: 'locale-rain-bar',
                d: `M${x0.toFixed(1)},${rainBottom}V${(top + r).toFixed(1)}A${r},${r} 0 0 1 ${(x0 + r).toFixed(1)},${top.toFixed(1)}` +
                    `H${(x1 - r).toFixed(1)}A${r},${r} 0 0 1 ${x1.toFixed(1)},${(top + r).toFixed(1)}V${rainBottom}Z`
            }, svg);
        });
        svgEl('line', { class: 'locale-baseline', x1: left, x2: right, y1: rainBottom + 0.5, y2: rainBottom + 0.5 }, svg);
        tick(left - 6, rainBottom + 3.5, '0');

        // Shared time axis, with the conditions icon above the same hours
        const step = [2, 3, 4, 6].find(s => band * s >= 40) || 6;
        ui.hourlyIcons.textContent = '';
        for (let i = 0; i < hours.length; i += step) {
            const x = xAt(i);
            const midnight = partsOf(new Date(hours[i].time), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
            const label = i === 0 ? 'Now'
                : midnight.hour === '00' && midnight.minute === '00' ? formatter({ timeZone: activeTimeZone(), weekday: 'short' }).format(hours[i].time)
                    : formatHour(hours[i].time);
            tick(x, rainBottom + 13, label, 'middle');
            const icon = document.createElement('i');
            icon.className = `fa-solid ${weatherInfo(hours[i].code, hours[i].isDay).icon}`;
            icon.style.left = `${x}px`;
            ui.hourlyIcons.append(icon);
        }

        // Hover layer: a crosshair that snaps to the nearest hour, and a dot on the temperature line
        const crosshair = svgEl('line', { class: 'locale-crosshair', x1: 0, x2: 0, y1: tempTop, y2: rainBottom, visibility: 'hidden' }, svg);
        const hoverDot = svgEl('circle', { class: 'locale-temp-dot', cx: 0, cy: 0, r: 4, visibility: 'hidden' }, svg);
        ui.hourlyPlot.replaceChildren(svg);
        hourlyGeometry = { hours, left, band, points, crosshair, hoverDot, width, tempTop };
        ui.hourlyChart.setAttribute('aria-valuemax', String(hours.length - 1));
    }

    function renderHourlyText(hours) {
        const temps = hours.map(h => h.temp);
        const high = temps.indexOf(Math.max(...temps));
        const low = temps.indexOf(Math.min(...temps));
        const rains = hours.map(h => h.rain || 0);
        const wettest = rains.indexOf(Math.max(...rains));
        let summary = `Next 24 hours: high ${formatTemperature(hours[high].temp)} ${hourPhrase(hours[high], high)}, ` +
            `low ${formatTemperature(hours[low].temp)} ${hourPhrase(hours[low], low)}.`;
        summary += rains[wettest] >= 10
            ? ` Rain is most likely ${hourPhrase(hours[wettest], wettest)} (${Math.round(rains[wettest])}%).`
            : ' Little chance of rain.';
        setText(ui.hourlySummary, summary);
        setText(ui.hourlyTempLegend, `Temperature (°${prefs.tempUnit === 'f' ? 'F' : 'C'})`);

        // The same 24 hours as a table, for screen readers
        ui.hourlyTableBody.replaceChildren(...hours.map((h, i) => {
            const row = document.createElement('tr');
            [hourName(h, i), formatTemperature(h.temp), rainText(h), weatherInfo(h.code, h.isDay).label].forEach(text => {
                const cell = document.createElement('td');
                cell.textContent = text;
                row.append(cell);
            });
            return row;
        }));
    }

    function tipRow(keyClass, value, label) {
        const row = document.createElement('div');
        row.className = 'locale-tip-row';
        const key = document.createElement('i');
        key.className = `locale-key locale-key-line ${keyClass}`;
        const strong = document.createElement('strong');
        strong.textContent = value;
        const name = document.createElement('span');
        name.textContent = label;
        row.append(key, strong, name);
        return row;
    }

    function showHour(index) {
        const g = hourlyGeometry;
        if (!g) return;
        hourlyIndex = Math.max(0, Math.min(g.hours.length - 1, index));
        const hour = g.hours[hourlyIndex];
        const [x, y] = g.points[hourlyIndex];
        g.crosshair.setAttribute('x1', x);
        g.crosshair.setAttribute('x2', x);
        g.crosshair.setAttribute('visibility', 'visible');
        g.hoverDot.setAttribute('cx', x);
        g.hoverDot.setAttribute('cy', y);
        g.hoverDot.setAttribute('visibility', 'visible');

        const time = document.createElement('div');
        time.className = 'locale-tip-time';
        time.textContent = hourName(hour, hourlyIndex);
        const info = weatherInfo(hour.code, hour.isDay);
        const condition = document.createElement('div');
        condition.className = 'locale-tip-condition';
        const icon = document.createElement('i');
        icon.className = `fa-solid ${info.icon}`;
        condition.append(icon, document.createTextNode(info.label));
        const tip = ui.hourlyTip;
        tip.replaceChildren(time, tipRow('locale-key-temp', formatTemperature(hour.temp), 'Temperature'),
            tipRow('locale-key-rain', rainText(hour), 'Chance of rain'), condition);
        tip.hidden = false;
        // Beside the crosshair, flipping to the left near the right edge
        const tipLeft = x + 12 + tip.offsetWidth > g.width ? x - 12 - tip.offsetWidth : x + 12;
        tip.style.left = `${Math.max(0, tipLeft)}px`;
        tip.style.top = `${g.tempTop}px`;

        ui.hourlyChart.setAttribute('aria-valuenow', String(hourlyIndex));
        ui.hourlyChart.setAttribute('aria-valuetext',
            [hourName(hour, hourlyIndex), formatTemperature(hour.temp), `${rainText(hour)} chance of rain`, info.label].join(', '));
    }

    function hideHour() {
        const g = hourlyGeometry;
        if (g) {
            g.crosshair.setAttribute('visibility', 'hidden');
            g.hoverDot.setAttribute('visibility', 'hidden');
        }
        ui.hourlyTip.hidden = true;
    }

    function onHourlyKeydown(event) {
        if (!hourlyGeometry) return;
        const last = hourlyGeometry.hours.length - 1;
        const next = { ArrowRight: hourlyIndex + 1, ArrowUp: hourlyIndex + 1, ArrowLeft: hourlyIndex - 1, ArrowDown: hourlyIndex - 1, Home: 0, End: last }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        hourlyActive = true;
        showHour(next);
    }

    // ---------- Places (OpenStreetMap + Open-Meteo) ----------

    function setPlace(next) {
        const zoneBefore = activeTimeZone();
        place = next;
        writeStored(PLACE_KEY, next && next.source !== 'approx' ? next : null);
        if (!next || !weather || weather.key !== weatherKey(next)) {
            weather = null;
            weatherState = 'idle';
        }
        render();
        if (activeTimeZone() !== zoneBefore) notifyChange();
        loadWeather();
    }

    function fromOsmAddress(address, fallbackName) {
        const countryCode = String(address.country_code || '').toUpperCase();
        const iso = String(address['ISO3166-2-lvl4'] || '').replace(/^AU-/, '');
        const auState = countryCode === 'AU' ? (stateByCode(iso) || stateByName(address.state)) : null;
        const field = SETTLEMENT_FIELDS.find(key => address[key]);
        return {
            suburb: String((field && address[field]) || fallbackName || address.state || 'Your location'),
            state: auState ? auState.code : String(address.state || ''),
            postcode: String(address.postcode || ''),
            country: String(address.country || ''),
            countryCode
        };
    }

    async function reverseGeocode(lat, lon) {
        // zoom=13 returns the suburb or locality rather than the street
        const params = new URLSearchParams({ format: 'jsonv2', lat: String(lat), lon: String(lon), zoom: '13', addressdetails: '1', 'accept-language': 'en' });
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
        if (!res.ok) throw new Error(`Reverse lookup HTTP ${res.status}`);
        const data = await res.json();
        if (!data || !data.address) throw new Error('No address found');
        return fromOsmAddress(data.address, data.name);
    }

    async function searchOpenStreetMap(suburb, state) {
        const params = new URLSearchParams({
            q: state ? `${suburb}, ${state.name}, Australia` : suburb,
            format: 'jsonv2',
            addressdetails: '1',
            limit: '8',
            'accept-language': 'en'
        });
        if (state) params.set('countrycodes', 'au');
        const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
        if (!res.ok) throw new Error(`OpenStreetMap search HTTP ${res.status}`);
        const results = await res.json();
        return (Array.isArray(results) ? results : [])
            .filter(r => r.address && SETTLEMENT_TYPES.includes(r.addresstype))
            .map(r => {
                const found = fromOsmAddress(r.address, r.name);
                const name = r.name || found.suburb;
                const area = [r.address.city, r.address.county, r.address.municipality].find(v => v && v !== name);
                return {
                    ...found,
                    suburb: name,
                    lat: Number(r.lat),
                    lon: Number(r.lon),
                    timezone: '',
                    detail: found.countryCode === 'AU'
                        ? [area, found.state, found.postcode].filter(Boolean).join(', ')
                        : [found.state, found.country].filter(Boolean).join(', '),
                    population: 0
                };
            })
            .filter(m => Number.isFinite(m.lat) && Number.isFinite(m.lon) && (!state || m.state === state.code));
    }

    // Suburb search: Open-Meteo first (has time zones and council areas), OpenStreetMap if that finds nothing
    async function searchPlaces(suburb, state) {
        const params = new URLSearchParams({ name: suburb, count: '20', language: 'en', format: 'json' });
        if (state) params.set('countryCode', 'AU');
        let towns = [];
        let openMeteoFailed = false;
        try {
            const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
            if (!res.ok) throw new Error(`Place search HTTP ${res.status}`);
            const data = await res.json();
            towns = (data.results || []).filter(r =>
                String(r.feature_code || '').startsWith('PPL') && Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
        } catch (e) {
            openMeteoFailed = true;
        }

        let found = (state ? towns.filter(r => r.admin1 === state.name) : towns)
            .sort((a, b) => (b.population || 0) - (a.population || 0))
            .map(r => ({
                suburb: String(r.name),
                state: state ? state.code : String(r.admin1 || ''),
                postcode: Array.isArray(r.postcodes) && r.postcodes[0] ? String(r.postcodes[0]) : '',
                country: String(r.country || ''),
                countryCode: String(r.country_code || '').toUpperCase(),
                lat: r.latitude,
                lon: r.longitude,
                timezone: isValidTimeZone(r.timezone) ? r.timezone : '',
                detail: state
                    ? [r.admin2, state.code].filter(Boolean).join(', ')
                    : [r.admin1, r.country].filter(Boolean).join(', '),
                population: r.population || 0
            }));

        if (!found.length) {
            try {
                found = await searchOpenStreetMap(suburb, state);
            } catch (e) {
                if (openMeteoFailed) throw e;
            }
        }

        // The search also returns partial matches ("Richmond Plains" for "Richmond"); exact names win
        const exact = found.filter(m => m.suburb.toLowerCase() === suburb.toLowerCase());
        if (exact.length) found = exact;

        const seen = new Set();
        const unique = found.filter(m => {
            const key = `${m.suburb}|${m.detail}`.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        const otherStates = state && !unique.length
            ? [...new Set(towns.map(r => (stateByName(r.admin1) || {}).code).filter(Boolean))]
            : [];
        return { matches: unique, otherStates };
    }

    function locateWithDevice({ silent = false } = {}) {
        if (!navigator.geolocation || !window.isSecureContext) {
            if (!silent) {
                setStatus(window.isSecureContext
                    ? "This browser can't share its location. Enter your suburb below."
                    : 'Finding your location needs a secure (https) connection. Enter your suburb below.', 'error');
            }
            return;
        }
        const request = ++requestCounter;
        if (!silent) {
            busy = 'gps';
            showMatches([]);
            setStatus('Finding your location…');
        }
        navigator.geolocation.getCurrentPosition(async (position) => {
            if (request !== requestCounter) return;
            const lat = round(position.coords.latitude, 3);
            const lon = round(position.coords.longitude, 3);
            // Still in the same area as the last successful lookup: keep that suburb rather than asking OpenStreetMap again
            const sameArea = Boolean(place && place.source === 'gps' && place.countryCode && distanceKm(place, { lat, lon }) < 1);
            let found = sameArea ? place : null;
            if (!sameArea) {
                try {
                    found = await reverseGeocode(lat, lon);
                } catch (e) {
                    console.warn('[Location Bar] Suburb lookup failed:', e.message);
                }
                if (request !== requestCounter) return;
            }
            if (!silent) busy = '';
            setPlace({
                suburb: found ? found.suburb : 'Your location',
                state: found ? found.state : '',
                postcode: found ? found.postcode : '',
                country: found ? found.country : '',
                countryCode: found ? found.countryCode : '',
                lat,
                lon,
                timezone: sameArea ? place.timezone : '',
                source: 'gps',
                updatedAt: Date.now()
            });
            if (!silent) {
                setStatus(found
                    ? `Found you near ${placeLabel(place, true)}.`
                    : "Couldn't name your suburb, but the weather and time now match where you are.", found ? 'ok' : 'error');
            }
        }, (error) => {
            if (request !== requestCounter || silent) return;
            busy = '';
            const messages = {
                1: 'Location access is blocked for this site. Allow it in your browser settings, or enter your suburb below.',
                3: 'Finding your location took too long. Try again, or enter your suburb below.'
            };
            setStatus(messages[error.code] || "Your device couldn't find its location. Enter your suburb below.", 'error');
        }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 });
    }

    // Refresh a device-based location without prompting, but only if the visitor already allowed it
    async function refreshDeviceLocation() {
        const stale = !place || place.source === 'approx' ||
            (place.source === 'gps' && Date.now() - place.updatedAt > DEVICE_LOCATION_MAX_AGE_MS);
        if (!stale || !navigator.permissions || !navigator.geolocation) return;
        try {
            const status = await navigator.permissions.query({ name: 'geolocation' });
            if (status.state === 'granted') locateWithDevice({ silent: true });
        } catch (e) {
            // Permissions API doesn't support geolocation in this browser
        }
    }

    async function onManualSubmit(event) {
        event.preventDefault();
        const form = ui.manualForm;
        const suburb = form.elements.suburb.value.trim().replace(/\s+/g, ' ');
        const state = stateByCode(form.elements.state.value);
        if (suburb.length < 2) {
            setStatus('Enter your suburb or town.', 'error');
            form.elements.suburb.focus();
            return;
        }
        const request = ++requestCounter;
        busy = 'search';
        showMatches([]);
        setStatus(`Looking up ${suburb}…`);
        let result;
        try {
            result = await searchPlaces(suburb, state);
        } catch (e) {
            result = null;
        }
        if (request !== requestCounter) return;
        busy = '';
        if (!result) {
            setStatus("Couldn't reach the place search. Check your connection and try again.", 'error');
        } else if (!result.matches.length) {
            setStatus(result.otherStates.length
                ? `No ${suburb} in ${state.code}, but there is one in ${result.otherStates.join(', ')}. Check the state.`
                : `Couldn't find ${suburb}${state ? ` in ${state.code}` : ''}. Check the spelling or try a nearby suburb.`, 'error');
        } else if (result.matches.length === 1) {
            chooseMatch(result.matches[0]);
        } else {
            showMatches(result.matches.slice(0, MAX_MATCHES));
            setStatus(`Which ${suburb}?`);
        }
    }

    function chooseMatch(match) {
        if (!match) return;
        requestCounter++; // cancel any lookup still running
        busy = '';
        showMatches([]);
        setPlace({
            suburb: match.suburb,
            state: match.state,
            postcode: match.postcode,
            country: match.country,
            countryCode: match.countryCode,
            lat: round(match.lat, 3),
            lon: round(match.lon, 3),
            timezone: match.timezone || '',
            source: 'manual',
            updatedAt: Date.now()
        });
        setStatus(`Location set to ${placeLabel(place, true)}.`, 'ok');
    }

    function forgetPlace() {
        requestCounter++;
        busy = '';
        showMatches([]);
        setPlace(approximatePlace());
        prefillManualForm();
        setStatus('Your saved location was removed from this device.', 'ok');
    }

    // ---------- Rendering ----------

    function setText(el, text) {
        if (el && el.textContent !== text) el.textContent = text;
    }

    function render() {
        if (!ui) return;
        const now = new Date();
        renderBar(now);
        if (ui.overlay.hidden) return;
        renderHeader();
        renderClock(now);
        renderWeather();
        renderLocationPane();
        if (activeTab === 'hourly') renderHourly();
        if (activeTab === 'settings') renderSettings(now);
    }

    function tick() {
        if (!ui || document.hidden) return;
        const now = new Date();
        renderBarTime(now);
        if (ui.overlay.hidden) return;
        renderClock(now);
        // The chart starts at the current hour, so check once a minute whether it has moved on
        if (activeTab === 'hourly' && now.getSeconds() === 0) renderHourly();
    }

    function currentWeather() {
        const current = weather && weather.current;
        return current && typeof current.temperature_2m === 'number' ? current : null;
    }

    function renderBar(now) {
        setText(ui.barPlace, place ? placeLabel(place) : 'Set your location');
        ui.barApprox.hidden = !(place && place.source === 'approx');
        const current = currentWeather();
        ui.barWeather.hidden = !current;
        ui.barWeatherSep.hidden = !current;
        if (current) {
            ui.barWeatherIcon.className = `fa-solid ${weatherInfo(current.weather_code, current.is_day).icon}`;
            setText(ui.barTemp, formatTemperature(current.temperature_2m));
        }
        renderBarTime(now);
    }

    function renderBarTime(now) {
        setText(ui.barDate, formatDate(now));
        setText(ui.barTime, formatTime(now));
        setText(ui.barZone, timeZoneAbbreviation(now));
        const current = currentWeather();
        const label = [
            'Location, weather and display settings',
            place ? placeLabel(place) : 'location not set',
            current ? `${formatTemperature(current.temperature_2m)} ${weatherInfo(current.weather_code, current.is_day).label}` : '',
            formatTime(now)
        ].filter(Boolean).join(', ');
        if (ui.bar.getAttribute('aria-label') !== label) ui.bar.setAttribute('aria-label', label);
    }

    function renderHeader() {
        setText(ui.title, place ? placeLabel(place, true) : 'Location not set');
        let source = "Showing your device's time";
        if (place && place.source === 'gps') source = `Found from your device · ${timeAgo(place.updatedAt)}`;
        else if (place && place.source === 'manual') source = 'Set by you';
        else if (place) source = 'Approximate, from your time zone';
        setText(ui.source, source);
    }

    function renderClock(now) {
        setText(ui.clockTime, formatTime(now, { seconds: true }));
        const weekday = formatter({ timeZone: activeTimeZone(), weekday: 'long' }).format(now);
        setText(ui.clockDate, `${weekday}, ${formatDate(now)}`);
        setText(ui.clockZone, timeZoneSummary(now));
    }

    function renderWeather() {
        const current = currentWeather();
        const daily = weather && weather.daily;
        const ready = Boolean(current && daily);
        ui.weatherEmpty.hidden = Boolean(place);
        ui.weatherBody.hidden = !place || !ready;
        ui.weatherNotice.hidden = !place || ready;
        if (!place) return;
        if (!ready) {
            setText(ui.weatherNoticeText, weatherState === 'error' ? 'The weather is unavailable right now.' : 'Loading the weather…');
            ui.weatherRetry.hidden = weatherState !== 'error';
            return;
        }
        const info = weatherInfo(current.weather_code, current.is_day);
        ui.weatherIcon.className = `fa-solid ${info.icon}`;
        setText(ui.weatherTemp, formatTemperature(current.temperature_2m));
        setText(ui.weatherCondition, info.label);
        setText(ui.weatherRange, `H ${formatTemperature(first(daily.temperature_2m_max), true)} · L ${formatTemperature(first(daily.temperature_2m_min), true)}`);
        setText(ui.statFeels, formatTemperature(current.apparent_temperature));
        setText(ui.statRain, percent(first(daily.precipitation_probability_max)));
        setText(ui.statHumidity, percent(current.relative_humidity_2m));
        setText(ui.statWind, typeof current.wind_speed_10m === 'number'
            ? `${Math.round(current.wind_speed_10m)} km/h ${compass(current.wind_direction_10m)}`.trim()
            : '–');
        setText(ui.statUv, uvText(first(daily.uv_index_max)));
        const sun = nextSunEvent(daily);
        setText(ui.statSunLabel, sun.label);
        setText(ui.statSun, sun.time);
        setText(ui.weatherUpdated, `Updated ${formatTime(weather.fetchedAt)}`);
    }

    function renderLocationPane() {
        ui.gpsButton.disabled = busy === 'gps';
        ui.gpsButtonIcon.className = busy === 'gps' ? 'fa-solid fa-circle-notch fa-spin' : 'fa-solid fa-location-crosshairs';
        setText(ui.gpsButtonText, busy === 'gps' ? 'Finding your location…' : 'Use my current location');
        ui.manualSubmit.disabled = busy === 'search';
        setText(ui.manualSubmit, busy === 'search' ? 'Searching…' : 'Save location');
        ui.forgetButton.hidden = !place || place.source === 'approx';
        ui.panes.location.classList.toggle('is-choosing', matches.length > 0);
    }

    function renderSettings(now) {
        [...ui.dateFormatSelect.options].forEach(option => {
            const format = DATE_FORMATS.find(f => f.value === option.value);
            setText(option, `${format.label}  ·  ${formatDate(now, format.value)}`);
        });
        ui.dateFormatSelect.value = prefs.dateFormat;
        ui.settingsForm.elements.timeFormat.value = prefs.timeFormat;
        ui.settingsForm.elements.tempUnit.value = prefs.tempUnit;
        setText(ui.timeZoneSelect.options[0], `Automatic · ${(placeTimeZone() || deviceTimeZone()).replace(/_/g, ' ')}`);
        setText(ui.timeZoneSelect.options[1], `This device · ${deviceTimeZone().replace(/_/g, ' ')}`);
        ui.timeZoneSelect.value = prefs.timeZone;
        setText(ui.preview, `${formatDate(now)} · ${formatTime(now)} ${timeZoneAbbreviation(now)}`.trim());
    }

    function setStatus(message, tone = 'info') {
        if (!ui) return;
        setText(ui.locationStatus, message);
        ui.locationStatus.dataset.tone = tone;
        renderLocationPane();
    }

    function showMatches(list) {
        matches = list;
        if (!ui) return;
        ui.matches.textContent = '';
        list.forEach((match, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'locale-match';
            button.dataset.match = String(index);
            const name = document.createElement('strong');
            name.textContent = match.suburb;
            const detail = document.createElement('span');
            detail.textContent = match.detail || placeLabel(match);
            button.append(name, detail);
            ui.matches.append(button);
        });
        ui.matches.hidden = list.length === 0;
        renderLocationPane();
    }

    function prefillManualForm() {
        const form = ui.manualForm;
        const inAustralia = Boolean(place && place.countryCode === 'AU' && stateByCode(place.state));
        const abroad = place && place.countryCode ? place.countryCode !== 'AU' : !deviceTimeZone().startsWith('Australia/');
        form.elements.state.value = inAustralia ? place.state : (abroad ? 'INTL' : 'NSW');
        form.elements.suburb.value = place && place.source !== 'approx' && place.suburb !== 'Your location' ? place.suburb : '';
    }

    function buildTimeZoneOptions() {
        const select = ui.timeZoneSelect;
        select.append(new Option('Automatic', 'auto'), new Option('This device', 'device'));
        const australia = document.createElement('optgroup');
        australia.label = 'Australia';
        AU_TIME_ZONES.forEach(([zone, label]) => australia.append(new Option(label, zone)));
        const everywhere = document.createElement('optgroup');
        everywhere.label = 'All time zones';
        const listed = new Set(AU_TIME_ZONES.map(([zone]) => zone));
        const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
        // Keep a saved zone even if this browser doesn't list it
        [...new Set(['UTC', ...zones, prefs.timeZone])]
            .filter(zone => !['auto', 'device'].includes(zone) && !listed.has(zone) && isValidTimeZone(zone))
            .forEach(zone => everywhere.append(new Option(zone.replace(/_/g, ' '), zone)));
        select.append(australia, everywhere);
    }

    // ---------- Panel behaviour ----------

    function selectTab(name) {
        activeTab = TABS.includes(name) ? name : 'now';
        TABS.forEach(tab => {
            const selected = tab === activeTab;
            ui.tabs[tab].setAttribute('aria-selected', String(selected));
            ui.tabs[tab].tabIndex = selected ? 0 : -1;
            ui.panes[tab].hidden = !selected;
        });
        render();
    }

    function openPanel(tab = 'now') {
        if (!ui) return;
        if (ui.overlay.hidden) {
            const focused = document.activeElement;
            returnFocusTo = focused && focused !== document.body ? focused : ui.bar;
        }
        if (!ui.timeZoneSelect.options.length) buildTimeZoneOptions();
        ui.overlay.hidden = false;
        document.documentElement.classList.add('locale-panel-open');
        ui.bar.setAttribute('aria-expanded', 'true');
        prefillManualForm();
        selectTab(tab);
        ui.tabs[activeTab].focus();
        loadWeather();
    }

    function closePanel() {
        if (!ui || ui.overlay.hidden) return;
        ui.overlay.hidden = true;
        document.documentElement.classList.remove('locale-panel-open');
        ui.bar.setAttribute('aria-expanded', 'false');
        showMatches([]);
        const target = returnFocusTo && document.contains(returnFocusTo) ? returnFocusTo : ui.bar;
        returnFocusTo = null;
        target.focus();
    }

    function trapFocus(event) {
        // Only what Tab can actually reach: skips unselected tabs (tabIndex -1), hidden panes and unchecked radios
        const focusable = [...ui.panel.querySelectorAll('button, input, select, a[href], [tabindex]')]
            .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0 && !(el.type === 'radio' && !el.checked));
        if (!focusable.length) return;
        const firstEl = focusable[0];
        const lastEl = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === firstEl) {
            event.preventDefault();
            lastEl.focus();
        } else if (!event.shiftKey && document.activeElement === lastEl) {
            event.preventDefault();
            firstEl.focus();
        }
    }

    function onPanelKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closePanel();
        } else if (event.key === 'Tab') {
            trapFocus(event);
        }
    }

    function onTabKeydown(event) {
        const index = TABS.indexOf(activeTab);
        const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        selectTab(TABS[(next + TABS.length) % TABS.length]);
        ui.tabs[activeTab].focus();
    }

    function onPanelClick(event) {
        const tab = event.target.closest('[data-tab]');
        if (tab) {
            selectTab(tab.dataset.tab);
            return;
        }
        const match = event.target.closest('[data-match]');
        if (match) {
            chooseMatch(matches[Number(match.dataset.match)]);
            return;
        }
        const action = event.target.closest('[data-action]');
        if (!action) return;
        switch (action.dataset.action) {
            case 'close':
                closePanel();
                break;
            case 'locate':
                selectTab('location');
                locateWithDevice();
                break;
            case 'enter-suburb':
                selectTab('location');
                ui.manualForm.elements.suburb.focus();
                break;
            case 'refresh-weather':
                loadWeather(true);
                break;
            case 'show-hourly':
                selectTab('hourly');
                ui.tabs.hourly.focus();
                break;
            case 'forget':
                forgetPlace();
                break;
            case 'reset-settings':
                updatePrefs(DEFAULT_PREFS);
                break;
        }
    }

    function onSettingsChange(event) {
        const { name, value } = event.target;
        if (Object.prototype.hasOwnProperty.call(DEFAULT_PREFS, name)) updatePrefs({ [name]: value });
    }

    function mount() {
        if (ui || !document.body) return;

        const bar = document.createElement('button');
        bar.type = 'button';
        bar.id = 'localeBar';
        bar.className = 'locale-bar';
        bar.setAttribute('aria-haspopup', 'dialog');
        bar.setAttribute('aria-controls', 'localeOverlay');
        bar.setAttribute('aria-expanded', 'false');
        bar.innerHTML = BAR_HTML;

        const overlay = document.createElement('div');
        overlay.id = 'localeOverlay';
        overlay.className = 'locale-overlay';
        overlay.hidden = true;
        overlay.innerHTML = PANEL_HTML;

        document.body.append(bar, overlay);
        document.body.classList.add('has-locale-bar');

        ui = { bar, overlay, tabs: {}, panes: {} };
        [bar, overlay].forEach(root => root.querySelectorAll('[data-ref]').forEach(el => { ui[el.dataset.ref] = el; }));
        overlay.querySelectorAll('[data-tab]').forEach(el => { ui.tabs[el.dataset.tab] = el; });
        overlay.querySelectorAll('[data-pane]').forEach(el => { ui.panes[el.dataset.pane] = el; });
        DATE_FORMATS.forEach(f => ui.dateFormatSelect.append(new Option(f.label, f.value)));

        bar.addEventListener('click', () => openPanel());
        // Close on a click that starts and ends on the dimmed backdrop (not a drag out of the panel)
        let pressedBackdrop = false;
        overlay.addEventListener('pointerdown', (e) => { pressedBackdrop = e.target === overlay; });
        overlay.addEventListener('click', (e) => { if (pressedBackdrop && e.target === overlay) closePanel(); });
        overlay.addEventListener('keydown', onPanelKeydown);
        ui.panel.addEventListener('click', onPanelClick);
        ui.tabList.addEventListener('keydown', onTabKeydown);
        ui.manualForm.addEventListener('submit', onManualSubmit);
        ui.settingsForm.addEventListener('change', onSettingsChange);
        ui.settingsForm.addEventListener('submit', (e) => e.preventDefault());

        // Hourly chart: the crosshair follows the pointer or a tap; arrow keys step through the hours
        const chart = ui.hourlyChart;
        const hourAt = (e) => (hourlyGeometry
            ? Math.floor((e.clientX - chart.getBoundingClientRect().left - hourlyGeometry.left) / hourlyGeometry.band)
            : 0);
        chart.addEventListener('pointerdown', (e) => { hourlyActive = true; showHour(hourAt(e)); });
        chart.addEventListener('pointermove', (e) => { hourlyActive = true; showHour(hourAt(e)); });
        chart.addEventListener('pointerleave', () => {
            if (document.activeElement === chart) return;
            hourlyActive = false;
            hideHour();
        });
        chart.addEventListener('focus', () => { hourlyActive = true; showHour(hourlyIndex); });
        chart.addEventListener('blur', () => { hourlyActive = false; hideHour(); });
        chart.addEventListener('keydown', onHourlyKeydown);
        const redrawHourly = () => { if (!overlay.hidden && activeTab === 'hourly') renderHourly(); };
        if (window.ResizeObserver) new ResizeObserver(redrawHourly).observe(chart);
        window.addEventListener('resize', redrawHourly);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                tick();
                loadWeather();
            }
        });

        render();
        setInterval(tick, 1000);
        setInterval(() => { if (!document.hidden) loadWeather(); }, 5 * 60 * 1000);
        loadWeather();
        refreshDeviceLocation();
    }

    window.SitePrefs = {
        formatDate: value => formatDate(value),
        formatTime: (value, options) => formatTime(value, options),
        formatDateTime,
        getTimeZone: activeTimeZone,
        getPreferences: () => ({ ...prefs }),
        getLocation: () => (place ? { ...place } : null),
        open: openPanel
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
})();
