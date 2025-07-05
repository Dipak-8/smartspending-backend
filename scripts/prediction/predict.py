import sys
import json
import numpy as np
import pickle
import os
from datetime import datetime, timedelta
import pandas as pd
import xgboost as xgb
import matplotlib.pyplot as plt  # Added for plotting

# Constants
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
NUM_STEPS = 12  # Number of time steps to predict (matches training)

# Load the models, scaler, and step_days
try:
    models = []
    for step in range(NUM_STEPS):
        model_path = os.path.join(SCRIPT_DIR, f"price_prediction_model_step_{step}.json")
        booster = xgb.Booster()
        booster.load_model(model_path)
        model = xgb.XGBRegressor()
        model._Booster = booster
        models.append(model)
    with open(os.path.join(SCRIPT_DIR, "scaler.pkl"), "rb") as scaler_file:
        scaler = pickle.load(scaler_file)
    with open(os.path.join(SCRIPT_DIR, "step_days.pkl"), "rb") as step_days_file:
        step_days = pickle.load(step_days_file)
except Exception as e:
    print(json.dumps({"success": False, "error": f"Failed to load models, scaler, or step_days: {str(e)}"}))
    sys.exit(1)

def prepare_features(price_history, current_price):
    if not price_history or len(price_history) < 3:
        return None, None, None, None, None

    # Sort price history by date
    price_history.sort(key=lambda p: datetime.strptime(p["x"], "%Y-%m-%d"))
    prices = [point["y"] for point in price_history]
    dates = [datetime.strptime(point["x"], "%Y-%m-%d") for point in price_history]

    # Extract features
    last_price = prices[-1]
    mean_price = np.mean(prices[-3:])
    min_price = np.min(prices)
    max_price = np.max(prices)
    std_dev = np.std(prices) if len(prices) > 1 else 0.0

    rolling_mean = np.mean(prices[-6:]) if len(prices) >= 6 else np.mean(prices)
    rolling_std = np.std(prices[-6:]) if len(prices) >= 6 else std_dev
    rolling_std = rolling_std * 2

    price_to_mean_ratio = current_price / mean_price if mean_price != 0 else 1.0

    latest_date = dates[-1]
    month = latest_date.month
    days_since_last_change = (latest_date - dates[-2]).days if len(dates) > 1 else 0

    if len(prices) > 1:
        price_changes = np.diff(prices)
        day_diffs = [(dates[j+1] - dates[j]).days for j in range(len(dates)-1)]
        day_diffs = np.array([d if d > 0 else 1 for d in day_diffs])
        price_trend = np.mean(price_changes / day_diffs)
        if not np.isfinite(price_trend):
            price_trend = 0.0
    else:
        price_trend = 0.0

    if len(prices) >= 3:
        recent_changes = np.diff(prices[-3:])
        recent_day_diffs = [(dates[-j] - dates[-j-1]).days for j in range(1, 3)]
        recent_day_diffs = np.array([d if d > 0 else 1 for d in recent_day_diffs])
        recent_price_trend = np.mean(recent_changes / recent_day_diffs) * 2
        if not np.isfinite(recent_price_trend):
            recent_price_trend = 0.0
    else:
        recent_price_trend = price_trend * 2

    if len(prices) > 1:
        total_days = (dates[-1] - dates[0]).days
        total_days = max(total_days, 1)
        long_term_trend = (prices[-1] - prices[0]) / total_days * 2
        if not np.isfinite(long_term_trend):
            long_term_trend = 0.0
    else:
        long_term_trend = 0.0

    price_volatility = np.std(np.diff(prices)) if len(prices) > 1 else 0.0
    price_volatility = price_volatility * 2
    if not np.isfinite(price_volatility):
        price_volatility = 0.0

    if len(prices) >= 3:
        recent_fluctuation_amplitude = np.max(prices[-3:]) - np.min(prices[-3:])
    else:
        recent_fluctuation_amplitude = 0.0
    if not np.isfinite(recent_fluctuation_amplitude):
        recent_fluctuation_amplitude = 0.0

    recent_volatility = np.std(np.diff(prices[-6:])) if len(prices) >= 6 else price_volatility
    if not np.isfinite(recent_volatility):
        recent_volatility = 0.0
    stability_score = 1 / (1 + recent_volatility) * 3
    if not np.isfinite(stability_score):
        stability_score = 1.0

    trend_direction = 0
    if recent_price_trend > 0:
        trend_direction = 1
    elif recent_price_trend < 0:
        trend_direction = -1

    if len(prices) >= 6:
        recent_volatilities = [np.std(np.diff(prices[-k:])) for k in range(3, 7)]
        recent_volatilities = [v if np.isfinite(v) else 0.0 for v in recent_volatilities]
        mean_price_window = np.mean(prices[-6:])
        time_since_stabilization = sum(1 for v in recent_volatilities if v < 0.01 * mean_price_window)
    else:
        time_since_stabilization = 0

    # Create feature array
    feature_array = np.array([[
        current_price, last_price, mean_price, min_price, max_price, std_dev, rolling_mean, rolling_std,
        price_to_mean_ratio, month, days_since_last_change, price_trend, recent_price_trend, long_term_trend,
        price_volatility, stability_score, trend_direction, time_since_stabilization, recent_fluctuation_amplitude
    ]])
    feature_names = [
        'current_price', 'last_price', 'mean_price', 'min_price', 'max_price', 'std_dev', 'rolling_mean', 'rolling_std',
        'price_to_mean_ratio', 'month', 'days_since_last_change', 'price_trend', 'recent_price_trend', 'long_term_trend',
        'price_volatility', 'stability_score', 'trend_direction', 'time_since_stabilization', 'recent_fluctuation_amplitude'
    ]
    feature_df = pd.DataFrame(feature_array, columns=feature_names)
    scaled_features = scaler.transform(feature_df)
    return scaled_features, latest_date, stability_score, time_since_stabilization, trend_direction

def main():
    try:
        # Read input data
        input_data = sys.stdin.read()
        data = json.loads(input_data)

        price_history = data.get("priceHistory", [])
        current_price = float(data.get("currentPrice", 0))

        # Prepare features
        scaled_features, latest_date, stability_score, time_since_stabilization, trend_direction = prepare_features(price_history, current_price)
        if scaled_features is None:
            print(json.dumps({"success": False, "error": "Invalid price history"}))
            return

        # Predict for each time step
        predictions = []
        for step in range(NUM_STEPS):
            # Predict the price for this time step
            predicted_price = models[step].predict(scaled_features)[0]
            predicted_price = np.expm1(predicted_price)  # Reverse log1p transformation
            predicted_price = float(predicted_price)

            # Apply smoothing
            if stability_score > 0.6 or time_since_stabilization >= 1:
                smoothing_factor = 0.95
                predicted_price = (smoothing_factor * current_price) + ((1 - smoothing_factor) * predicted_price)

            # Cap the predicted change
            if trend_direction != 0:
                max_change_ratio = 0.03  # ±3% cap
                lower_bound = current_price * (1 - max_change_ratio)
                upper_bound = current_price * (1 + max_change_ratio)
                predicted_price = max(min(predicted_price, upper_bound), lower_bound)

            # Calculate the corresponding date
            days_ahead = step_days[step]
            predicted_date = latest_date + timedelta(days=days_ahead)
            predicted_date_str = predicted_date.strftime("%Y-%m-%d")

            # Add to predictions list
            predictions.append({
                "date": predicted_date_str,
                "price": round(predicted_price, 2)
            })

        # Sort predictions by date (just in case)
        predictions.sort(key=lambda x: x["date"])

        # Output the result
        result = {
            "success": True,
            "predictions": predictions
        }
        print(json.dumps(result))

        # Plotting section with error handling
        try:
            # Prepare data for plotting
            hist_dates = [datetime.strptime(p["x"], "%Y-%m-%d") for p in price_history]
            hist_prices = [p["y"] for p in price_history]
            pred_dates = [datetime.strptime(p["date"], "%Y-%m-%d") for p in predictions]
            pred_prices = [p["price"] for p in predictions]

            # Define output directory
            output_dir = os.path.join(SCRIPT_DIR, "plots")
            os.makedirs(output_dir, exist_ok=True)

            # 1. Plot Price History
            plt.figure(figsize=(10, 6))
            plt.plot(hist_dates, hist_prices, 'b-', label='Historical Prices')
            plt.title('Price History')
            plt.xlabel('Date')
            plt.ylabel('Price')
            plt.legend()
            plt.grid(True)
            plt.xticks(rotation=45)
            plt.tight_layout()
            hist_path = os.path.join(output_dir, 'price_history.png')
            plt.savefig(hist_path)
            plt.close()
            print(f"Price history plot saved to: {hist_path}")

            # 2. Plot 1-Month Prediction
            plt.figure(figsize=(10, 6))
            plt.plot(pred_dates, pred_prices, 'r-', label='Predicted Prices')
            plt.title('1-Month Price Prediction')
            plt.xlabel('Date')
            plt.ylabel('Price')
            plt.legend()
            plt.grid(True)
            plt.xticks(rotation=45)
            plt.tight_layout()
            pred_path = os.path.join(output_dir, 'price_prediction.png')
            plt.savefig(pred_path)
            plt.close()
            print(f"Prediction plot saved to: {pred_path}")

            # 3. Combined Plot
            plt.figure(figsize=(12, 6))
            plt.plot(hist_dates, hist_prices, 'b-', label='Historical Prices')
            plt.plot(pred_dates, pred_prices, 'r-', label='Predicted Prices')
            plt.title('Price History and 1-Month Prediction')
            plt.xlabel('Date')
            plt.ylabel('Price')
            plt.legend()
            plt.grid(True)
            plt.xticks(rotation=45)
            plt.tight_layout()
            combined_path = os.path.join(output_dir, 'combined_price_plot.png')
            plt.savefig(combined_path)
            plt.close()
            print(f"Combined plot saved to: {combined_path}")

        except Exception as plot_error:
            print(f"Warning: Failed to generate plots: {str(plot_error)}")

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    main()