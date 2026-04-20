import sys
import json
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

def get_recommendations(completed_titles, all_materials):
    if not completed_titles:
        # If user has done nothing, suggest the easiest items
        return sorted(all_materials, key=lambda x: x['difficulty_level'])[:2]

    # NLP Logic: Compare titles using TF-IDF and Cosine Similarity
    titles = [m['title'] for m in all_materials]
    vectorizer = TfidfVectorizer()
    tfidf_matrix = vectorizer.fit_transform(titles)
    
    # Calculate similarity between all items and the last completed item
    last_done_idx = titles.index(completed_titles[-1])
    cosine_sim = cosine_similarity(tfidf_matrix[last_done_idx], tfidf_matrix)
    
    # Get indices of items sorted by similarity (excluding the one just done)
    sim_scores = list(enumerate(cosine_sim[0]))
    sim_scores = sorted(sim_scores, key=lambda x: x[1], reverse=True)
    
    recommended_indices = [i[0] for i in sim_scores if titles[i[0]] not in completed_titles][:2]
    
    return [all_materials[i] for i in recommended_indices]

# Updated logic for your Python engine
def analyze_weakness(user_performance):
    recommendations = []
    for entry in user_performance:
        mark = entry['quiz_mark']
        
        if mark < 60:
            # Logic: If mark is low, suggest more time
            time_needed = (100 - mark) * 2  # Simple formula: lower mark = more time
            recommendations.append({
                "topic": entry['title'],
                "status": "Weakness Detected",
                "time_required": f"{time_needed} mins",
                "priority": "High"
            })
    return recommendations

def predict_study_time(difficulty_level, user_history):
    # If no history, assume 10 mins per difficulty level
    if not user_history:
        return difficulty_level * 10
    
    # Calculate average pace: total_time / total_difficulty
    total_time = sum(h['time_spent'] for h in user_history)
    total_diff = sum(h['difficulty'] for h in user_history)
    
    pace = total_time / total_diff
    
    # Prediction: difficulty * pace
    prediction = round(difficulty_level * pace)
    return prediction

if __name__ == "__main__":
    # Data passed from Node.js via stdin
    input_data = json.loads(sys.stdin.read())
    completed = input_data['completed']
    materials = input_data['materials']
    
    results = get_recommendations(completed, materials)
    print(json.dumps(results))
