import pandas as pd
import numpy as np
import statsmodels.api as sm
from sklearn.model_selection import train_test_split
import re
import json
import math
import os

def rmse(predictions, targets):
    return np.sqrt(((targets - predictions) ** 2).mean())

def mape(predictions, targets):
    return np.mean(np.abs((targets - predictions)) / targets) * 100

def mae(predictions, targets):
    return np.mean(np.abs((targets - predictions)))

def main():
    # Load dataset
    data_path = "used_cars_data.csv"
    if not os.path.exists(data_path):
        print(f"Error: {data_path} not found.")
        return
        
    df = pd.read_csv(data_path, index_col=0)
    cars = df.copy()
    
    # 1. Clean Name and drop missing Name/Model
    cars = cars.dropna(subset=['Name'])
    cars['Brand'] = cars['Name'].str.split(' ').str[0]
    # Handle the Model extraction as in the notebook
    cars['Model'] = cars['Name'].str.split(' ').str[1] + cars['Name'].str.split(' ').str[2]
    cars.dropna(subset=['Model'], axis=0, inplace=True)
    
    # 2. Fix typos in brand names
    cars.loc[cars.Brand == 'ISUZU', 'Brand'] = 'Isuzu'
    cars.loc[cars.Brand == 'Mini', 'Brand'] = 'Mini Cooper'
    cars.loc[cars.Brand == 'Land', 'Brand'] = 'Land Rover'
    
    # 3. Parse New_Price column
    new_price_num = []
    regex_power = r"^\d+(\.\d+)? Lakh$"
    for observation in cars["New_Price"]:
        if isinstance(observation, str):
            if re.match(regex_power, observation.strip()):
                new_price_num.append(float(observation.strip().split(" ")[0]))
            else:
                new_price_num.append(np.nan)
        else:
            new_price_num.append(np.nan)
    cars['new_price_num'] = new_price_num
    
    # Fill missing new_price_num with brand median
    cars['new_price_num'] = cars.groupby(['Brand'])['new_price_num'].transform(lambda x: x.fillna(x.median()))
    cars.drop(['New_Price'], axis=1, inplace=True)
    
    # 4. Clean Mileage, Engine, Power
    cars["Mileage"] = cars["Mileage"].str.rstrip(" kmpl").str.rstrip(" km/g").astype(float)
    cars["Engine"] = cars["Engine"].str.rstrip(" CC").astype(float)
    cars["Power"] = cars["Power"].str.rstrip(" bhp").replace(regex="null", value=np.nan).astype(float)
    
    # Fill remaining missing Power, Mileage, Engine with median
    cols1 = ["Power", "Mileage", "Engine"]
    for ii in cols1:
        cars[ii] = cars[ii].fillna(cars[ii].median())
        
    # Drop rows with remaining nulls (Price or Seats)
    cars.dropna(inplace=True, axis=0)
    
    # Convert Engine to int
    cars['Engine'] = cars['Engine'].astype(int)
    
    # 5. Classify Brands
    Low = ['Maruti', 'Hyundai', 'Ambassdor', 'Hindustan', 'Force', 'Chevrolet', 'Fiat', 'Tata', 'Smart', 'Renault', 'Datsun', 'Mahindra', 'Skoda', 'Ford', 'Toyota', 'Isuzu', 'Mitsubishi', 'Honda']
    High = ['Audi', 'Mini Cooper', 'Bentley', 'Mercedes-Benz', 'Lamborghini', 'Volkswagen', 'Porsche', 'Land Rover', 'Nissan', 'Volvo', 'Jeep', 'Jaguar', 'BMW']
    
    def classrange(x):
        if x in Low:
            return "Low"
        elif x in High:
            return "High"
        else:
            return x
            
    cars['Brand_Class'] = cars['Brand'].apply(lambda x: classrange(x))
    
    # 6. Age of car
    cars['Current_year'] = 2020
    cars['Ageofcar'] = cars['Current_year'] - cars['Year']
    cars.drop('Current_year', axis=1, inplace=True)
    
    # Save statistics before modifying dataframe for training
    statistics = {
        "ranges": {
            "Kilometers_Driven": {"min": float(cars["Kilometers_Driven"].min()), "max": float(cars["Kilometers_Driven"].max()), "median": float(cars["Kilometers_Driven"].median()), "mean": float(cars["Kilometers_Driven"].mean())},
            "Mileage": {"min": float(cars["Mileage"].min()), "max": float(cars["Mileage"].max()), "median": float(cars["Mileage"].median()), "mean": float(cars["Mileage"].mean())},
            "Engine": {"min": int(cars["Engine"].min()), "max": int(cars["Engine"].max()), "median": int(cars["Engine"].median()), "mean": int(cars["Engine"].mean())},
            "Power": {"min": float(cars["Power"].min()), "max": float(cars["Power"].max()), "median": float(cars["Power"].median()), "mean": float(cars["Power"].mean())},
            "Seats": {"min": float(cars["Seats"].min()), "max": float(cars["Seats"].max()), "median": float(cars["Seats"].median()), "mean": float(cars["Seats"].mean())},
            "Ageofcar": {"min": int(cars["Ageofcar"].min()), "max": int(cars["Ageofcar"].max()), "median": int(cars["Ageofcar"].median()), "mean": int(cars["Ageofcar"].mean())},
            "Price": {"min": float(cars["Price"].min()), "max": float(cars["Price"].max()), "median": float(cars["Price"].median()), "mean": float(cars["Price"].mean())}
        },
        "categories": {
            "Location": sorted(cars["Location"].unique().tolist()),
            "Fuel_Type": sorted(cars["Fuel_Type"].unique().tolist()),
            "Transmission": sorted(cars["Transmission"].unique().tolist()),
            "Owner_Type": sorted(cars["Owner_Type"].unique().tolist()),
            "Brand": sorted(cars["Brand"].unique().tolist())
        },
        "brand_classification": {
            "Low": Low,
            "High": High
        }
    }
    
    # 7. Log transform
    cars['Kilometers_Driven_log'] = np.log(cars['Kilometers_Driven'])
    cars['Price_log'] = np.log(cars['Price'])
    
    # 8. Drop unused features
    cars.drop(['Name', 'Model', 'Year', 'Brand', 'new_price_num'], axis=1, inplace=True)
    
    # 9. Prepare features and target
    X = cars.drop(["Price", "Price_log"], axis=1)
    y = cars[["Price_log", "Price"]]
    
    # One-hot encoding (get_dummies)
    X = pd.get_dummies(
        X,
        columns=X.select_dtypes(include=["object", "category"]).columns.tolist(),
        drop_first=True,
    )
    
    # 10. Split train/test (70/30)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
    
    # Add constant
    X_train = sm.add_constant(X_train)
    X_test = sm.add_constant(X_test)
    
    # Ensure floats
    X_train = X_train.astype(float)
    X_test = X_test.astype(float)
    
    # Drop Engine from features
    X_train1 = X_train.drop(['Engine'], axis=1)
    X_test1 = X_test.drop(['Engine'], axis=1)
    
    # Fit OLS
    olsmodel2 = sm.OLS(y_train["Price_log"], X_train1).fit()
    
    # Make predictions
    y_pred_train_pricelog = olsmodel2.predict(X_train1)
    y_pred_train_Price = y_pred_train_pricelog.apply(math.exp)
    y_train_Price = y_train["Price"]
    
    y_pred_test_pricelog = olsmodel2.predict(X_test1)
    y_pred_test_Price = y_pred_test_pricelog.apply(math.exp)
    y_test_Price = y_test["Price"]
    
    # Calculate performance metrics
    metrics = {
        "Train": {
            "R2": float(olsmodel2.rsquared),
            "Adj_R2": float(olsmodel2.rsquared_adj),
            "RMSE": float(rmse(y_pred_train_Price, y_train_Price)),
            "MAE": float(mae(y_pred_train_Price, y_train_Price)),
            "MAPE": float(mape(y_pred_train_Price, y_train_Price))
        },
        "Test": {
            "RMSE": float(rmse(y_pred_test_Price, y_test_Price)),
            "MAE": float(mae(y_pred_test_Price, y_test_Price)),
            "MAPE": float(mape(y_pred_test_Price, y_test_Price))
        }
    }
    
    # Test R2
    ss_res = ((y_test["Price_log"] - y_pred_test_pricelog) ** 2).sum()
    ss_tot = ((y_test["Price_log"] - y_test["Price_log"].mean()) ** 2).sum()
    metrics["Test"]["R2"] = float(1 - (ss_res / ss_tot))
    
    # Coefficients mapping
    coefficients = olsmodel2.params.to_dict()
    
    # Combine everything for metadata
    metadata = {
        "model_info": {
            "algorithm": "Ordinary Least Squares (OLS) Linear Regression",
            "dependent_variable": "Price_log",
            "intercept": float(coefficients.pop("const")),
            "coefficients": coefficients,
            "metrics": metrics
        },
        "ranges": statistics["ranges"],
        "categories": statistics["categories"],
        "brand_classification": statistics["brand_classification"]
    }
    
    # Write to model_metadata.json
    output_path = "model_metadata.json"
    with open(output_path, "w") as f:
        json.dump(metadata, f, indent=4)
        
    print(f"Model trained successfully. Coefficients and metadata saved to {output_path}.")
    print("Train Metrics:", metrics["Train"])
    print("Test Metrics:", metrics["Test"])

if __name__ == "__main__":
    main()
