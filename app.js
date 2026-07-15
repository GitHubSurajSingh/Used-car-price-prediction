// RevValue - Used Car Price Prediction & Analytics Logic

// Global Application State
const state = {
    metadata: null,
    rawData: [],
    activeTab: 'predictor-tab',
    charts: {}
};

// Dynamic Current Year for age calculations & selections (should resolve to 2026)
const currentYear = new Date().getFullYear();

// Coefficient Interpretation Dictionary (for the dictionary table)
const coefficientDescriptions = {
    'Kilometers_Driven': { name: 'Kilometers Driven (Linear)', desc: 'Direct mileage penalty. High mileage cars have a slight linear price reduction.' },
    'Mileage': { name: 'Fuel Economy (Mileage)', desc: 'Fuel economy in kmpl/kmg. A negative coefficient indicates that economy-focused cars are generally priced lower than low-mileage performance/luxury cars.' },
    'Power': { name: 'Engine Power (bhp)', desc: 'Engine horsepower. Higher power is highly valued and substantially increases price (+0.8% per bhp).' },
    'Seats': { name: 'Number of Seats', desc: 'Car capacity. More seats lead to a small valuation premium (+5.4% per seat).' },
    'Ageofcar': { name: 'Age of Car (Years)', desc: 'Annual depreciation factor. Each year of age decreases valuation by approximately 10.6% (e.g. e^-0.1123).' },
    'Kilometers_Driven_log': { name: 'Kilometers Driven (Log)', desc: 'Logarithmic usage penalty. Reflects diminishing depreciation: the price drop is steepest in the first few thousand kilometers.' },
    'Brand_Class_Low': { name: 'Brand Class: Economy', desc: 'Price discount for economy brands (Maruti, Hyundai, etc.) compared to premium brands (BMW, Audi, etc.) by ~20.5%.' },
    'Transmission_Manual': { name: 'Transmission: Manual', desc: 'Price discount for manual transmission compared to automatic by ~20%.' },
    'Fuel_Type_Diesel': { name: 'Fuel: Diesel', desc: 'Premium for diesel vehicles (+20.6% over CNG baseline) due to higher torque and fuel efficiency.' },
    'Fuel_Type_Electric': { name: 'Fuel: Electric', desc: 'Substantial premium for electric vehicles (+195% over CNG baseline), reflecting high initial battery technology cost.' },
    'Fuel_Type_LPG': { name: 'Fuel: LPG', desc: 'Slight discount for LPG vehicles compared to CNG baseline.' },
    'Fuel_Type_Petrol': { name: 'Fuel: Petrol', desc: 'Petrol vehicles are priced ~13.3% lower than CNG vehicles once mileage/power are controlled.' },
    'Location_Bangalore': { name: 'Location: Bangalore', desc: 'Regional premium (+17% over Ahmedabad baseline) due to high local taxes and purchasing power.' },
    'Location_Chennai': { name: 'Location: Chennai', desc: 'Minor regional premium (+2.2% over Ahmedabad baseline).' },
    'Location_Coimbatore': { name: 'Location: Coimbatore', desc: 'Regional premium (+10.4% over Ahmedabad baseline).' },
    'Location_Delhi': { name: 'Location: Delhi', desc: 'Regional discount (-4.4% compared to Ahmedabad baseline) due to high supply and strict environmental regulations.' },
    'Location_Hyderabad': { name: 'Location: Hyderabad', desc: 'Regional premium (+12.4% over Ahmedabad baseline).' },
    'Location_Jaipur': { name: 'Location: Jaipur', desc: 'Regional discount (-6.2% compared to Ahmedabad baseline).' },
    'Location_Kochi': { name: 'Location: Kochi', desc: 'Minor regional discount (-2.6% compared to Ahmedabad baseline).' },
    'Location_Kolkata': { name: 'Location: Kolkata', desc: 'Significant regional discount (-21.1% compared to Ahmedabad baseline) due to local market supply dynamics.' },
    'Location_Mumbai': { name: 'Location: Mumbai', desc: 'Regional discount (-5.5% compared to Ahmedabad baseline).' },
    'Location_Pune': { name: 'Location: Pune', desc: 'Regional discount (-4.0% compared to Ahmedabad baseline).' }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    initLucide();
    setupTabNavigation();
    setupPredictorForm();
    setupBatchPredictor();

    // Load data
    try {
        await loadMetadata();
        await loadRawDataset();
        // Render initial graphs since analytics is loaded
        renderAllCharts();
        populateModelStats();
    } catch (err) {
        console.error("Error initializing RevValue application:", err);
        alert("Failed to load model metadata or raw dataset. Please ensure you are running this app via a local web server (e.g., python -m http.server 8000).");
    }
});

// Icon Initialization
function initLucide() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// 1. Navigation setup
function setupTabNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const titleEl = document.getElementById('current-tab-title');
    const descEl = document.getElementById('current-tab-desc');

    const tabMeta = {
        'predictor-tab': { title: 'Price Predictor', desc: 'Estimate used car values using statsmodels OLS Linear Regression' },
        'batch-tab': { title: 'Batch Prediction', desc: 'Upload CSV inventories for bulk car value calculations' },
        'analytics-tab': { title: 'Data Insights', desc: 'Exploratory data analysis of 5,831 used car sales records' },
        'model-tab': { title: 'Model Analytics', desc: 'Overview of regression coefficients, feature weights, and validation metrics' }
    };

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.getAttribute('data-tab');

            // Toggle active nav item
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Toggle active panel
            tabPanels.forEach(panel => panel.classList.remove('active'));
            document.getElementById(targetTab).classList.add('active');

            // Update Header
            titleEl.textContent = tabMeta[targetTab].title;
            descEl.textContent = tabMeta[targetTab].desc;

            state.activeTab = targetTab;

            // Resize or trigger chart re-renders (Chart.js bug with hidden tabs)
            if (targetTab === 'analytics-tab' || targetTab === 'model-tab') {
                renderAllCharts();
            }
        });
    });
}

// Helper utilities for Brand, Model, Variant extraction and Auto-fill
function parseCarName(fullName) {
    if (!fullName) return { brand: 'Unknown', model: 'Unknown', variant: 'Unknown' };
    
    // Normalize spaces
    const cleanName = fullName.replace(/\s+/g, ' ').trim();
    const parts = cleanName.split(' ');
    
    let brand = parts[0];
    let modelStartIndex = 1;
    
    if (brand.toUpperCase() === 'ISUZU') {
        brand = 'Isuzu';
    } else if (brand.toUpperCase() === 'MINI' && parts[1] && parts[1].toUpperCase() === 'COOPER') {
        brand = 'Mini Cooper';
        modelStartIndex = 2;
    } else if (brand.toUpperCase() === 'LAND' && parts[1] && parts[1].toUpperCase() === 'ROVER') {
        brand = 'Land Rover';
        modelStartIndex = 2;
    }
    
    let model = '';
    let variant = '';
    
    if (parts.length > modelStartIndex) {
        if (parts.length > modelStartIndex + 1) {
            model = parts[modelStartIndex] + ' ' + parts[modelStartIndex + 1];
            variant = parts.slice(modelStartIndex + 2).join(' ');
        } else {
            model = parts[modelStartIndex];
            variant = '';
        }
    } else {
        model = 'Generic';
        variant = '';
    }
    
    return { 
        brand, 
        model, 
        variant: variant || 'Standard' 
    };
}

function getMedian(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getMostCommon(arr) {
    if (arr.length === 0) return null;
    const modeMap = {};
    let maxEl = arr[0], maxCount = 1;
    for (let i = 0; i < arr.length; i++) {
        const el = arr[i];
        if (el == null) continue;
        if (modeMap[el] == null) modeMap[el] = 1;
        else modeMap[el]++;
        if (modeMap[el] > maxCount) {
            maxEl = el;
            maxCount = modeMap[el];
        }
    }
    return maxEl;
}

function autoFillFormFields(matches) {
    const powers = matches.map(c => c.Power).filter(p => p != null);
    const seats = matches.map(c => c.Seats).filter(s => s != null);

    const powerEl = document.getElementById('car-power');
    const seatsEl = document.getElementById('car-seats');

    const targetPower = getMedian(powers);
    const targetSeats = Math.round(getMedian(seats));

    const setValueAndAnimate = (el, val) => {
        if (!el || val == null || val === 0) return;
        el.value = val;
        el.classList.add('autofill-highlight');
        setTimeout(() => {
            el.classList.remove('autofill-highlight');
        }, 1000);
    };

    setValueAndAnimate(powerEl, targetPower ? parseFloat(targetPower.toFixed(1)) : null);
    setValueAndAnimate(seatsEl, targetSeats);
}

// 2. Load JSON Metadata
async function loadMetadata() {
    const response = await fetch('../model_metadata.json');
    if (!response.ok) {
        throw new Error(`Failed to fetch model metadata: ${response.statusText}`);
    }
    state.metadata = await response.json();
    console.log("Metadata loaded:", state.metadata);
}

// 3. Load CSV Dataset (client-side parsing)
async function loadRawDataset() {
    const response = await fetch('../used_cars_data.csv');
    if (!response.ok) {
        throw new Error(`Failed to fetch dataset: ${response.statusText}`);
    }
    const csvText = await response.text();

    return new Promise((resolve, reject) => {
        Papa.parse(csvText, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => {
                const cleanMileage = (m) => {
                    if (m == null) return null;
                    if (typeof m === 'number') return m;
                    const parsed = parseFloat(m.toString().replace(' kmpl', '').replace(' km/g', '').trim());
                    return isNaN(parsed) ? null : parsed;
                };
                const cleanPower = (p) => {
                    if (p == null) return null;
                    if (typeof p === 'number') return p;
                    const str = p.toString().replace(' bhp', '').trim();
                    if (str.toLowerCase() === 'null') return null;
                    const parsed = parseFloat(str);
                    return isNaN(parsed) ? null : parsed;
                };
                const cleanEngine = (e) => {
                    if (e == null) return null;
                    if (typeof e === 'number') return e;
                    const parsed = parseInt(e.toString().replace(' CC', '').trim());
                    return isNaN(parsed) ? null : parsed;
                };

                state.rawData = results.data.map(car => {
                    if (!car.Name) return car;
                    const parsed = parseCarName(car.Name);
                    return {
                        ...car,
                        _brand: parsed.brand,
                        _model: parsed.model,
                        _variant: parsed.variant,
                        Mileage: cleanMileage(car.Mileage),
                        Power: cleanPower(car.Power),
                        Engine: cleanEngine(car.Engine)
                    };
                });
                console.log(`Parsed ${state.rawData.length} rows of CSV.`);
                populateDropdowns();
                resolve();
            },
            error: (err) => {
                reject(err);
            }
        });
    });
}

// 4. Populate dynamic dropdowns based on model configuration
function populateDropdowns() {
    if (!state.metadata) return;

    const brandSelect = document.getElementById('car-brand');
    const modelSelect = document.getElementById('car-model');
    const variantSelect = document.getElementById('car-variant');
    const locationSelect = document.getElementById('car-location');
    const fuelSelect = document.getElementById('car-fuel');
    const transmissionSelect = document.getElementById('car-transmission');
    const ownerSelect = document.getElementById('car-owner');
    const yearSelect = document.getElementById('car-year');

    // Reset Model & Variant dropdowns on startup
    modelSelect.innerHTML = '<option value="" disabled selected>Select Model</option>';
    modelSelect.disabled = true;
    variantSelect.innerHTML = '<option value="" disabled selected>Select Variant</option>';
    variantSelect.disabled = true;

    // Categorical arrays from metadata (loaded from train_model.py output)
    const brands = state.metadata.categories.Brand;
    const locations = state.metadata.categories.Location;
    const fuels = state.metadata.categories.Fuel_Type;
    const transmissions = state.metadata.categories.Transmission;
    const owners = state.metadata.categories.Owner_Type;

    // Years list: from 1998 to current year (descending)
    const years = [];
    for (let y = currentYear; y >= 1998; y--) {
        years.push(y);
    }

    // Populate helper
    const populateOptionList = (selectElement, list, placeholder) => {
        selectElement.innerHTML = `<option value="" disabled selected>${placeholder}</option>`;
        list.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            selectElement.appendChild(opt);
        });
    };

    populateOptionList(brandSelect, brands, 'Select Brand');
    populateOptionList(locationSelect, locations, 'Select Location');
    populateOptionList(fuelSelect, fuels, 'Select Fuel Type');
    populateOptionList(transmissionSelect, transmissions, 'Select Transmission');
    populateOptionList(ownerSelect, owners, 'Select Owner Type');
    populateOptionList(yearSelect, years, 'Select Year');

    // Add min/max helpers dynamically as placeholders/tooltips
    document.getElementById('car-km').placeholder = `e.g. ${Math.round(state.metadata.ranges.Kilometers_Driven.median)}`;
    document.getElementById('car-mileage').placeholder = `e.g. ${state.metadata.ranges.Mileage.median.toFixed(1)}`;
    document.getElementById('car-power').placeholder = `e.g. ${state.metadata.ranges.Power.median.toFixed(1)}`;
    document.getElementById('car-seats').placeholder = `e.g. ${Math.round(state.metadata.ranges.Seats.median)}`;
}

// 5. Predictor Form Math & Driver Explanations
function setupPredictorForm() {
    const form = document.getElementById('prediction-form');
    const resetBtn = document.getElementById('reset-form-btn');

    const brandSelect = document.getElementById('car-brand');
    const modelSelect = document.getElementById('car-model');
    const variantSelect = document.getElementById('car-variant');

    const resultPlaceholder = document.getElementById('result-placeholder');
    const resultDisplay = document.getElementById('result-display');
    const predictedPriceEl = document.getElementById('predicted-price');

    // Brand Selection change handler: populates and enables Model selection dropdown
    brandSelect.addEventListener('change', () => {
        const brand = brandSelect.value;
        const models = [...new Set(
            state.rawData
                .filter(c => c._brand === brand && c._model)
                .map(c => c._model)
        )].sort();

        modelSelect.innerHTML = '<option value="" disabled selected>Select Model</option>';
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            modelSelect.appendChild(opt);
        });
        modelSelect.disabled = false;

        variantSelect.innerHTML = '<option value="" disabled selected>Select Variant</option>';
        variantSelect.disabled = true;
    });

    // Model Selection change handler: populates and enables Variant selection dropdown
    modelSelect.addEventListener('change', () => {
        const brand = brandSelect.value;
        const model = modelSelect.value;
        const variants = [...new Set(
            state.rawData
                .filter(c => c._brand === brand && c._model === model && c._variant)
                .map(c => c._variant)
        )].sort();

        variantSelect.innerHTML = '<option value="" disabled selected>Select Variant</option>';
        variants.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            variantSelect.appendChild(opt);
        });
        variantSelect.disabled = false;
    });

    // Variant Selection change handler: auto-fills ONLY Engine Power and Seats based on historical median data
    variantSelect.addEventListener('change', () => {
        const brand = brandSelect.value;
        const model = modelSelect.value;
        const variant = variantSelect.value;

        const matches = state.rawData.filter(
            c => c._brand === brand && c._model === model && c._variant === variant
        );

        if (matches.length > 0) {
            autoFillFormFields(matches);
        }
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Extract inputs
        const brand = brandSelect.value;
        const location = document.getElementById('car-location').value;
        const year = parseInt(document.getElementById('car-year').value);
        const kmDriven = parseFloat(document.getElementById('car-km').value);
        const fuel = document.getElementById('car-fuel').value;
        const transmission = document.getElementById('car-transmission').value;
        const owner = document.getElementById('car-owner').value;
        const mileage = parseFloat(document.getElementById('car-mileage').value);
        const power = parseFloat(document.getElementById('car-power').value);
        const seats = parseFloat(document.getElementById('car-seats').value);

        // Run math model
        const predictionResult = runSinglePrediction({
            brand, location, year, kmDriven, fuel, transmission, owner, mileage, power, seats
        });

        // Show predicted result card
        resultPlaceholder.classList.add('hidden');
        resultDisplay.classList.remove('hidden');

        // Animate price display
        animatePriceNumber(predictionResult.predictedPrice, predictedPriceEl);

        // Populate explaining drivers
        populatePriceDrivers(predictionResult.drivers);

        // Setup benchmark visual comparison
        updateBenchmarkVisual(brand, predictionResult.predictedPrice);
    });

    resetBtn.addEventListener('click', () => {
        form.reset();
        modelSelect.innerHTML = '<option value="" disabled selected>Select Model</option>';
        modelSelect.disabled = true;
        variantSelect.innerHTML = '<option value="" disabled selected>Select Variant</option>';
        variantSelect.disabled = true;
        resultPlaceholder.classList.remove('hidden');
        resultDisplay.classList.add('hidden');
    });
}

// Core Prediction Math Engine
function runSinglePrediction(inputs) {
    const info = state.metadata.model_info;
    const coefs = info.coefficients;

    // 1. Calculate derived variables
    const ageOfCar = currentYear - inputs.year;
    const kmDrivenLog = Math.log(inputs.kmDriven);

    // Determine Brand Class: Low or High
    const brandClass = state.metadata.brand_classification.Low.includes(inputs.brand) ? 'Low' : 'High';

    // 2. Initialize log price with the intercept
    let priceLog = info.intercept;
    const drivers = [];

    // Auxiliary helper to add coefficients and record the driver log impact
    const applyCoefficient = (coefName, value, label, displayValue) => {
        if (coefs[coefName] !== undefined) {
            const impact = coefs[coefName] * value;
            priceLog += impact;
            drivers.push({
                name: label,
                value: displayValue,
                impact: impact,
                coef: coefs[coefName]
            });
        }
    };

    // Numerical columns (multiplied by value)
    applyCoefficient('Kilometers_Driven', inputs.kmDriven, 'Kilometers Driven (Linear)', `${inputs.kmDriven.toLocaleString()} km`);
    applyCoefficient('Kilometers_Driven_log', kmDrivenLog, 'Kilometers Driven (Log)', `${inputs.kmDriven.toLocaleString()} km`);
    applyCoefficient('Mileage', inputs.mileage, 'Fuel Mileage', `${inputs.mileage} kmpl`);
    applyCoefficient('Power', inputs.power, 'Engine Power', `${inputs.power} bhp`);
    applyCoefficient('Seats', inputs.seats, 'Seats', `${inputs.seats}`);
    applyCoefficient('Ageofcar', ageOfCar, 'Car Age', `${ageOfCar} years`);

    // Dummy Categorical Columns (added if present, reference categories are 0)
    // Reference Location is Ahmedabad (so Location_Ahmedabad is omitted)
    if (inputs.location !== 'Ahmedabad') {
        const key = `Location_${inputs.location}`;
        applyCoefficient(key, 1, `Location: ${inputs.location}`, inputs.location);
    }

    // Reference Fuel Type is CNG
    if (inputs.fuel !== 'CNG') {
        const key = `Fuel_Type_${inputs.fuel}`;
        applyCoefficient(key, 1, `Fuel: ${inputs.fuel}`, inputs.fuel);
    }

    // Reference Transmission is Automatic
    if (inputs.transmission !== 'Automatic') {
        const key = `Transmission_${inputs.transmission}`;
        applyCoefficient(key, 1, 'Transmission: Manual', 'Manual');
    }

    // Reference Owner Type is First
    if (inputs.owner !== 'First') {
        const key = `Owner_Type_${inputs.owner}`;
        applyCoefficient(key, 1, `Owner Type: ${inputs.owner}`, inputs.owner);
    }

    // Reference Brand Class is High
    if (brandClass !== 'High') {
        applyCoefficient('Brand_Class_Low', 1, 'Brand Segment: Economy', 'Economy');
    }

    // 3. Exponentiate to return final predicted price in Lakhs
    const predictedPrice = Math.exp(priceLog);

    return {
        predictedPrice: predictedPrice,
        priceLog: priceLog,
        drivers: drivers
    };
}

// Animate numbers for rich aesthetic feel
function animatePriceNumber(targetVal, element) {
    let startVal = 0;
    const duration = 800; // ms
    const startTime = performance.now();

    function updateNumber(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Easing out quadratic
        const easeProgress = progress * (2 - progress);

        const currentVal = startVal + (targetVal - startVal) * easeProgress;
        element.textContent = currentVal.toFixed(2);

        if (progress < 1) {
            requestAnimationFrame(updateNumber);
        } else {
            element.textContent = targetVal.toFixed(2);
        }
    }

    requestAnimationFrame(updateNumber);
}

// Populate explanatory items on predicted price
function populatePriceDrivers(drivers) {
    const listEl = document.getElementById('price-drivers-list');
    listEl.innerHTML = '';

    // Sort drivers by absolute impact to show key contributors first
    const sortedDrivers = [...drivers].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

    // Display top 4 drivers
    const topDrivers = sortedDrivers.slice(0, 4);

    topDrivers.forEach(driver => {
        const isPositive = driver.impact >= 0;
        // Convert log impact to percentage impact: percentage = (exp(impact) - 1) * 100
        const percentage = (Math.exp(driver.impact) - 1) * 100;

        if (Math.abs(percentage) < 1.0) return; // skip negligible drivers

        const item = document.createElement('div');
        item.className = `factor-item ${isPositive ? 'positive' : 'negative'}`;

        const labelContainer = document.createElement('div');
        labelContainer.className = 'factor-label';

        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', isPositive ? 'trending-up' : 'trending-down');
        labelContainer.appendChild(icon);

        const textSpan = document.createElement('span');
        textSpan.innerHTML = `<strong>${driver.name}</strong> (${driver.value})`;
        labelContainer.appendChild(textSpan);

        const valSpan = document.createElement('span');
        valSpan.className = 'factor-val';
        valSpan.textContent = `${isPositive ? '+' : ''}${percentage.toFixed(1)}%`;

        item.appendChild(labelContainer);
        item.appendChild(valSpan);
        listEl.appendChild(item);
    });

    initLucide();
}

// Update the Benchmark Visual display comparison
function updateBenchmarkVisual(brand, price) {
    const avgLabel = document.getElementById('compare-brand-class');
    const currentLabel = document.getElementById('compare-current');
    const fillEl = document.getElementById('compare-val-fill');
    const markerEl = document.getElementById('compare-avg-marker');
    const explanationEl = document.getElementById('compare-explanation');

    const model = document.getElementById('car-model').value || '';
    const variant = document.getElementById('car-variant').value || '';
    const carName = `${brand} ${model} ${variant}`.trim();

    // Let's find the historical brand average from the original CSV data
    const brandCars = state.rawData.filter(c => c._brand === brand);

    let brandAvgPrice = 0;
    if (brandCars.length > 0) {
        const validPriceCars = brandCars.filter(c => c.Price !== null && c.Price !== undefined);
        if (validPriceCars.length > 0) {
            brandAvgPrice = validPriceCars.reduce((sum, c) => sum + c.Price, 0) / validPriceCars.length;
        }
    }

    if (brandAvgPrice === 0) {
        // fallback to brand class median from metadata
        const brandClass = state.metadata.brand_classification.Low.includes(brand) ? 'Low' : 'High';
        brandAvgPrice = brandClass === 'Low' ? 4.5 : 24.0; // typical averages
    }

    avgLabel.textContent = `${brand} Average (₹${brandAvgPrice.toFixed(2)}L)`;
    currentLabel.textContent = `${carName} (₹${price.toFixed(2)}L)`;

    // Calculate slider percentages. Let's cap maximum price benchmark at 2x brand average
    const maxScale = brandAvgPrice * 2;
    const valPercent = Math.min((price / maxScale) * 100, 100);
    const avgPercent = (brandAvgPrice / maxScale) * 100;

    // Apply values to UI
    fillEl.style.width = `${valPercent}%`;
    markerEl.style.left = `${avgPercent}%`;

    const diffPercent = ((price - brandAvgPrice) / brandAvgPrice) * 100;
    if (diffPercent > 0) {
        explanationEl.textContent = `This ${carName} is valued ${diffPercent.toFixed(1)}% ABOVE the historical average for ${brand} listings, matching premium specs.`;
    } else {
        explanationEl.textContent = `This ${carName} is valued ${Math.abs(diffPercent).toFixed(1)}% BELOW the historical average for ${brand} listings, representing a potential discount.`;
    }
}

// 6. Batch Predictor Upload & Processing
function setupBatchPredictor() {
    const dropZone = document.getElementById('csv-drop-zone');
    const fileInput = document.getElementById('csv-file-input');
    const container = document.getElementById('batch-results-container');
    const downloadTemplateBtn = document.getElementById('download-template-btn');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const clearBtn = document.getElementById('clear-batch-btn');
    const searchInput = document.getElementById('table-search');

    let batchData = [];
    let batchPredicted = [];

    // Trigger click on file input
    dropZone.addEventListener('click', (e) => {
        if (e.target !== downloadTemplateBtn && !downloadTemplateBtn.contains(e.target)) {
            fileInput.click();
        }
    });

    // Drag-over styling
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            processCSVFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            processCSVFile(fileInput.files[0]);
        }
    });

    // Template download
    downloadTemplateBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent triggering upload file pick
        const csvContent = "data:text/csv;charset=utf-8,"
            + "Brand,Model,Variant,Location,Year,Kilometers_Driven,Fuel_Type,Transmission,Owner_Type,Mileage,Power,Seats\n"
            + "Maruti,Swift,VDI,Mumbai,2015,45000,Petrol,Manual,First,21.5,68.0,5\n"
            + "Audi,A4,New 2.0 TDI,Bangalore,2018,22000,Diesel,Automatic,First,15.2,148.0,5\n"
            + "Hyundai,Creta,1.6 CRDi,Kochi,2012,85000,Petrol,Manual,Second,18.9,83.0,5";

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "revvalue_batch_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // Handle CSV Process
    function processCSVFile(file) {
        Papa.parse(file, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => {
                batchData = results.data;
                runBatchPredictions();
            },
            error: (err) => {
                alert("Error parsing CSV: " + err.message);
            }
        });
    }

    // Process predictions for the entire CSV batch
    function runBatchPredictions() {
        if (batchData.length === 0) return;

        batchPredicted = [];

        batchData.forEach((row, idx) => {
            let brand = row.Brand;
            let model = row.Model;
            let variant = row.Variant;

            if (!brand && row.Name) {
                const parsed = parseCarName(row.Name);
                brand = parsed.brand;
                model = parsed.model;
                variant = parsed.variant;
            }

            brand = brand || 'Maruti';
            model = model || 'Generic';
            variant = variant || 'Standard';

            const location = row.Location || 'Mumbai';
            const year = parseInt(row.Year || 2015);
            const km = parseFloat(row.Kilometers_Driven || 50000);
            const fuel = row.Fuel_Type || 'Petrol';
            const trans = row.Transmission || 'Manual';
            const owner = row.Owner_Type || 'First';
            const mileage = parseFloat(row.Mileage || state.metadata.ranges.Mileage.median);
            const power = parseFloat(row.Power || state.metadata.ranges.Power.median);
            const seats = parseFloat(row.Seats || 5);

            const result = runSinglePrediction({
                brand, location, year, kmDriven: km, fuel, transmission: trans, owner, mileage, power, seats
            });

            batchPredicted.push({
                ...row,
                Brand: brand,
                Model: model,
                Variant: variant,
                Location: location,
                Year: year,
                Kilometers_Driven: km,
                Fuel_Type: fuel,
                Transmission: trans,
                Owner_Type: owner,
                Mileage: mileage,
                Power: power,
                Seats: seats,
                Predicted_Price: result.predictedPrice
            });
        });

        // Toggle visibility
        dropZone.classList.add('hidden');
        container.classList.remove('hidden');

        // Populate metrics and render table
        renderBatchTable(batchPredicted);
        updateBatchMetrics(batchPredicted);
    }

    // Populate predicted data table
    function renderBatchTable(data) {
        const tbody = document.getElementById('batch-table-body');
        tbody.innerHTML = '';

        data.forEach((row, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td><strong>${row.Brand}</strong></td>
                <td>${row.Model || '—'}</td>
                <td>${row.Variant || '—'}</td>
                <td>${row.Location}</td>
                <td>${row.Year}</td>
                <td>${row.Kilometers_Driven.toLocaleString()}</td>
                <td>${row.Fuel_Type}</td>
                <td>${row.Transmission}</td>
                <td>${row.Mileage.toFixed(1)}</td>
                <td>${row.Power.toFixed(0)} bhp</td>
                <td>${row.Seats}</td>
                <td class="highlight-col">₹${row.Predicted_Price.toFixed(2)}L</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Populate batch statistics summary
    function updateBatchMetrics(data) {
        document.getElementById('batch-row-count').textContent = data.length;

        const prices = data.map(d => d.Predicted_Price);
        const sum = prices.reduce((a, b) => a + b, 0);
        const avg = sum / prices.length;
        const max = Math.max(...prices);

        document.getElementById('batch-avg-price').textContent = `₹${avg.toFixed(2)}L`;
        document.getElementById('batch-max-price').textContent = `₹${max.toFixed(2)}L`;
    }

    // Search filter in table
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        const rows = document.querySelectorAll('#batch-table-body tr');

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(query) ? '' : 'none';
        });
    });

    // CSV exporter
    exportCsvBtn.addEventListener('click', () => {
        if (batchPredicted.length === 0) return;

        const csv = Papa.unparse(batchPredicted);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "revvalue_predictions.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // Clear batch
    clearBtn.addEventListener('click', () => {
        batchData = [];
        batchPredicted = [];
        fileInput.value = '';
        searchInput.value = '';
        dropZone.classList.remove('hidden');
        container.classList.add('hidden');
    });
}

// 7. Render Charts for Analytics (EDA) & Model Tabs
function renderAllCharts() {
    if (!state.metadata || state.rawData.length === 0) return;

    // Charts will only render if the tab is active to avoid sizing glitch
    if (state.activeTab === 'analytics-tab') {
        renderPriceYearChart();
        renderPriceDistChart();
        renderBrandClassChart();
        renderMileagePriceChart();
    } else if (state.activeTab === 'model-tab') {
        renderCoefficientsChart();
    }
}

// EDA Chart 1: Average Price by Year
function renderPriceYearChart() {
    const canvas = document.getElementById('chart-price-year');
    if (!canvas) return;

    if (state.charts.priceYear) {
        state.charts.priceYear.destroy();
    }

    // Group rawData by Year to compute Average Price
    const yearsMap = {};
    state.rawData.forEach(row => {
        if (row.Year && row.Price) {
            if (!yearsMap[row.Year]) {
                yearsMap[row.Year] = { sum: 0, count: 0 };
            }
            yearsMap[row.Year].sum += row.Price;
            yearsMap[row.Year].count += 1;
        }
    });

    const years = Object.keys(yearsMap).sort((a, b) => a - b);
    const avgPrices = years.map(y => yearsMap[y].sum / yearsMap[y].count);

    const ctx = canvas.getContext('2d');
    state.charts.priceYear = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [{
                label: 'Average Price (Lakhs)',
                data: avgPrices,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#a855f7',
                pointBorderColor: '#fff',
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' },
                    title: { display: true, text: 'Price (₹ Lakhs)', color: '#94a3b8' }
                }
            }
        }
    });
}

// EDA Chart 2: Price Frequency Distribution
function renderPriceDistChart() {
    const canvas = document.getElementById('chart-price-dist');
    if (!canvas) return;

    if (state.charts.priceDist) {
        state.charts.priceDist.destroy();
    }

    // Set bins: 0-2, 2-5, 5-10, 10-20, 20-40, 40+
    const bins = ['0-2L', '2-5L', '5-10L', '10-20L', '20-40L', '40L+'];
    const counts = [0, 0, 0, 0, 0, 0];

    state.rawData.forEach(row => {
        if (row.Price) {
            const p = row.Price;
            if (p <= 2) counts[0]++;
            else if (p <= 5) counts[1]++;
            else if (p <= 10) counts[2]++;
            else if (p <= 20) counts[3]++;
            else if (p <= 40) counts[4]++;
            else counts[5]++;
        }
    });

    const ctx = canvas.getContext('2d');
    state.charts.priceDist = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: bins,
            datasets: [{
                label: 'Listing Count',
                data: counts,
                backgroundColor: ['#475569', '#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#10b981'],
                borderWidth: 0,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' },
                    title: { display: true, text: 'Number of Cars', color: '#94a3b8' }
                }
            }
        }
    });
}

// EDA Chart 3: Brand Class Volume & Average Price Comparison
function renderBrandClassChart() {
    const canvas = document.getElementById('chart-brand-class');
    if (!canvas) return;

    if (state.charts.brandClass) {
        state.charts.brandClass.destroy();
    }

    let lowPriceSum = 0, lowCount = 0;
    let highPriceSum = 0, highCount = 0;

    const lowBrands = state.metadata.brand_classification.Low;
    const highBrands = state.metadata.brand_classification.High;

    state.rawData.forEach(row => {
        if (row.Name && row.Price) {
            const brand = row.Name.split(' ')[0];
            let mappedB = brand;
            if (brand === 'ISUZU') mappedB = 'Isuzu';
            else if (brand === 'Mini') mappedB = 'Mini Cooper';
            else if (brand === 'Land') mappedB = 'Land Rover';

            if (lowBrands.includes(mappedB)) {
                lowPriceSum += row.Price;
                lowCount++;
            } else if (highBrands.includes(mappedB)) {
                highPriceSum += row.Price;
                highCount++;
            }
        }
    });

    const avgLow = lowCount > 0 ? lowPriceSum / lowCount : 0;
    const avgHigh = highCount > 0 ? highPriceSum / highCount : 0;

    const ctx = canvas.getContext('2d');
    state.charts.brandClass = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Economy Segment', 'Premium/Luxury Segment'],
            datasets: [
                {
                    label: 'Average Price (Lakhs)',
                    data: [avgLow, avgHigh],
                    backgroundColor: '#a855f7',
                    yAxisID: 'yPrice',
                    borderRadius: 6
                },
                {
                    label: 'Volume (Listings)',
                    data: [lowCount, highCount],
                    backgroundColor: '#334155',
                    yAxisID: 'yVolume',
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a3b8' } }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                },
                yPrice: {
                    position: 'left',
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#a855f7' },
                    title: { display: true, text: 'Price (₹ Lakhs)', color: '#a855f7' }
                },
                yVolume: {
                    position: 'right',
                    grid: { display: false },
                    ticks: { color: '#94a3b8' },
                    title: { display: true, text: 'Number of Listings', color: '#94a3b8' }
                }
            }
        }
    });
}

// EDA Chart 4: Mileage vs Price Scatter
function renderMileagePriceChart() {
    const canvas = document.getElementById('chart-mileage-price');
    if (!canvas) return;

    if (state.charts.mileagePrice) {
        state.charts.mileagePrice.destroy();
    }

    // Sample 400 random cars to prevent crowding the scatter plot
    const sampleSize = 400;
    const sampled = [];
    const validData = state.rawData.filter(c => {
        // clean mileage string from csv
        if (!c.Mileage || !c.Price) return false;
        let mil = c.Mileage;
        if (typeof mil === 'string') {
            mil = parseFloat(mil.replace(' kmpl', '').replace(' km/g', ''));
        }
        return !isNaN(mil);
    });

    const shuffled = [...validData].sort(() => 0.5 - Math.random());
    const samples = shuffled.slice(0, Math.min(sampleSize, shuffled.length));

    const manualData = [];
    const automaticData = [];

    samples.forEach(c => {
        let mil = c.Mileage;
        if (typeof mil === 'string') {
            mil = parseFloat(mil.replace(' kmpl', '').replace(' km/g', ''));
        }
        const dataPoint = { x: mil, y: c.Price };
        if (c.Transmission === 'Manual') {
            manualData.push(dataPoint);
        } else {
            automaticData.push(dataPoint);
        }
    });

    const ctx = canvas.getContext('2d');
    state.charts.mileagePrice = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Automatic',
                    data: automaticData,
                    backgroundColor: '#ef4444',
                    pointRadius: 4
                },
                {
                    label: 'Manual',
                    data: manualData,
                    backgroundColor: '#10b981',
                    pointRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a3b8' } }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' },
                    title: { display: true, text: 'Mileage (kmpl / km/g)', color: '#94a3b8' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' },
                    title: { display: true, text: 'Price (₹ Lakhs)', color: '#94a3b8' }
                }
            }
        }
    });
}

// 8. Populate Model tab coefficients horizontal bar chart
function renderCoefficientsChart() {
    const canvas = document.getElementById('chart-coefficients');
    if (!canvas) return;

    if (state.charts.coefs) {
        state.charts.coefs.destroy();
    }

    const coefs = state.metadata.model_info.coefficients;
    const sortedKeys = Object.keys(coefs).sort((a, b) => coefs[b] - coefs[a]);
    const values = sortedKeys.map(k => coefs[k]);

    // Create label aliases for cleaner appearance
    const labels = sortedKeys.map(k => {
        if (coefficientDescriptions[k]) {
            return coefficientDescriptions[k].name;
        }
        return k.replace('Location_', 'Loc: ').replace('Fuel_Type_', 'Fuel: ').replace('Owner_Type_', 'Owner: ').replace('_', ' ');
    });

    // Colors: Green for positive weights, Red for negative weights
    const colors = values.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.75)' : 'rgba(244, 63, 94, 0.75)');

    const ctx = canvas.getContext('2d');
    state.charts.coefs = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' },
                    title: { display: true, text: 'Coefficient Value (Impact on Log Price)', color: '#94a3b8' }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 9 } }
                }
            }
        }
    });
}

// 9. Populate Model train/test statistics and explanation details
function populateModelStats() {
    if (!state.metadata) return;

    const metrics = state.metadata.model_info.metrics;

    // Train column
    document.getElementById('metric-train-r2').textContent = (metrics.Train.R2 * 100).toFixed(1) + '%';
    document.getElementById('metric-train-rmse').textContent = metrics.Train.RMSE.toFixed(3) + ' Lakhs';
    document.getElementById('metric-train-mae').textContent = metrics.Train.MAE.toFixed(3) + ' Lakhs';
    document.getElementById('metric-train-mape').textContent = metrics.Train.MAPE.toFixed(1) + '%';

    // Test column
    document.getElementById('metric-test-r2').textContent = (metrics.Test.R2 * 100).toFixed(1) + '%';
    document.getElementById('metric-test-rmse').textContent = metrics.Test.RMSE.toFixed(3) + ' Lakhs';
    document.getElementById('metric-test-mae').textContent = metrics.Test.MAE.toFixed(3) + ' Lakhs';
    document.getElementById('metric-test-mape').textContent = metrics.Test.MAPE.toFixed(1) + '%';

    // Coefficients Table Dictionary
    const tbody = document.getElementById('coef-dict-tbody');
    tbody.innerHTML = '';

    const coefs = state.metadata.model_info.coefficients;
    const sortedKeys = Object.keys(coefs).sort((a, b) => Math.abs(coefs[b]) - Math.abs(coefs[a]));

    sortedKeys.forEach(k => {
        const tr = document.createElement('tr');
        const weight = coefs[k];
        const isPositive = weight >= 0;

        const descriptionObj = coefficientDescriptions[k] || { name: k, desc: 'Model specific regression variable.' };

        tr.innerHTML = `
            <td><strong>${descriptionObj.name}</strong> <br><small style="color:var(--text-dark)">${k}</small></td>
            <td style="font-family:monospace; font-weight:600; color:${isPositive ? 'var(--success)' : 'var(--danger)'}">${weight.toFixed(5)}</td>
            <td>
                <span class="factor-badge" style="
                    padding:4px 8px; 
                    border-radius:4px; 
                    font-size:0.75rem; 
                    font-weight:600; 
                    background-color:${isPositive ? 'var(--success-bg)' : 'var(--danger-bg)'}; 
                    color:${isPositive ? 'var(--success)' : 'var(--danger)'}
                ">
                    ${isPositive ? 'INCREASES Price' : 'DEPRECIATES Price'}
                </span>
            </td>
            <td style="color:var(--text-muted); font-size:0.85rem">${descriptionObj.desc}</td>
        `;
        tbody.appendChild(tr);
    });
}
