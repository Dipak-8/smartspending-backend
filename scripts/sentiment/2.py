import os
import json
import joblib
import re
import string
from sklearn.feature_extraction.text import TfidfVectorizer
import numpy as np
from collections import Counter

# Get absolute path to the directory of this script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Load models and reviews using absolute paths
model_path = os.path.join(BASE_DIR, "model.pkl")
vectorizer_path = os.path.join(BASE_DIR, "vectorizer.pkl")
reviews_path = os.path.join(BASE_DIR, "reviews.json")

# Load model and vectorizer
model = joblib.load(model_path)
vectorizer = joblib.load(vectorizer_path)

# Load reviews from file
with open(reviews_path, "r", encoding="utf-8") as f:
    data = json.load(f)

reviews = list(data.values())[0]

# Preprocess function to clean text
def clean_text(text):
    text = text.lower()
    text = re.sub(r'<.*?>', '', text)
    text = re.sub(r'\d+', '', text)
    text = text.translate(str.maketrans('', '', string.punctuation))
    text = re.sub(r'\s+', ' ', text).strip()
    return text

# Clean all reviews
cleaned_reviews = [clean_text(r) for r in reviews]
X = vectorizer.transform(cleaned_reviews)

# Predict sentiment of each review
predictions = model.predict(X)

# Function to aggregate sentiments with weighted scoring
def aggregate_sentiments(predictions):
    positive = np.count_nonzero(predictions == 2)
    neutral = np.count_nonzero(predictions == 1)
    negative = np.count_nonzero(predictions == 0)

    total = len(predictions)

    if total == 0:
        return {"Positive": 0.0, "Neutral": 0.0, "Negative": 0.0}

    # Dynamic adjustment based on distribution
    neutral_weight = 0.8 if neutral / total > 0.35 else 0.9
    positive_weight = 1.3 if positive / total < 0.55 else 1.2
    negative_weight = 0.8

    weighted_positive = positive * positive_weight
    weighted_neutral = neutral * neutral_weight
    weighted_negative = negative * negative_weight

    total_weighted = weighted_positive + weighted_neutral + weighted_negative

    return {
        "Positive": round((weighted_positive / total_weighted) * 100, 1),
        "Neutral": round((weighted_neutral / total_weighted) * 100, 1),
        "Negative": round((weighted_negative / total_weighted) * 100, 1)
    }

# Aggregate the sentiment predictions
result = aggregate_sentiments(predictions)

# Output result as JSON
print(json.dumps(result))
