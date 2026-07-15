# Used Car Price Prediction & Dashboard

A Python machine learning pipeline and interactive web dashboard to analyze used car prices in India and predict their resale value using OLS (Ordinary Least Squares) linear regression.

## Project Overview

Pricing a used car is complex since it depends on a mix of numeric specs (age, mileage, power) and categorical features (brand tier, location, transmission, fuel type). This project provides:
1. A Python script (`train_model.py`) that cleans the raw data, runs an OLS regression using `statsmodels`, and exports the model parameters and statistics to a JSON metadata file.
2. A pure client-side web application (`/dashboard`) that loads the model parameters, calculates predictions in real-time, visualizes price drivers, and displays exploratory data analysis charts.

## How the Model Works

### 1. Data Cleaning & Feature Engineering
Before fitting the regression model, the dataset is cleaned and prepared as follows:
* **Feature Extraction**: Strips text units from fields like `Mileage` (removing 'kmpl'), `Engine` (removing 'CC'), and `Power` (removing 'bhp') to convert them into numeric features.
* **Missing Data Imputation**: Fills missing values for power, mileage, and engine size using the median value of that specific car brand.
* **Log Transforms**: Applies log-transformations to `Kilometers_Driven` and the target variable `Price`. This handles skewness and models diminishing marginal depreciation (e.g., the steep price drop during the first few thousand kilometers).
* **Brand Categorization**: Classifies car brands into "High" (luxury brands like BMW, Mercedes-Benz, Porsche) and "Low" (economy brands like Maruti, Hyundai, Tata) to capture brand equity as a binary category.
* **Car Age**: Computes `Ageofcar` by subtracting the model year from 2020 (the dataset year) during training to learn the correct depreciation rate, and from the current year (e.g., 2026) in the dashboard during predictions.
* **Feature Selection**: Drops the `Engine` displacement variable to prevent multi-collinearity, as it is highly correlated with `Power` (bhp).

### 2. Model Performance
The regression model is trained on a 70/30 train-test split of the 5,831 car records:

| Dataset | R² Score | RMSE (Lakh) | MAE (Lakh) | MAPE |
| :--- | :---: | :---: | :---: | :---: |
| **Train Set** | 89.8% | 5.48 | 2.17 | 22.1% |
| **Test Set** | 88.7% | 5.74 | 2.28 | 22.7% |

### 3. Key Findings (Coefficients)
Since the model is log-linear ($\log(\text{Price}) = \beta_0 + \sum \beta_i X_i$), we can interpret the coefficients as percentage impacts:
* **Depreciation**: Every year of age decreases a car's valuation by approximately **11.6%**.
* **Transmission**: Manual transmission cars are valued about **21.5%** lower than automatic equivalents.
* **Brand Class**: Economy/mass-market brand cars have a baseline price **22.6%** lower than luxury brand cars.
* **Fuel Type**: Diesel cars carry a **24.0%** premium over CNG vehicles, while petrol cars are priced **5.8%** lower than CNG.
* **Location**: Cars in Bangalore (+10.8%) and Hyderabad (+8.9%) command a premium, while Kolkata (-27.8%) has the steepest regional discount.

## Dashboard Features

The dashboard is built using standard HTML, CSS, and Javascript. It runs entirely client-side without needing a database or a backend server, executing the regression formula directly in the browser.

* **Single Predictor**: Fill out a form (brand, model, location, mileage, engine power, fuel type, etc.) to get an instant price valuation.
* **Price Drivers**: Visualizes which characteristics of your car positively or negatively affected the price (e.g., brand tier adding value, or manual transmission reducing it).
* **Batch Predictions**: Upload a CSV of multiple cars to run predictions in bulk, and download the annotated file.
* **Data Insights**: Visualizes overall dataset trends (Price vs. Power, Mileage distributions, Location analysis, and brand comparison charts).
* **Model Parameters**: Tabulates the raw coefficients, standard errors, and intercepts calculated by statsmodels.

## Repository Structure

```
├── dashboard/               # Frontend web app (index.html, styles.css, app.js)
├── used_cars_data.csv       # Raw dataset containing 5,831 records
├── train_model.py           # Python pipeline to preprocess and train the model
├── model_metadata.json      # Saved regression weights and categories for dashboard
└── README.md                # Project documentation
```

## Running Locally

### 1. Requirements
Install the Python dependencies to run the training script:
```bash
pip install pandas numpy statsmodels scikit-learn
```

### 2. Train the Model
Run the Python script to preprocess the raw data, fit the OLS regression model, print performance metrics, and output the weights to `model_metadata.json`:
```bash
python train_model.py
```

### 3. Open the Dashboard
Since the dashboard uses Javascript `fetch()` to load the CSV and model metadata files locally, browsers will block these requests if you open `dashboard/index.html` directly from your file system (`file://`).

You must run a simple HTTP server from the root directory:

**Using Python:**
```bash
python -m http.server 8000
```

**Using Node.js:**
```bash
npx serve .
```

After starting the server, go to `http://localhost:8000/dashboard/` in your web browser.
